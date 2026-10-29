// Auditoría + Reporte: busca cada nombre en MARCanet como titular y como apoderado, junta todas sus marcas
// y consulta el estatus actual de cada una. Todo se guarda solo en la auditoría (no crea marcas en la app).
import type { PrismaClient } from "@prisma/client";
import { listarNombres, marcasDeFila, type Como, type FilaNombre, type MarcaEncontrada } from "./busqueda-nombre";
import { consultarMarcanet, esperar, MarcanetCuotaError, type ExpedienteMarcanet } from "./consulta";
import { tipoDesdeImpi, ultimaActualizacion } from "./sincronizar";
import { analizarContestaciones, analizarDDU, analizarRenovacion, limiteOficio, vigenciaDe, type Juicio } from "../cumplimiento";
import { sumarMeses } from "../plazos";

export type MarcaAuditada = Omit<MarcaEncontrada, "nombreImpi"> & {
  encontradaComo: { como: Como; nombre: string }[];
  estatus: string; // explicado para el cliente
  tono: "verde" | "azul" | "ambar" | "rojo" | "gris";
  ultimo: { fecha: string; texto: string } | null;
  fechaPresentacion: string | null;
  fechaConcesion: string | null;
  vigencia: string | null;
  enApp: { id: string; clienteId: string } | null;
  error?: string;
  /** GANADA (registrada) · PROCESO · PERDIDA (abandonada, negada o vencida) */
  categoria?: "GANADA" | "PROCESO" | "PERDIDA";
  ddu?: Juicio | null;
  renovacion?: Juicio | null;
  contestaciones?: Juicio[];
};

/** Categoría para agrupar el reporte (las auditorías anteriores no la traen: se deduce del color). */
export const categoriaDe = (m: MarcaAuditada) => m.categoria ?? (m.tono === "verde" ? "GANADA" : m.tono === "gris" || /vencid|negad/i.test(m.estatus) ? "PERDIDA" : "PROCESO");

export type ResultadoAuditoria = {
  busquedas: {
    nombre: string;
    como: Como;
    /** texto con el que MARCanet sí lo encontró (puede ser sin «S.A. de C.V.», sin acentos…) */
    consulta?: string;
    coincidencias: string[];
    /** incluidos sin ser idénticos: cotitulares, o falta / sobra un apellido */
    aproximadas?: string[];
    parecidos: string[];
    marcas: number;
    error?: string;
  }[];
  marcas: MarcaAuditada[];
};

const ESPERA_CUOTA_MS = 11 * 60 * 1000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Estatus actual y real de una marca según su ficha de MARCanet, en palabras para el cliente, con su categoría,
 * la declaración de uso / renovación y si contestó sus oficios en tiempo.
 */
