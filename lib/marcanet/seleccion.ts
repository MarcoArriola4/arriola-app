// Qué marcas entran en cada búsqueda completa de MARCanet.
// - Registradas: solo si se les agregó algo nuevo en la app, o en sus periodos clave:
//     · Declaración de uso (concedidas desde el 10/08/2018): desde 1 semana antes del 3er aniversario de la concesión
//       hasta que la declaración salga favorable o hasta 3 meses después del aniversario (fin del plazo).
//     · Renovación: desde 6 meses antes de que venza la vigencia hasta 6 meses después (periodo de gracia).
// - Abandonadas o que el cliente ya no quiere continuar (desde hace más de 1 mes): ya no se revisan.
// - Negativas: se siguen revisando 2 meses desde que se notificó (puede presentarse recurso de revisión o juicio de
//   nulidad); pasado eso, sin recurso en MARCanet ni juicio de nulidad registrado en la app, ya no se revisan.
//   Con juicio de nulidad registrado (botón en la marca) se revisa siempre.
// - Todas las demás (en trámite, con oficio, en juicio…): siempre.
import type { Expediente, PrismaClient } from "@prisma/client";
import { DIA, sumarMeses } from "../plazos";
import { REFORMA_DDU, vigenciaDe } from "../cumplimiento";
import { expedientesParaHoy } from "./sincronizar";

const UN_MES = 30 * DIA;
const ACTIVAS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"];

export type MotivoOmitida = "REGISTRADA" | "ABANDONADA" | "NEGADA";
export type Omitida = { id: string; clienteId: string; denominacion: string; numeroExpediente: string | null; motivo: MotivoOmitida; proximaRevision: Date | null; porque: string | null };

/** Periodos en que una marca registrada se vuelve a revisar. */
export function periodosRegistrada(concesion: Date) {
  const periodos: { inicio: Date; fin: Date; que: string }[] = [];
  if (concesion >= REFORMA_DDU) periodos.push({ inicio: new Date(sumarMeses(concesion, 36).getTime() - 7 * DIA), fin: sumarMeses(concesion, 39), que: "declaración de uso" });
  const vigencia = vigenciaDe(concesion);
  periodos.push({ inicio: sumarMeses(vigencia, -6), fin: sumarMeses(vigencia, 6), que: "renovación" });
  return periodos;
}

