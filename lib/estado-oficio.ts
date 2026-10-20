// Un solo lugar para cambiar el estatus de un oficio. Lo usan el tablero, la ficha de la marca,
// Reportes y la tabla de Contrataciones: así el mismo expediente muestra lo mismo en toda la app.
import type { PrismaClient } from "@prisma/client";
import { MEDIOS_DEFENSA, TIPOS_OFICIO, fmtFecha } from "./catalogos";
import { diasRestantes, estaVencida, siguientePlazo } from "./plazos";

/** Pasos del oficio (orden del tablero) más los estados de archivo. */
export const PASOS_OFICIO: Record<string, string> = {
  RECIBIDA: "Recibida · falta avisar",
  AVISADO: "Cliente avisado · esperando pago",
  EN_TRABAJO: "Pagado · por trabajar",
  PAGAR_SISTEMA: "Trabajado · pagar en sistema",
  CONTESTADA: "Contestada / presentada",
  NO_PAGO: "No pagó · riesgo de abandono",
  CERRADA: "Cerrada · ya no es nuestro cliente",
};

type DatosPlazo = { tipo: string; fechaNotificacion: Date | string; fechaLimite: Date | string; fechaLimiteRevision?: Date | string | null; pendienteNotificar?: boolean };

/** "Notificado el 13/10/2026 · quedan 112 días (vence 13/02/2027)" */
export function textoPlazo(n: DatosPlazo, hoy = new Date()) {
  if (n.pendienteNotificar) return "Emitido por el IMPI, aún sin notificar (el plazo no corre)";
  const p = siguientePlazo(n, hoy);
  const d = diasRestantes(p.fecha, hoy);
  const que = p.etiqueta ? ` para ${p.etiqueta.toLowerCase()}` : "";
  const resto = d < 0 ? `venció hace ${-d} días${que} (${fmtFecha(p.fecha)})` : `quedan ${d} ${d === 1 ? "día" : "días"}${que} (vence ${fmtFecha(p.fecha)})`;
  return `Notificado el ${fmtFecha(n.fechaNotificacion)} · ${resto}`;
}

/** En qué parte de la app aparece el oficio (para que nunca "desaparezca"). */
export function dondeAparece(n: { estado: string; fechaLimite: Date | string; pendienteNotificar?: boolean; fechaContestacion?: Date | string | null }) {
  if (n.estado === "CERRADA") return "Cerrado · el cliente ya no continúa";
  if (n.estado === "NO_PAGO") return "Tablero › Riesgo de abandono";
  if (n.estado === "CONTESTADA") {
    const hace = n.fechaContestacion ? -diasRestantes(new Date(n.fechaContestacion)) : 999;
    return hace <= 30 ? "Tablero › Contestada" : "Contestado (historial de la marca)";
  }
  if (estaVencida(n)) return "Tablero › Vencidas";
  return `Tablero › ${PASOS_OFICIO[n.estado] ?? n.estado}`;
}

/** Estatus del trabajo (cobro de la contestación) que corresponde a cada paso del oficio. */
const TRABAJO_POR_PASO: Record<string, string | null> = {
  EN_TRABAJO: "PENDIENTE",
  PAGAR_SISTEMA: "PAGAR_SISTEMA",
  CONTESTADA: "HECHO",
};

/** Paso del oficio que corresponde a cada estatus de trabajo del cobro. */
const PASO_POR_TRABAJO: Record<string, string> = {
  PENDIENTE: "EN_TRABAJO",
  PRESENTAR: "EN_TRABAJO",
  PAGAR_SISTEMA: "PAGAR_SISTEMA",
  HECHO: "CONTESTADA",
  CLIENTE: "CONTESTADA",
};

const hoyUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