export function analizarMarca(r: ExpedienteMarcanet, hoy = new Date(), app?: { juicioNulidad?: Date | null }) {
  const contestaciones = analizarContestaciones(r.oficios, r.promociones, r.tramites, tipoDesdeImpi, hoy);
  const oficios = [...r.oficios].sort((a, b) => ((b.fechaNotificacion ?? b.fechaOficio)?.getTime() ?? 0) - ((a.fechaNotificacion ?? a.fechaOficio)?.getTime() ?? 0));
  const ultimo = oficios.find((o) => !/ARCHIVO FON|EXAMEN FIGURATIVO/i.test(o.descripcion));
  const registrada = !!(r.numeroRegistro || r.fechaConcesion || (ultimo && /CONCESI|T[IÍ]TULO DE REGISTRO|SE OTORGA/i.test(ultimo.descripcion)));
  const vigencia = r.fechaConcesion ? vigenciaDe(r.fechaConcesion, r.fechaVigencia) : r.fechaVigencia;
  const ddu = registrada ? analizarDDU(r.fechaConcesion, r.tramites, hoy) : null;
  const renovacion = registrada ? analizarRenovacion(r.fechaConcesion, r.fechaVigencia, r.tramites, hoy) : null;
  const f = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

  let estatus: string;
  let tono: MarcaAuditada["tono"];
  let categoria: NonNullable<MarcaAuditada["categoria"]>;
  if (registrada) {
    const vencida = vigencia && hoy > sumarMeses(vigencia, 6) && renovacion?.tono === "rojo";
    if (vencida) [estatus, tono, categoria] = ["Registro vencido (no se renovó)", "rojo", "PERDIDA"];
    // Ya pasó la vigencia pero sigue en los 6 meses de gracia: aún se puede renovar (urgente)
    else if (renovacion && /^Vencida el/.test(renovacion.texto)) [estatus, tono, categoria] = [`Registrada · ${renovacion.texto}`, "ambar", "GANADA"];
    else if (ddu?.tono === "rojo" && /NO presentada/.test(ddu.texto)) [estatus, tono, categoria] = ["Registrada · sin declaración de uso (riesgo de caducidad)", "ambar", "GANADA"];
    else [estatus, tono, categoria] = [vigencia ? `Registrada · vigente hasta ${f(vigencia)}` : "Registrada", "verde", "GANADA"];
  } else if (ultimo && /ABANDON/i.test(ultimo.descripcion)) {
    [estatus, tono, categoria] = ["Abandonada (declarada por el IMPI)", "gris", "PERDIDA"];
  } else {
    // El oficio más reciente que pide respuesta decide: vencido sin contestar = abandonada (o negativa firme)
    const pendiente = [...contestaciones].reverse().find((c) => !c.contestado && c.tono !== "gris");
    const negativa = ultimo && /NEGATIVA/i.test(ultimo.descripcion);
    const confirma = ultimo && /CONFIRMA EL ACTO/i.test(ultimo.descripcion);
    const enRecurso = r.tramites.some((t) => /RECURSO DE REVISI/i.test(t.descripcion) && !t.fechaConclusion);
    // Se confirmó la negativa: hay 15 días hábiles para el juicio de nulidad; pasado ese plazo sin juicio, queda negada
    const fConfirma = confirma ? ultimo!.fechaNotificacion ?? ultimo!.fechaOficio : null;
    const limiteNulidad = fConfirma ? limiteOficio("CONFIRMA_ACTO", fConfirma) : null;
    const conNulidad = r.tramites.some((t) => /NULIDAD/i.test(t.descripcion) && t.fechaInicio && fConfirma && t.fechaInicio >= fConfirma);
    // El juicio de nulidad va al Tribunal y no aparece en MARCanet: durante 2 meses desde la negativa no se da por
    // perdida (se sigue revisando); si en la app se registró el juicio, sigue en proceso.
    const fNegativa = (negativa || confirma) && ultimo ? ultimo.fechaNotificacion ?? ultimo.fechaOficio : null;
    const revisarHasta = fNegativa ? sumarMeses(fNegativa, 2) : null;
    const enGracia = !!revisarHasta && hoy <= revisarHasta;
    if ((negativa || confirma) && app?.juicioNulidad) [estatus, tono, categoria] = [`En juicio de nulidad (presentado el ${f(app.juicioNulidad)} · registrado en la app)`, "ambar", "PROCESO"];
    else if (confirma && !conNulidad && limiteNulidad && hoy > limiteNulidad)
      [estatus, tono, categoria] = enGracia
        ? [`Negativa confirmada · sin juicio de nulidad a la vista (no aparece en MARCanet); se sigue revisando hasta el ${f(revisarHasta!)}`, "rojo", "PROCESO"]
        : ["Negada (se confirmó la negativa y no se presentó juicio de nulidad)", "rojo", "PERDIDA"];
    else if (confirma) [estatus, tono, categoria] = ["Recurso de revisión perdido (se confirma la negativa)", "rojo", "PROCESO"];
    else if (negativa && pendiente?.vencido)
      [estatus, tono, categoria] = enGracia
        ? [`Negativa · venció el plazo sin recurso en MARCanet (pudo presentarse juicio de nulidad); se sigue revisando hasta el ${f(revisarHasta!)}`, "rojo", "PROCESO"]
        : ["Negada (no se impugnó la negativa)", "rojo", "PERDIDA"];
    else if (enRecurso) [estatus, tono, categoria] = ["En recurso de revisión", "ambar", "PROCESO"];
    else if (negativa) [estatus, tono, categoria] = ["Negativa del IMPI · aún se puede impugnar", "rojo", "PROCESO"];
    else if (pendiente?.vencido) [estatus, tono, categoria] = ["Abandonada (no se contestó el oficio en el plazo de 4 meses)", "gris", "PERDIDA"];
    else if (pendiente && pendiente.tono === "ambar") [estatus, tono, categoria] = ["Oficio por contestar (en plazo)", "ambar", "PROCESO"];
    else if (pendiente) [estatus, tono, categoria] = ["Oficio del IMPI por notificar", "azul", "PROCESO"];
    else if (contestaciones.some((c) => c.contestado)) [estatus, tono, categoria] = ["En trámite · requerimiento contestado", "azul", "PROCESO"];
    else [estatus, tono, categoria] = ["En trámite ante el IMPI", "azul", "PROCESO"];
  }
  return { estatus, tono, categoria, ddu, renovacion, contestaciones: contestaciones.map(({ texto, tono: t }) => ({ texto, tono: t })), vigencia };
}

