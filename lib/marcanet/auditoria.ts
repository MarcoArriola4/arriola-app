// Auditoría + Reporte: busca cada nombre en MARCanet como titular y como apoderado, junta todas sus marcas
// y consulta el estatus actual de cada una. Todo se guarda solo en la auditoría (no crea marcas en la app).
import type { PrismaClient } from "@prisma/client";
import { ETAPAS } from "../catalogos";
import { buscarPorNombre, type Como, type MarcaEncontrada } from "./busqueda-nombre";
import { consultarMarcanet, esperar, MarcanetCuotaError, type ExpedienteMarcanet } from "./consulta";
import { tipoDesdeImpi, ultimaActualizacion } from "./sincronizar";

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
};

export type ResultadoAuditoria = {
  busquedas: { nombre: string; como: Como; coincidencias: string[]; parecidos: string[]; marcas: number; error?: string }[];
  marcas: MarcaAuditada[];
};

const ESPERA_CUOTA_MS = 11 * 60 * 1000;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Estatus actual de una marca según su ficha de MARCanet, en palabras para el cliente. */
export function estatusDesdeMarcanet(r: ExpedienteMarcanet, hoy = new Date()): { estatus: string; tono: MarcaAuditada["tono"] } {
  const oficios = [...r.oficios].sort((a, b) => ((b.fechaNotificacion ?? b.fechaOficio)?.getTime() ?? 0) - ((a.fechaNotificacion ?? a.fechaOficio)?.getTime() ?? 0));
  const ultimo = oficios.find((o) => !/ARCHIVO FON|EXAMEN FIGURATIVO/i.test(o.descripcion));
  if (r.numeroRegistro || r.fechaConcesion || (ultimo && /CONCESI|T[IÍ]TULO DE REGISTRO|SE OTORGA/i.test(ultimo.descripcion))) {
    if (r.fechaVigencia && r.fechaVigencia < hoy) return { estatus: "Registro vencido (sin renovar)", tono: "rojo" };
    return { estatus: r.fechaVigencia ? `Registrada · vigente hasta ${r.fechaVigencia.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}` : "Registrada", tono: "verde" };
  }
  if (ultimo && /ABANDON/i.test(ultimo.descripcion)) return { estatus: "Abandonada", tono: "gris" };
  if (r.tramites.some((t) => /RECURSO DE REVISI/i.test(t.descripcion) && !t.fechaConclusion)) return { estatus: "En recurso de revisión", tono: "ambar" };
  if (ultimo && /NEGATIVA/i.test(ultimo.descripcion)) return { estatus: "Negativa del IMPI", tono: "rojo" };
  if (ultimo && tipoDesdeImpi(ultimo.descripcion)) {
    const contestado = r.promociones.some((p) => p.oficioRelacionado === ultimo.numero) || r.promociones.some((p) => p.fechaPresentacion && ultimo.fechaNotificacion && p.fechaPresentacion >= ultimo.fechaNotificacion);
    if (contestado) return { estatus: "En trámite · requerimiento contestado", tono: "azul" };
    if (!ultimo.fechaNotificacion) return { estatus: "Oficio del IMPI por notificar", tono: "ambar" };
    return { estatus: `Oficio por contestar (${ultimo.descripcion.toLowerCase()})`, tono: "ambar" };
  }
  return { estatus: "En trámite ante el IMPI", tono: "azul" };
}

const TONO_ETAPA: Record<string, MarcaAuditada["tono"]> = { CONCEDIDA: "verde", EN_TRAMITE: "azul", POR_PRESENTAR: "azul", CON_OFICIO: "ambar", EN_JUICIO: "ambar", NEGATIVA: "rojo", CONFIRMA_ACTO: "rojo", ABANDONADA: "gris" };

