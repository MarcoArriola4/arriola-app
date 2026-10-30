// Reporte general de todas las marcas (Admin): ganadas con su declaración de uso y renovación, negadas y abandonadas
// con su motivo, oficios en curso, marcas en espera de respuesta del IMPI y las que ya recibieron respuesta.
// Se arma con lo que hay en la app al momento (lo que trajo la última búsqueda completa en MARCanet).
import type { PrismaClient } from "@prisma/client";
import { TIPOS_OFICIO, TIPOS_SIGNO } from "./catalogos";
import { DIA, sumarMeses, siguientePlazo, estaVencida } from "./plazos";
import { ventanaDDU, vigenciaDe } from "./cumplimiento";
import { PASOS_OFICIO } from "./estado-oficio";
import { tipoDesdeImpi } from "./marcanet/sincronizar";

type Base = { id: string; clienteId: string; denominacion: string; numeroExpediente: string | null; cliente: string };

export type Ganada = Base & {
  registro: string | null;
  concesion: Date | null;
  /** declaración de uso: periodo, si ya se presentó y si quedó pendiente */
  ddu: { inicio: Date; fin: Date; presentada: boolean } | null;
  renovacion: { vence: Date; presentada: boolean } | null;
  /** lo próximo que le toca (para ordenar y para "próximos 12 meses") */
  proximo: { que: "Declaración de uso" | "Renovación"; fecha: Date } | null;
  vencida: string | null;
};
export type Perdida = Base & { fecha: Date | null; motivo: string; detalle: string | null };
export type OficioCurso = Base & { tipo: string; notificado: Date; paso: string; limite: Date; vencido: boolean };
export type Movimiento = Base & { fecha: Date; texto: string };

const MOTIVO_NEGATIVA: Record<string, string> = {
  ANTERIORIDAD: "Anterioridad: ya existía una marca igual o parecida",
  IMPEDIMENTO: "Impedimento legal (descriptiva, genérica u otro impedimento de la ley)",
  REQUERIMIENTO: "No se cubrieron los requisitos que pidió el IMPI",
};

