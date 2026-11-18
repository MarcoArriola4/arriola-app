// Reglas de cumplimiento de una marca registrada y de sus oficios (las usan la app, los reportes y la auditoría).
// - Declaración de uso (DDU): solo marcas concedidas a partir del 10/08/2018 (reforma a la LPI). Se presenta en los
//   3 meses siguientes al 3er aniversario de la concesión: concesión 23/08/2023 → del 23/08/2026 al 23/11/2026.
//   Si no se presenta en ese plazo (o se presenta tarde), el IMPI la da por CADUCADA: ya no está vigente y en los
//   reportes va con las perdidas (abandonadas, caducadas o negadas), nunca como registrada.
// - Renovación: la vigencia es de 10 años desde la concesión.
// - Oficios: se contestan en 4 meses desde la notificación (requerimiento de pago: 5 días hábiles; negativa: 30 días
//   naturales para revisión o nulidad). Un oficio sin contestar con el plazo vencido = la marca quedó abandonada.
import { siguienteHabil, sumarDiasHabiles, sumarDiasNaturales, sumarMeses } from "./plazos";
import { INHABILES_OFICIALES } from "./inhabiles-oficiales";

export const REFORMA_DDU = new Date(Date.UTC(2018, 7, 10)); // 10 de agosto de 2018

export type Juicio = { texto: string; tono: "verde" | "azul" | "ambar" | "rojo" | "gris" };
type Tramite = { descripcion: string; fechaInicio: Date | null };
type Oficio = { descripcion: string; numero: string; fechaOficio: Date | null; fechaNotificacion: Date | null };
type Promocion = { fechaPresentacion: Date | null; oficioRelacionado: string | null; descripcion: string };

const f = (d: Date) => d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const SIN_INHABILES: ReadonlySet<string> = new Set();
/** Días inhábiles oficiales del IMPI (DOF): si el plazo termina en uno, se recorre al siguiente día hábil. */
const INHABILES_IMPI: ReadonlySet<string> = new Set(INHABILES_OFICIALES.map((d) => d.fecha));

/** ¿La marca debe presentar declaración de uso a los 3 años? (concedida a partir del 10/08/2018) */
export const requiereDDU = (concesion: Date) => concesion.getTime() >= REFORMA_DDU.getTime();

/** Periodo para presentar la declaración de uso: del 3er aniversario a 3 meses después. null si no aplica. */
export function ventanaDDU(concesion: Date) {
  if (!requiereDDU(concesion)) return null;
  return { inicio: sumarMeses(concesion, 36), fin: siguienteHabil(sumarMeses(concesion, 39), INHABILES_IMPI) };
}

export const vigenciaDe = (concesion: Date, vigencia?: Date | null) => vigencia ?? sumarMeses(concesion, 120);

/** ¿Se presentó la declaración de uso y fue en tiempo? */
export function analizarDDU(concesion: Date | null, tramites: Tramite[], hoy = new Date()): Juicio | null {
  if (!concesion) return null;
  const v = ventanaDDU(concesion);
  if (!v) return { texto: "Declaración de uso: no aplica a los 3 años (concedida antes del 10/08/2018); se declara el uso al renovar", tono: "gris" };
  const ddu = tramites.filter((t) => /DECLARACI[OÓ]N DE USO/i.test(t.descripcion) && t.fechaInicio).sort((a, b) => a.fechaInicio!.getTime() - b.fechaInicio!.getTime())[0];
  if (ddu) {
    const fd = ddu.fechaInicio!;
    if (fd <= v.fin) return { texto: `Declaración de uso presentada en tiempo (${f(fd)})`, tono: "verde" };
    return { texto: `Declaración de uso presentada fuera de tiempo (${f(fd)}; el plazo venció el ${f(v.fin)}): el registro caducó`, tono: "rojo" };
  }
  if (hoy < v.inicio) return { texto: `Declaración de uso: le toca del ${f(v.inicio)} al ${f(v.fin)}`, tono: "azul" };
  if (hoy <= v.fin) return { texto: `Declaración de uso POR PRESENTAR: vence el ${f(v.fin)}`, tono: "ambar" };
  return { texto: `Declaración de uso NO presentada (venció el ${f(v.fin)}): el registro caducó`, tono: "rojo" };
}