/** Compatibilidad: solo estatus y color. */
export function estatusDesdeMarcanet(r: ExpedienteMarcanet, hoy = new Date()): { estatus: string; tono: MarcaAuditada["tono"] } {
  const a = analizarMarca(r, hoy);
  return { estatus: a.estatus, tono: a.tono };
}

/** Búsqueda de un nombre a medias: renglones del IMPI por recorrer y en qué página de marcas va. */
type BusquedaEnCurso = {
  consulta: string;
  filas: FilaNombre[];
  coincidencias: string[];
  aproximadas: string[];
  parecidos: string[];
  fila: number;
  desde: number;
  expedientes: string[];
  errores: string[];
};

type Estado = ResultadoAuditoria & { fase?: "BUSQUEDA" | "DETALLES"; paso?: number; sub?: BusquedaEnCurso };

// Lo que tarda como máximo cada pedazo (la corrida en Vercel se corta a los 300 s): si no alcanza, sigue en la próxima
const TIEMPO_LISTAR_MS = 100 * 1000;
const TIEMPO_FILA_MS = 45 * 1000;

/**
 * Avanza una auditoría hasta `limite` (ms epoch) y guarda dónde se quedó: se puede continuar en otra corrida.
 * Devuelve true si ya terminó. Si MARCanet pide esperar, lanza MarcanetCuotaError (lo hecho queda guardado).
 */
export async function avanzarAuditoria(db: PrismaClient, id: string, limite: number): Promise<boolean> {
  try {
    return await avanzar(db, id, limite);
  } catch (e) {
    if (e instanceof AuditoriaDetenida) return true; // la detuvieron con la ✕: lo hecho queda guardado
    throw e;
  }
}

/** Se detuvo con la ✕ mientras corría. */
class AuditoriaDetenida extends Error {}

/** Horas en que una auditoría detenida se puede reanudar donde se quedó; después empieza de cero. */
export const HORAS_REANUDAR = 12;