/** Fecha "dd/mm/aaaa" dentro de una nota ("Se presentó respuesta 19/10/2026"). */
function fechaEnNota(t?: string | null) {
  const m = t?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

export type DatosPaso = { fecha?: Date | null; monto?: number | null; banco?: string | null; medio?: string | null };

/**
 * Cambia el paso de un oficio y lo refleja en todo lo ligado al mismo expediente:
 * el cobro de la contestación (trabajado / pagar en sistema / por trabajar), la etapa de la marca y el historial.
 */
export async function aplicarPasoOficio(db: PrismaClient, id: string, estado: string, datos: DatosPaso, autor: string, { desdeCobro = false } = {}) {
  const n = await db.notificacion.findUniqueOrThrow({ where: { id }, include: { servicio: true, expediente: true } });
  if (n.estado === estado && !datos.monto && !datos.fecha) return n;
  const f = datos.fecha ?? hoyUTC();
  const esNegativa = n.tipo === "NEGATIVA" || n.tipo === "CONFIRMA_ACTO";
  const data: Record<string, unknown> = { editadoEnApp: true, estado };

  if (estado === "AVISADO") Object.assign(data, { fechaAvisoCliente: datos.fecha ?? n.fechaAvisoCliente ?? f, ...(datos.monto != null && { montoCotizado: datos.monto }) });
  if (estado === "EN_TRABAJO" && (datos.fecha || !n.fechaPago)) Object.assign(data, { fechaPago: f, ...(datos.monto && { montoCotizado: datos.monto }) });
  if (estado === "CONTESTADA") {
    const medio = n.tipo === "CONFIRMA_ACTO" ? "NULIDAD" : esNegativa ? datos.medio ?? n.medioDefensa ?? "REVISION" : null;
    Object.assign(data, { fechaContestacion: datos.fecha ?? n.fechaContestacion ?? f, medioDefensa: medio });
  }
  if (estado !== "CONTESTADA" && n.estado === "CONTESTADA") Object.assign(data, { fechaContestacion: null });

  const act = await db.notificacion.update({ where: { id }, data });

  // ── Cobro de la contestación ──
  if (estado === "EN_TRABAJO" && datos.monto) {
    await db.servicio.upsert({
      where: { notificacionId: id },
      update: { pagado: datos.monto, costo: datos.monto, estadoPago: "PAGADO", banco: datos.banco ?? undefined, fechaContratacion: f, editadoEnApp: true },
      create: {
        expedienteId: n.expedienteId, notificacionId: id, tipo: "CONTESTACION", fechaContratacion: f, costo: datos.monto, pagado: datos.monto,
        estadoPago: "PAGADO", banco: datos.banco, estadoTrabajo: "PENDIENTE", avance: `Contestación de ${TIPOS_OFICIO[n.tipo]?.toLowerCase()}`, editadoEnApp: true,
      },
    });
  }
  if (!desdeCobro) {
    const cobro = n.servicio ?? (await cobroDeOficio(db, n));
    const trabajo = TRABAJO_POR_PASO[estado];
    if (cobro && trabajo && cobro.estadoTrabajo !== trabajo && !(trabajo === "PENDIENTE" && cobro.estadoTrabajo === "PRESENTAR")) {
      await db.servicio.update({ where: { id: cobro.id }, data: { estadoTrabajo: trabajo, editadoEnApp: true, ...(!cobro.notificacionId && { notificacionId: id }) } });
    }
  }

  // ── Etapa de la marca (si el admin no la fijó a mano) ──
  if (!n.expediente.etapaManual) {
    if (estado === "CONTESTADA") {
      await db.expediente.update({ where: { id: n.expedienteId }, data: { etapa: esNegativa ? "EN_JUICIO" : "EN_TRAMITE", ...(act.medioDefensa && { ultimoEstatus: `${MEDIOS_DEFENSA[act.medioDefensa]} presentado` }) } });
    } else if (n.estado === "CONTESTADA") {
      await db.expediente.update({ where: { id: n.expedienteId }, data: { etapa: esNegativa ? "NEGATIVA" : "CON_OFICIO" } });
    }
  }

  // ── Historial ──
  const oficio = TIPOS_OFICIO[n.tipo] ?? n.tipo;
  const plazo = textoPlazo(n);
  const titulo: Record<string, string> = {
    RECIBIDA: `Oficio regresado a "recibida" (${oficio})`,
    AVISADO: `Se avisó al cliente del oficio (${oficio})`,
    EN_TRABAJO: n.estado === "AVISADO" || n.estado === "RECIBIDA" || n.estado === "NO_PAGO" ? `El cliente pagó la contestación (${oficio})` : `Contestación por trabajar (${oficio})`,
    PAGAR_SISTEMA: `Contestación trabajada · falta pagar en sistema (${oficio})`,
    CONTESTADA: act.medioDefensa ? `Se presentó ${MEDIOS_DEFENSA[act.medioDefensa].toLowerCase()} contra la ${oficio.toLowerCase()}` : `Se contestó el oficio (${oficio})`,
    NO_PAGO: `El cliente no pagó la contestación (${oficio}) · riesgo de abandono`,
    CERRADA: `Oficio cerrado (${oficio}) · el cliente ya no quiere continuar`,
  };
  const fechaEvento = estado === "CONTESTADA" ? (act.fechaContestacion ?? f) : estado === "AVISADO" ? (act.fechaAvisoCliente ?? f) : estado === "EN_TRABAJO" ? (act.fechaPago ?? f) : f;
  const detalle = [
    estado === "CONTESTADA" ? `Se contestó el ${fmtFecha(fechaEvento)} · notificado el ${fmtFecha(n.fechaNotificacion)}` : plazo,
    datos.monto ? `$${datos.monto.toLocaleString("es-MX")}` : null,
    estado === "CONTESTADA" && act.medioDefensa === "REVISION" ? "Si se confirma el acto, hay 15 días hábiles para el juicio de nulidad." : null,
  ].filter(Boolean).join(" · ");
  await db.evento.create({ data: { autor, expedienteId: n.expedienteId, fecha: fechaEvento, titulo: titulo[estado] ?? `Oficio: ${PASOS_OFICIO[estado] ?? estado}`, detalle } });
  return act;
}

/** Cobro de contestación que corresponde a un oficio (si no está ligado): el más reciente posterior a la notificación. */
async function cobroDeOficio(db: PrismaClient, n: { id: string; expedienteId: string; fechaNotificacion: Date }) {
  const desde = new Date(n.fechaNotificacion.getTime() - 3 * 864e5);
  return db.servicio.findFirst({
    where: { expedienteId: n.expedienteId, tipo: "CONTESTACION", notificacionId: null, fechaContratacion: { gte: desde } },
    orderBy: [{ fechaContratacion: "desc" }, { creado: "desc" }],
  });
}

/**
 * El estatus de trabajo de un cobro cambió (p. ej. en Contrataciones): se mueve el oficio que le corresponde.
 * Devuelve el oficio afectado, si hubo.
 */
export async function sincronizarDesdeCobro(db: PrismaClient, servicioId: string, autor: string) {
  const s = await db.servicio.findUniqueOrThrow({ where: { id: servicioId } });
  const paso = s.estadoTrabajo ? PASO_POR_TRABAJO[s.estadoTrabajo] : null;
  if (!paso) return null;
  let n = s.notificacionId ? await db.notificacion.findUnique({ where: { id: s.notificacionId } }) : null;
  if (!n && s.tipo === "CONTESTACION") {
    // Oficio en curso de la misma marca, notificado antes del cobro (o sin fecha de cobro: el más reciente)
    const abiertos = await db.notificacion.findMany({
      where: { expedienteId: s.expedienteId, estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA", "NO_PAGO"] }, servicio: null },
      orderBy: { fechaNotificacion: "desc" },
    });
    n = abiertos.find((o) => !s.fechaContratacion || o.fechaNotificacion.getTime() <= s.fechaContratacion.getTime() + 3 * 864e5) ?? null;
    if (n) await db.servicio.update({ where: { id: s.id }, data: { notificacionId: n.id } });
  }
  if (!n || n.estado === paso || n.estado === "CERRADA") return n;
  const fecha = paso === "CONTESTADA" ? fechaEnNota(s.avance) ?? hoyUTC() : null;
  return aplicarPasoOficio(db, n.id, paso, { fecha }, autor, { desdeCobro: true });
}