/** Ejecuta una auditoría pendiente. Respeta la cuota de MARCanet (espera y reintenta). */
export async function procesarAuditoria(db: PrismaClient, id: string, log: (m: string) => void = () => {}) {
  const a = await db.auditoria.findUniqueOrThrow({ where: { id } });
  const nombres = JSON.parse(a.nombres) as string[];
  const avance = (t: string) => db.auditoria.update({ where: { id }, data: { avance: t } });
  await db.auditoria.update({ where: { id }, data: { estado: "BUSCANDO", avance: "Empezando…" } });

  const conCuota = async <T>(fn: () => Promise<T>): Promise<T> => {
    for (let intento = 0; ; intento++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof MarcanetCuotaError && intento < 4) {
          await avance("Pausa obligatoria de MARCanet (10 min)…");
          await esperar(ESPERA_CUOTA_MS);
          continue;
        }
        throw e;
      }
    }
  };

  // 1) Cada nombre como titular y como apoderado
  const res: ResultadoAuditoria = { busquedas: [], marcas: [] };
  const porExpediente = new Map<string, MarcaAuditada>();
  for (const nombre of nombres) {
    for (const como of ["TITULAR", "APODERADO"] as Como[]) {
      await avance(`Buscando «${nombre}» como ${como === "TITULAR" ? "titular" : "apoderado"}…`);
      log(`Buscando ${como.toLowerCase()}`);
      try {
        const r = await conCuota(() => buscarPorNombre(nombre, como));
        res.busquedas.push({ nombre, como, coincidencias: r.coincidencias, parecidos: r.parecidos, marcas: new Set(r.marcas.map((m) => m.expediente)).size });
        for (const m of r.marcas) {
          const previa = porExpediente.get(m.expediente);
          if (previa) {
            if (!previa.encontradaComo.some((x) => x.como === como && x.nombre === m.nombreImpi)) previa.encontradaComo.push({ como, nombre: m.nombreImpi });
            continue;
          }
          const { nombreImpi, ...datos } = m;
          porExpediente.set(m.expediente, { ...datos, encontradaComo: [{ como, nombre: nombreImpi }], estatus: "", tono: "gris", ultimo: null, fechaPresentacion: null, fechaConcesion: null, vigencia: null, enApp: null });
        }
      } catch (e) {
        res.busquedas.push({ nombre, como, coincidencias: [], parecidos: [], marcas: 0, error: e instanceof Error ? e.message : "Error" });
      }
      await db.auditoria.update({ where: { id }, data: { resultado: JSON.stringify({ ...res, marcas: [...porExpediente.values()] }) } });
    }
  }

  // 2) Estatus actual de cada marca encontrada (si la app la consultó hace menos de 7 días, se usan sus datos)
  const lista = [...porExpediente.values()];
  const enApp = new Map(
    (await db.expediente.findMany({ where: { numeroExpediente: { in: lista.map((m) => m.expediente) } }, select: { id: true, clienteId: true, numeroExpediente: true, etapa: true, desistio: true, marcanetSync: true, ultimaActImpi: true, ultimaActImpiFecha: true, fechaPresentacion: true, fechaConcesion: true } }))
      .map((e) => [e.numeroExpediente!, e])
  );
  const reciente = Date.now() - 7 * 864e5;
  for (const [i, m] of lista.entries()) {
    await avance(`Consultando el estatus de cada marca: ${i + 1} de ${lista.length}`);
    const e = enApp.get(m.expediente);
    if (e) m.enApp = { id: e.id, clienteId: e.clienteId };
    if (e && e.marcanetSync && e.marcanetSync.getTime() > reciente) {
      const etapa = e.desistio ? "ABANDONADA" : e.etapa;
      m.estatus = etapa === "CONCEDIDA" ? "Registrada" : ETAPAS[etapa] ?? etapa;
      m.tono = TONO_ETAPA[etapa] ?? "gris";
      m.ultimo = e.ultimaActImpi && e.ultimaActImpiFecha ? { fecha: e.ultimaActImpiFecha.toISOString(), texto: e.ultimaActImpi } : null;
      m.fechaPresentacion = iso(e.fechaPresentacion);
      m.fechaConcesion = iso(e.fechaConcesion);
      continue;
    }
    try {
      const r = await conCuota(() => consultarMarcanet(m.expediente));
      Object.assign(m, estatusDesdeMarcanet(r));
      const u = ultimaActualizacion(r);
      m.ultimo = u ? { fecha: u.fecha.toISOString(), texto: u.texto } : null;
      m.fechaPresentacion = iso(r.fechaPresentacion);
      m.fechaConcesion = iso(r.fechaConcesion);
      m.vigencia = iso(r.fechaVigencia);
      if (!m.registro && r.numeroRegistro) m.registro = r.numeroRegistro;
    } catch (err) {
      m.estatus = "No se pudo consultar";
      m.error = err instanceof Error ? err.message : "Error";
    }
    if (i % 5 === 4) await db.auditoria.update({ where: { id }, data: { resultado: JSON.stringify({ ...res, marcas: lista }) } });
  }
  res.marcas = lista;
  await db.auditoria.update({ where: { id }, data: { estado: "LISTA", avance: null, terminado: new Date(), resultado: JSON.stringify(res) } });
  log(`Auditoría lista: ${lista.length} marcas`);
}