async function avanzar(db: PrismaClient, id: string, limite: number): Promise<boolean> {
  const a = await db.auditoria.findUniqueOrThrow({ where: { id } });
  if (a.estado !== "PENDIENTE" && a.estado !== "BUSCANDO") return true;
  // Toda escritura solo procede si sigue activa: si la detuvieron, se deja de trabajar en ella
  const escribir = async (data: { estado?: string; avance?: string | null; resultado?: string; terminado?: Date }) => {
    const r = await db.auditoria.updateMany({ where: { id, estado: { in: ["PENDIENTE", "BUSCANDO"] } }, data });
    if (!r.count) throw new AuditoriaDetenida();
  };
  const nombres = JSON.parse(a.nombres) as string[];
  const st: Estado = a.resultado ? JSON.parse(a.resultado) : { busquedas: [], marcas: [] };
  st.fase ??= "BUSQUEDA";
  st.paso ??= 0;
  const guardar = (avance: string | null) => escribir({ estado: "BUSCANDO", avance, resultado: JSON.stringify(st) });
  const tareas = nombres.flatMap((nombre) => (["TITULAR", "APODERADO"] as Como[]).map((como) => ({ nombre, como })));

  const agregar = (marcas: MarcaEncontrada[], como: Como, sub: BusquedaEnCurso) => {
    for (const m of marcas) {
      if (!sub.expedientes.includes(m.expediente)) sub.expedientes.push(m.expediente);
      const previa = st.marcas.find((x) => x.expediente === m.expediente);
      if (previa) {
        if (!previa.encontradaComo.some((x) => x.como === como && x.nombre === m.nombreImpi)) previa.encontradaComo.push({ como, nombre: m.nombreImpi });
        continue;
      }
      const { nombreImpi, ...datos } = m;
      st.marcas.push({ ...datos, encontradaComo: [{ como, nombre: nombreImpi }], estatus: "", tono: "gris", ultimo: null, fechaPresentacion: null, fechaConcesion: null, vigencia: null, enApp: null });
    }
  };

  // 1) Cada nombre como titular y como apoderado. Se guarda el avance por renglón y por página de marcas,
  //    así un nombre con cientos de marcas se reparte en varias corridas sin empezar de cero.
  while (st.fase === "BUSQUEDA") {
    if (st.paso >= tareas.length) {
      st.fase = "DETALLES";
      st.paso = 0;
      await guardar("Consultando el estatus de cada marca…");
      break;
    }
    const { nombre, como } = tareas[st.paso];
    const quien = como === "TITULAR" ? "titular" : "apoderado";
    try {
      if (!st.sub) {
        if (limite - Date.now() < TIEMPO_LISTAR_MS) return false;
        await escribir({ estado: "BUSCANDO", avance: `Buscando «${nombre}» como ${quien} (${st.paso + 1} de ${tareas.length})…` });
        st.sub = { ...(await listarNombres(nombre, como)), fila: 0, desde: 0, expedientes: [], errores: [] };
        await guardar(null);
      }
      const sub = st.sub;
      while (sub.fila < sub.filas.length) {
        if (limite - Date.now() < TIEMPO_FILA_MS) return false;
        const f = sub.filas[sub.fila];
        await escribir({ estado: "BUSCANDO", avance: `«${nombre}» como ${quien} (${st.paso + 1} de ${tareas.length}): marcas de ${f.nombre}${sub.filas.length > 1 ? ` · ${sub.fila + 1} de ${sub.filas.length}` : ""}…` });
        try {
          const r = await marcasDeFila(sub.consulta, como, f, sub.desde, limite - 30 * 1000);
          agregar(r.marcas, como, sub);
          if (r.siguiente !== null) {
            sub.desde = r.siguiente;
            await guardar(null);
            return false;
          }
        } catch (e) {
          if (e instanceof MarcanetCuotaError) throw e;
          sub.errores.push(`${f.nombre}: ${e instanceof Error ? e.message : "Error"}`);
        }
        sub.fila++;
        sub.desde = 0;
        await guardar(null);
      }
      st.busquedas.push({
        nombre, como, consulta: sub.consulta, coincidencias: sub.coincidencias, aproximadas: sub.aproximadas, parecidos: sub.parecidos, marcas: sub.expedientes.length,
        ...(sub.errores.length && { error: `No se pudieron leer ${sub.errores.length} de ${sub.filas.length} nombres` }),
      });
    } catch (e) {
      if (e instanceof AuditoriaDetenida) throw e;
      if (e instanceof MarcanetCuotaError) {
        await guardar(null);
        throw e;
      }
      st.busquedas.push({ nombre, como, coincidencias: [], parecidos: [], marcas: st.sub?.expedientes.length ?? 0, error: e instanceof Error ? e.message : "Error" });
    }
    st.sub = undefined;
    st.paso++;
    await guardar(null);
  }

  // 2) Estatus actual de cada marca encontrada (si la app la consultó hace menos de 7 días, se usan sus datos)
  const enApp = new Map(
    (await db.expediente.findMany({ where: { numeroExpediente: { in: st.marcas.map((m) => m.expediente) } }, select: { id: true, clienteId: true, numeroExpediente: true, numeroRegistro: true, juicioNulidad: true, marcanetSync: true, fechaPresentacion: true, fechaConcesion: true, tramitesImpi: true, oficiosImpi: true, promocionesImpi: true } }))
      .map((e) => [e.numeroExpediente!, e])
  );
  const reciente = Date.now() - 7 * 864e5;
  while (st.paso! < st.marcas.length) {
    if (Date.now() > limite) return false;
    const m = st.marcas[st.paso!];
    await escribir({ avance: `Consultando el estatus de cada marca: ${st.paso! + 1} de ${st.marcas.length}` });
    const e = enApp.get(m.expediente);
    if (e) m.enApp = { id: e.id, clienteId: e.clienteId };
    try {
      // Si la app consultó esa marca hace menos de 7 días se usan sus datos de MARCanet; si no, se consulta de nuevo
      const r: ExpedienteMarcanet =
        e && e.marcanetSync && e.marcanetSync.getTime() > reciente
          ? {
              numeroExpediente: m.expediente, denominacion: m.denominacion, numeroRegistro: e.numeroRegistro, fechaPresentacion: e.fechaPresentacion, fechaConcesion: e.fechaConcesion, fechaVigencia: null,
              tramites: e.tramitesImpi.map((t) => ({ folio: t.folio, anio: t.anio, descripcion: t.descripcion, fechaInicio: t.fechaInicio, fechaConclusion: t.fechaConclusion })),
              oficios: e.oficiosImpi.map((o) => ({ descripcion: o.descripcion, numero: o.numero, fechaOficio: o.fechaOficio, estadoNotificacion: o.estadoNotificacion ?? "", fechaNotificacion: o.fechaNotificacion, tramite: o.tramite ?? "" })),
              promociones: e.promocionesImpi.map((p) => ({ folio: p.folio, anio: p.anio, fechaPresentacion: p.fechaPresentacion, oficioRelacionado: p.oficioRelacionado, descripcion: p.descripcion, tramite: p.tramite ?? "" })),
            }
          : await consultarMarcanet(m.expediente);
      const an = analizarMarca(r, new Date(), { juicioNulidad: e?.juicioNulidad });
      Object.assign(m, { estatus: an.estatus, tono: an.tono, categoria: an.categoria, ddu: an.ddu, renovacion: an.renovacion, contestaciones: an.contestaciones, vigencia: iso(an.vigencia) });
      const u = ultimaActualizacion(r);
      m.ultimo = u ? { fecha: u.fecha.toISOString(), texto: u.texto } : null;
      m.fechaPresentacion = iso(r.fechaPresentacion);
      m.fechaConcesion = iso(r.fechaConcesion);
      if (!m.registro && r.numeroRegistro) m.registro = r.numeroRegistro;
    } catch (err) {
      if (err instanceof MarcanetCuotaError) throw err;
      m.estatus = "No se pudo consultar";
      m.categoria = "PROCESO";
      m.error = err instanceof Error ? err.message : "Error";
    }
    st.paso!++;
    if (st.paso! % 3 === 0) await guardar(null);
  }
  const { fase: _f, paso: _p, sub: _s, ...final } = st;
  void _f; void _p; void _s;
  await escribir({ estado: "LISTA", avance: null, terminado: new Date(), resultado: JSON.stringify(final) });
  return true;
}