/**
 * ¿El registro ya no está vigente? Devuelve el motivo (para ponerlo con las abandonadas / caducadas) o null si sigue vigente.
 * - Declaración de uso no presentada en su plazo, o presentada fuera de él → caducada.
 * - Vigencia vencida y pasados los 6 meses de gracia sin renovar → vencida.
 * `dduDespacho`: el despacho tiene la declaración de uso como hecha (Contrataciones / estatus) aunque MARCanet no la
 * muestre todavía: se da por presentada para no marcar como caducada una marca que sí se declaró.
 * `consultado`: última consulta a MARCanet; si fue antes de que venciera el plazo, se avisa que hay que confirmarlo.
 */
export function motivoCaducidad(
  concesion: Date | null,
  tramites: { descripcion: string; fechaInicio: Date | null }[],
  hoy = new Date(),
  { vigencia = null, dduDespacho = false, consultado }: { vigencia?: Date | null; dduDespacho?: boolean; consultado?: Date | null } = {}
): { motivo: string; detalle: string; fecha: Date } | null {
  if (!concesion) return null;
  const v = ventanaDDU(concesion);
  if (v && hoy > v.fin) {
    const ddu = tramites.filter((t) => /DECLARACI[OÓ]N DE USO/i.test(t.descripcion) && t.fechaInicio).sort((a, b) => a.fechaInicio!.getTime() - b.fechaInicio!.getTime())[0];
    if (ddu && ddu.fechaInicio! > v.fin)
      return { motivo: "Caducada: la declaración de uso se presentó fuera de plazo", detalle: `Presentada el ${f(ddu.fechaInicio!)}; el plazo venció el ${f(v.fin)}`, fecha: v.fin };
    if (!ddu && !dduDespacho)
      return {
        motivo: "Caducada: no se presentó la declaración de uso",
        detalle: `El plazo venció el ${f(v.fin)} (3 meses después del 3er aniversario de la concesión)` +
          (consultado !== undefined && (!consultado || consultado <= v.fin) ? ". Confirmar en MARCanet: la última consulta fue antes de que venciera el plazo" : ""),
        fecha: v.fin,
      };
  }
  const vence = vigenciaDe(concesion, vigencia);
  const gracia = sumarMeses(vence, 6);
  if (hoy > gracia && !tramites.some((t) => /RENOVACI/i.test(t.descripcion) && t.fechaInicio && t.fechaInicio >= sumarMeses(vence, -6)))
    return { motivo: "Vencida: no se renovó", detalle: `La vigencia terminó el ${f(vence)} y el periodo de gracia el ${f(gracia)}`, fecha: vence };
  return null;
}

/** ¿Se renovó a tiempo? (o cuándo le toca) */
export function analizarRenovacion(concesion: Date | null, vigencia: Date | null, tramites: Tramite[], hoy = new Date()): Juicio | null {
  if (!concesion && !vigencia) return null;
  const vence = vigenciaDe(concesion ?? sumarMeses(vigencia!, -120), vigencia);
  const renov = tramites.filter((t) => /RENOVACI/i.test(t.descripcion) && t.fechaInicio && t.fechaInicio >= sumarMeses(vence, -6)).sort((a, b) => a.fechaInicio!.getTime() - b.fechaInicio!.getTime())[0];
  if (renov) {
    const fr = renov.fechaInicio!;
    if (fr <= vence) return { texto: `Renovación presentada en tiempo (${f(fr)})`, tono: "verde" };
    if (fr <= sumarMeses(vence, 6)) return { texto: `Renovación presentada en el periodo de gracia (${f(fr)})`, tono: "ambar" };
    return { texto: `Renovación presentada fuera de tiempo (${f(fr)})`, tono: "rojo" };
  }
  if (hoy > sumarMeses(vence, 6)) return { texto: `Registro vencido el ${f(vence)} sin renovar`, tono: "rojo" };
  if (hoy > vence) return { texto: `Vencida el ${f(vence)}: aún puede renovarse (gracia hasta ${f(sumarMeses(vence, 6))})`, tono: "rojo" };
  if (hoy >= sumarMeses(vence, -6)) return { texto: `Renovación POR PRESENTAR: vence el ${f(vence)}`, tono: "ambar" };
  return { texto: `Vigente hasta ${f(vence)}`, tono: "verde" };
}