export async function datosReporteGeneral(db: PrismaClient, hoy = new Date()) {
  const marcas = await db.expediente.findMany({
    where: { tipo: { in: TIPOS_SIGNO } },
    select: {
      id: true, clienteId: true, denominacion: true, numeroExpediente: true, numeroRegistro: true, etapa: true, fechaConcesion: true, desistio: true, juicioNulidad: true,
      ultimaActImpi: true, ultimaActImpiFecha: true, ultimaActImpiDe: true,
      cliente: { select: { nombre: true } },
      notificaciones: { select: { tipo: true, estado: true, fechaNotificacion: true, fechaLimite: true, fechaLimiteRevision: true, pendienteNotificar: true } },
      oficiosImpi: { select: { descripcion: true, fechaNotificacion: true, fechaOficio: true } },
      tramitesImpi: { select: { descripcion: true, fechaInicio: true, fechaConclusion: true } },
    },
  });
  const base = (m: (typeof marcas)[number]): Base => ({ id: m.id, clienteId: m.clienteId, denominacion: m.denominacion, numeroExpediente: m.numeroExpediente, cliente: m.cliente.nombre });
  const en12 = sumarMeses(hoy, 12);

  const ganadas: Ganada[] = [];
  const negadas: Perdida[] = [];
  const abandonadas: Perdida[] = [];
  const oficios: OficioCurso[] = [];
  const enEspera: Movimiento[] = [];
  const contestaron: Movimiento[] = [];
  let enTramite = 0;

  for (const m of marcas) {
    const fechaOf = (o: { fechaNotificacion: Date | null; fechaOficio: Date | null }) => o.fechaNotificacion ?? o.fechaOficio;
    // Tipos de oficio que tuvo la marca (de la app y de MARCanet), con su fecha
    const previos = [
      ...m.notificaciones.map((n) => ({ tipo: n.tipo, fecha: n.fechaNotificacion, noPago: n.estado === "NO_PAGO" })),
      ...m.oficiosImpi.map((o) => ({ tipo: tipoDesdeImpi(o.descripcion), fecha: fechaOf(o), noPago: false })),
    ].filter((x): x is { tipo: string; fecha: Date; noPago: boolean } => !!x.tipo && !!x.fecha);

    if (m.etapa === "CONCEDIDA" || m.numeroRegistro) {
      const c = m.fechaConcesion;
      const tramite = (re: RegExp, desde?: Date) => m.tramitesImpi.some((t) => re.test(t.descripcion) && (!desde || (t.fechaInicio && t.fechaInicio >= desde)));
      const v = c ? ventanaDDU(c) : null;
      const ddu = v ? { ...v, presentada: tramite(/DECLARACI[OÓ]N DE USO/i) } : null;
      const vence = c ? vigenciaDe(c) : null;
      const renovacion = vence ? { vence, presentada: tramite(/RENOVACI/i, sumarMeses(vence, -6)) } : null;
      const pendientes = [
        ...(ddu && !ddu.presentada && ddu.fin >= hoy ? [{ que: "Declaración de uso" as const, fecha: ddu.fin }] : []),
        ...(renovacion && !renovacion.presentada && sumarMeses(renovacion.vence, 6) >= hoy ? [{ que: "Renovación" as const, fecha: renovacion.vence }] : []),
      ].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
      const vencida =
        renovacion && !renovacion.presentada && sumarMeses(renovacion.vence, 6) < hoy ? "Registro vencido sin renovar"
        : ddu && !ddu.presentada && ddu.fin < hoy ? "Declaración de uso no presentada a tiempo"
        : null;
      ganadas.push({ ...base(m), registro: m.numeroRegistro, concesion: c, ddu, renovacion, proximo: pendientes[0] ?? null, vencida });
      continue;
    }

    if (m.etapa === "ABANDONADA" || m.desistio) {
      const abandono = m.oficiosImpi.filter((o) => /ABANDON/i.test(o.descripcion)).map(fechaOf).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
      const ultimo = previos.filter((p) => !abandono || p.fecha <= abandono).sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
      const oficio = (t: string) => (t === "OTRO" || !TIPOS_OFICIO[t] ? "un oficio del IMPI" : `el oficio de ${TIPOS_OFICIO[t].toLowerCase()}`);
      const motivo = m.desistio
        ? "El cliente ya no quiso continuar"
        : ultimo?.noPago
          ? `No se contestó ${oficio(ultimo.tipo)}: el cliente no pagó`
          : ultimo
            ? `No se contestó ${oficio(ultimo.tipo)}`
            : "Abandonada sin detalle del oficio en MARCanet";
      abandonadas.push({ ...base(m), fecha: m.desistio ?? abandono, motivo, detalle: ultimo ? `Oficio notificado el ${ultimo.fecha.toLocaleDateString("es-MX", { timeZone: "UTC" })}` : null });
      continue;
    }

    if (m.etapa === "NEGATIVA" || m.etapa === "CONFIRMA_ACTO") {
      const neg = m.oficiosImpi.filter((o) => /NEGATIVA|CONFIRMA EL ACTO/i.test(o.descripcion)).map(fechaOf).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? m.notificaciones.filter((n) => n.tipo === "NEGATIVA").map((n) => n.fechaNotificacion).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const causa = previos.filter((p) => p.tipo in MOTIVO_NEGATIVA && (!neg || p.fecha <= neg)).sort((a, b) => b.fecha.getTime() - a.fecha.getTime())[0];
      const enRecurso = m.tramitesImpi.some((t) => /RECURSO DE REVISI|NULIDAD/i.test(t.descripcion) && !t.fechaConclusion) || !!m.juicioNulidad;
      const noPago = m.notificaciones.some((n) => n.tipo === "NEGATIVA" && n.estado === "NO_PAGO");
      negadas.push({
        ...base(m),
        fecha: neg,
        motivo: causa ? MOTIVO_NEGATIVA[causa.tipo] : "Sin detalle del motivo en MARCanet",
        detalle: m.etapa === "CONFIRMA_ACTO" ? "Se confirmó la negativa en el recurso de revisión" : enRecurso ? "Con recurso o juicio de nulidad en curso" : noPago ? "El cliente no quiso impugnarla" : null,
      });
      continue;
    }

    enTramite++;
    // Oficios en curso
    for (const n of m.notificaciones.filter((x) => ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"].includes(x.estado))) {
      oficios.push({ ...base(m), tipo: TIPOS_OFICIO[n.tipo] ?? n.tipo, notificado: n.fechaNotificacion, paso: PASOS_OFICIO[n.estado] ?? n.estado, limite: siguientePlazo(n, hoy).fecha, vencido: estaVencida(n, hoy) });
    }
    // Última actualización en MARCanet: lo presentamos nosotros (en espera) o contestó el IMPI
    if (m.ultimaActImpi && m.ultimaActImpiFecha) {
      const mov = { ...base(m), fecha: m.ultimaActImpiFecha, texto: m.ultimaActImpi };
      if (m.ultimaActImpiDe === "DESPACHO") enEspera.push(mov);
      else if (hoy.getTime() - m.ultimaActImpiFecha.getTime() <= 90 * DIA) contestaron.push(mov);
    }
  }

  ganadas.sort((a, b) => (a.proximo?.fecha.getTime() ?? Infinity) - (b.proximo?.fecha.getTime() ?? Infinity) || a.denominacion.localeCompare(b.denominacion, "es"));
  negadas.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
  abandonadas.sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));
  oficios.sort((a, b) => a.limite.getTime() - b.limite.getTime());
  enEspera.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  contestaron.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

  const proximas = ganadas.filter((g) => g.proximo && g.proximo.fecha <= en12);
  const contar = (lista: Perdida[]) => Object.entries(lista.reduce<Record<string, number>>((a, p) => ((a[p.motivo] = (a[p.motivo] ?? 0) + 1), a), {})).sort((a, b) => b[1] - a[1]);

  return {
    total: marcas.length,
    enTramite,
    ganadas,
    proximas,
    ddu12: proximas.filter((g) => g.proximo!.que === "Declaración de uso").length,
    renov12: proximas.filter((g) => g.proximo!.que === "Renovación").length,
    sinFecha: ganadas.filter((g) => !g.concesion).length,
    vencidas: ganadas.filter((g) => g.vencida),
    negadas,
    abandonadas,
    motivosNegadas: contar(negadas),
    motivosAbandonadas: contar(abandonadas),
    oficios,
    enEspera,
    contestaron,
  };
}