/** Ejecuta una auditoría completa (la usa la revisión automática de GitHub como respaldo). Respeta la cuota de MARCanet. */
export async function procesarAuditoria(db: PrismaClient, id: string, log: (m: string) => void = () => {}) {
  for (let esperas = 0; ; ) {
    try {
      if (await avanzarAuditoria(db, id, Date.now() + 6 * 3600 * 1000)) break;
    } catch (e) {
      if (e instanceof MarcanetCuotaError && esperas++ < 6) {
        await db.auditoria.updateMany({ where: { id, estado: { in: ["PENDIENTE", "BUSCANDO"] } }, data: { avance: "Pausa obligatoria de MARCanet (10 min)…" } });
        await esperar(ESPERA_CUOTA_MS);
        continue;
      }
      throw e;
    }
  }
  log("Auditoría lista");
}

export type ProgresoAuditoria = {
  id: string;
  estado: string; // PENDIENTE | BUSCANDO | DETENIDA | LISTA | ERROR
  /** si está detenida: hasta cuándo se puede reanudar donde se quedó (después empieza de cero) */
  reanudarHasta: string | null;
  pct: number;
  restanteSeg: number | null;
  transcurridoSeg: number;
  texto: string;
  marcas: number;
  /** marcas del IMPI que no están en la app: posibles servicios por vender */
  noContratadas: number;
  calculadoEn: string;
};