/** Marcas de la búsqueda completa (en orden de prioridad) y las que se omiten por regla, con su próxima revisión. */
export async function expedientesDelBarrido(db: PrismaClient, hoy = new Date()) {
  const todas = await expedientesParaHoy(db, 100000);
  const ids = todas.map((e) => e.id);
  const especiales = await db.expediente.findMany({
    where: { id: { in: ids }, OR: [{ etapa: { in: ["CONCEDIDA", "ABANDONADA", "NEGATIVA"] } }, { numeroRegistro: { not: null } }, { desistio: { not: null } }] },
    select: {
      id: true, clienteId: true, denominacion: true, numeroExpediente: true, etapa: true, numeroRegistro: true, fechaConcesion: true, marcanetSync: true, desistio: true, juicioNulidad: true, ultimaActImpiFecha: true,
      oficiosImpi: { where: { OR: [{ descripcion: { contains: "ABANDON", mode: "insensitive" } }, { descripcion: { contains: "NEGATIVA", mode: "insensitive" } }, { descripcion: { contains: "CONFIRMA EL ACTO", mode: "insensitive" } }] }, select: { descripcion: true, fechaNotificacion: true, fechaOficio: true } },
      tramitesImpi: { select: { descripcion: true, fechaInicio: true, fechaConclusion: true } },
      servicios: { select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      notificaciones: { where: { fuente: { not: "MARCANET" } }, select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      notasMarca: { select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      eventos: { where: { importado: false, OR: [{ autor: null }, { autor: { not: "MARCanet" } }] }, select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
    },
  });
  // Con un oficio en curso siempre se revisa
  const conOficio = new Set(
    (await db.notificacion.findMany({ where: { expedienteId: { in: especiales.map((e) => e.id) }, estado: { in: ACTIVAS } }, select: { expedienteId: true } })).map((n) => n.expedienteId)
  );
  const omitidas: Omitida[] = [];
  for (const e of especiales) {
    if (!e.marcanetSync || conOficio.has(e.id)) continue; // nunca consultada (se revisa una vez) o con oficio en curso
    if (e.juicioNulidad && !e.desistio) continue; // juicio de nulidad en curso (no se ve en MARCanet): siempre se revisa
    const sync = e.marcanetSync;
    // ¿Se ingresó algo nuevo en la app sobre esta marca desde la última consulta?
    const nuevo = [e.servicios[0]?.creado, e.notificaciones[0]?.creado, e.notasMarca[0]?.creado, e.eventos[0]?.creado].some((d) => d && d > sync);
    if (nuevo) continue;
    const base = { id: e.id, clienteId: e.clienteId, denominacion: e.denominacion, numeroExpediente: e.numeroExpediente };

    if (e.etapa === "ABANDONADA" || e.desistio) {
      const fechas = [e.desistio, ...e.oficiosImpi.filter((o) => /ABANDON/i.test(o.descripcion)).map((o) => o.fechaNotificacion ?? o.fechaOficio), e.etapa === "ABANDONADA" ? e.ultimaActImpiFecha : null].filter(Boolean) as Date[];
      const desde = fechas.length ? new Date(Math.max(...fechas.map((d) => d.getTime()))) : null;
      // Sin fecha conocida (abandonada desde el Excel) o hace más de un mes: ya no se revisa
      if (!desde || hoy.getTime() - desde.getTime() > UN_MES) omitidas.push({ ...base, motivo: "ABANDONADA", proximaRevision: null, porque: e.desistio ? "El cliente ya no quiso continuar" : "Abandonada" });
      continue;
    }
    if (e.etapa === "NEGATIVA") {
      // Negativa firme: notificada hace más de 2 meses y sin recurso (MARCanet) ni juicio de nulidad (app) en curso
      const neg = e.oficiosImpi.filter((o) => /NEGATIVA|CONFIRMA EL ACTO/i.test(o.descripcion)).map((o) => o.fechaNotificacion ?? o.fechaOficio).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
      const enRecurso = e.tramitesImpi.some((t) => /RECURSO DE REVISI|NULIDAD/i.test(t.descripcion) && !t.fechaConclusion);
      if (neg && !enRecurso && hoy.getTime() - neg.getTime() > 2 * UN_MES) omitidas.push({ ...base, motivo: "NEGADA", proximaRevision: null, porque: "Negativa no impugnada" });
      continue;
    }
    // Registrada: solo en sus periodos de declaración de uso y de renovación
    const concesion = e.fechaConcesion;
    if (!concesion) {
      omitidas.push({ ...base, motivo: "REGISTRADA", proximaRevision: null, porque: "Sin fecha de concesión en la app" });
      continue;
    }
    const dduFavorable = e.tramitesImpi.some((t) => /DECLARACI[OÓ]N DE USO/i.test(t.descripcion) && t.fechaConclusion);
    const renovada = e.tramitesImpi.some((t) => /RENOVACI/i.test(t.descripcion) && t.fechaConclusion && t.fechaInicio && t.fechaInicio >= sumarMeses(vigenciaDe(concesion), -6));
    const periodos = periodosRegistrada(concesion).filter((p) => !(p.que === "declaración de uso" && dduFavorable) && !(p.que === "renovación" && renovada));
    if (periodos.some((p) => hoy >= p.inicio && hoy <= p.fin)) continue; // está en su periodo: se revisa
    const siguiente = periodos.filter((p) => p.inicio > hoy).sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];
    omitidas.push({ ...base, motivo: "REGISTRADA", proximaRevision: siguiente?.inicio ?? null, porque: siguiente ? `Periodo de ${siguiente.que}` : null });
  }
  const fuera = new Set(omitidas.map((o) => o.id));
  const lista: Expediente[] = todas.filter((e) => !fuera.has(e.id));
  const cuenta = (m: MotivoOmitida) => omitidas.filter((o) => o.motivo === m).length;
  return { lista, omitidasDetalle: omitidas, omitidas: { registradas: cuenta("REGISTRADA"), abandonadas: cuenta("ABANDONADA") + cuenta("NEGADA") } };
}