export type ReporteGeneral = Awaited<ReturnType<typeof datosReporteGeneral>>;

const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "0%");
const fmt = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Párrafos breves al final del reporte: qué dice y qué conviene hacer. */
export function conclusiones(r: ReporteGeneral): string[] {
  const out: string[] = [];
  out.push(
    `De las ${r.total.toLocaleString("es-MX")} marcas que llevamos, ${r.ganadas.length.toLocaleString("es-MX")} están registradas (${pct(r.ganadas.length, r.total)}), ${r.enTramite.toLocaleString("es-MX")} siguen en trámite y ${(r.negadas.length + r.abandonadas.length).toLocaleString("es-MX")} se perdieron por negativa o abandono.`
  );
  const prox = r.proximas[0];
  out.push(
    r.proximas.length
      ? `En los próximos 12 meses vencen ${r.ddu12} declaraciones de uso y ${r.renov12} renovaciones; la primera es ${prox.denominacion} (${prox.proximo!.que.toLowerCase()}, ${fmt(prox.proximo!.fecha)}). Son oportunidades de venta claras: conviene contactar a esos clientes con anticipación.`
      : "En los próximos 12 meses no vence ninguna declaración de uso ni renovación."
  );
  if (r.vencidas.length) out.push(`${r.vencidas.length} registros tienen la declaración de uso o la renovación vencida sin presentar: vale la pena revisar si aún se pueden rescatar o proponer una nueva solicitud.`);
  const mn = r.motivosNegadas[0];
  const ma = r.motivosAbandonadas[0];
  if (r.negadas.length || r.abandonadas.length) {
    out.push(
      [
        r.negadas.length ? `De las ${r.negadas.length} negadas, el motivo más frecuente es: ${mn[0].toLowerCase()} (${mn[1]}).` : "",
        r.abandonadas.length ? `De las ${r.abandonadas.length} abandonadas, la causa principal es: ${ma[0].toLowerCase()} (${ma[1]}).` : "",
        "Una búsqueda previa más cuidadosa y el seguimiento al pago de las contestaciones reducen estas pérdidas.",
      ].filter(Boolean).join(" ")
    );
  }
  const porAvisar = r.oficios.filter((o) => o.paso.startsWith("Recibida") || o.paso.startsWith("Cliente avisado")).length;
  out.push(
    `Hay ${r.oficios.length} oficios en curso (${porAvisar} esperan aviso o pago del cliente y ${r.oficios.length - porAvisar} están pagados por trabajar o presentar), ${r.enEspera.length} marcas esperan respuesta del IMPI a lo que ya presentamos y ${r.contestaron.length} recibieron respuesta en los últimos 3 meses.`
  );
  return out;
}