const SEG_POR_BUSQUEDA = 90; // cada nombre como titular o apoderado (medido)
const SEG_POR_MARCA = 16; // ficha de cada marca (medido)

/** Avance aproximado de una auditoría y su tiempo restante (para el reloj). */
export function progresoAuditoria(a: { id: string; estado: string; nombres: string; avance: string | null; resultado: string | null; creado: Date; terminado: Date | null; detenida: Date | null; pausaSeg: number }): ProgresoAuditoria {
  const p = calcularProgreso(a);
  if (a.estado !== "DETENIDA") return p;
  const detenida = a.detenida ?? new Date();
  return { ...p, restanteSeg: null, reanudarHasta: new Date(detenida.getTime() + HORAS_REANUDAR * 3600 * 1000).toISOString(), transcurridoSeg: Math.round((detenida.getTime() - a.creado.getTime()) / 1000) - a.pausaSeg };
}

function calcularProgreso(a: Parameters<typeof progresoAuditoria>[0]): ProgresoAuditoria {
  const st = a.resultado ? (JSON.parse(a.resultado) as ResultadoAuditoria & { fase?: string; paso?: number }) : { busquedas: [], marcas: [] as MarcaAuditada[] };
  const tareas = (JSON.parse(a.nombres) as string[]).length * 2;
  const marcas = st.marcas.length;
  const noContratadas = st.marcas.filter((m) => !m.enApp).length;
  const fin = a.terminado ?? new Date();
  const base = { id: a.id, reanudarHasta: null, marcas, noContratadas, transcurridoSeg: Math.round((fin.getTime() - a.creado.getTime()) / 1000) - a.pausaSeg, calculadoEn: new Date().toISOString() };
  if (a.estado === "LISTA") return { ...base, estado: a.estado, pct: 100, restanteSeg: 0, texto: "Terminada" };
  if (a.estado === "ERROR") return { ...base, estado: a.estado, pct: 0, restanteSeg: null, texto: a.avance ?? "No pudo terminar" };
  if (!st.fase) return { ...base, estado: a.estado, pct: 2, restanteSeg: tareas * SEG_POR_BUSQUEDA, texto: "Empezando…" };
  const paso = st.paso ?? 0;
  if (st.fase === "BUSQUEDA") {
    // Mientras busca aún no se sabe cuántas marcas habrá: se estima con las encontradas hasta ahora
    const estimadas = paso ? Math.round((marcas / paso) * tareas) : marcas;
    const restante = (tareas - paso) * SEG_POR_BUSQUEDA + estimadas * SEG_POR_MARCA;
    return { ...base, estado: a.estado, pct: Math.max(3, Math.round((paso / tareas) * 45)), restanteSeg: restante, texto: a.avance ?? "Buscando en MARCanet…" };
  }
  const restante = Math.max(0, marcas - paso) * SEG_POR_MARCA;
  return { ...base, estado: a.estado, pct: 45 + Math.round((paso / Math.max(1, marcas)) * 55), restanteSeg: restante, texto: a.avance ?? "Consultando el estatus de cada marca…" };
}