/** Plazo para contestar un oficio según su tipo. */
export function limiteOficio(tipo: string, notificacion: Date) {
  if (tipo === "REQ_PAGO") return sumarDiasHabiles(notificacion, 5, SIN_INHABILES);
  if (tipo === "NEGATIVA") return sumarDiasNaturales(notificacion, 30);
  if (tipo === "CONFIRMA_ACTO") return sumarDiasHabiles(notificacion, 15, SIN_INHABILES);
  if (tipo === "ALEGATOS") return null; // opcional: no contestarlos no abandona la marca
  return sumarMeses(notificacion, 4);
}

export type RevisionOficio = Juicio & { numero: string; vencido: boolean; contestado: boolean };

/** Por cada oficio que pide respuesta: ¿se contestó y fue en tiempo? */
export function analizarContestaciones(
  oficios: Oficio[],
  promociones: Promocion[],
  tramites: Tramite[],
  tipoDe: (descripcion: string) => string | null,
  hoy = new Date()
): RevisionOficio[] {
  const fechaOf = (o: Oficio) => o.fechaNotificacion ?? o.fechaOficio;
  const ordenados = [...oficios].filter((o) => fechaOf(o)).sort((a, b) => fechaOf(a)!.getTime() - fechaOf(b)!.getTime());
  const res: RevisionOficio[] = [];
  for (const [i, o] of ordenados.entries()) {
    const tipo = tipoDe(o.descripcion);
    if (!tipo) continue;
    const nombre = o.descripcion.charAt(0) + o.descripcion.slice(1).toLowerCase();
    if (!o.fechaNotificacion) {
      // Un oficio de hace más de un año que nunca se notificó ya no cuenta (historia vieja del expediente)
      if (hoy.getTime() - fechaOf(o)!.getTime() > 365 * 864e5) continue;
      res.push({ numero: o.numero, texto: `${nombre} (oficio del ${f(o.fechaOficio!)}): aún sin notificar`, tono: "azul", vencido: false, contestado: false });
      continue;
    }
    const notif = o.fechaNotificacion;
    const siguiente = ordenados[i + 1] ? fechaOf(ordenados[i + 1])! : null;
    // Respuesta: la promoción ligada a ese oficio o, si no, la primera presentada después de notificarlo (y antes del siguiente oficio)
    const respuesta =
      tipo === "NEGATIVA" || tipo === "CONFIRMA_ACTO"
        ? tramites.filter((t) => /RECURSO DE REVISI|NULIDAD/i.test(t.descripcion) && t.fechaInicio && t.fechaInicio >= notif).map((t) => t.fechaInicio!).sort((a, b) => a.getTime() - b.getTime())[0] ??
          promociones.find((p) => p.oficioRelacionado === o.numero && p.fechaPresentacion)?.fechaPresentacion ?? null
        : promociones.find((p) => p.oficioRelacionado === o.numero && p.fechaPresentacion)?.fechaPresentacion ??
          promociones.filter((p) => p.fechaPresentacion && p.fechaPresentacion >= notif && (!siguiente || p.fechaPresentacion <= siguiente)).map((p) => p.fechaPresentacion!).sort((a, b) => a.getTime() - b.getTime())[0] ??
          null;
    const limite = limiteOficio(tipo, notif);
    if (respuesta) {
      const enTiempo = !limite || respuesta <= limite;
      res.push({ numero: o.numero, contestado: true, vencido: false, tono: enTiempo ? "verde" : "rojo", texto: `${nombre} (notificado ${f(notif)}): contestado ${enTiempo ? "en tiempo" : "FUERA de tiempo"} el ${f(respuesta)}` });
    } else if (!limite) {
      res.push({ numero: o.numero, contestado: false, vencido: false, tono: "gris", texto: `${nombre} (notificado ${f(notif)}): no se contestó (opcional; el trámite sigue)` });
    } else if (hoy > limite) {
      res.push({ numero: o.numero, contestado: false, vencido: true, tono: "rojo", texto: `${nombre} (notificado ${f(notif)}): NO se contestó; el plazo venció el ${f(limite)}` });
    } else {
      res.push({ numero: o.numero, contestado: false, vencido: false, tono: "ambar", texto: `${nombre} (notificado ${f(notif)}): por contestar, vence el ${f(limite)}` });
    }
  }
  return res;
}
