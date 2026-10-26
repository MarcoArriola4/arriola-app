// Qué marcas entran en cada búsqueda completa de MARCanet.
// - Registradas (concedidas): solo si se les agregó algo nuevo en la app desde su última consulta,
//   o si están cerca de los 3 años (declaración de uso) o de los 10 años (renovación).
// - Abandonadas desde hace más de 1 mes: ya no se revisan (salvo que se les agregue algo nuevo).
// - Todas las demás (en trámite, con oficio, negativas, en juicio…): siempre.
import type { Expediente, PrismaClient } from "@prisma/client";
import { DIA, sumarMeses } from "../plazos";
import { expedientesParaHoy } from "./sincronizar";
import { REFORMA_DDU } from "../cumplimiento";

const UN_MES = 30 * DIA;

/** ¿La fecha está dentro de la ventana [desdeMeses, hastaMeses] contados desde la concesión? */
function enVentana(concesion: Date, desdeMeses: number, hastaMeses: number, hoy: Date) {
  return hoy >= sumarMeses(concesion, desdeMeses) && hoy <= sumarMeses(concesion, hastaMeses);
}

export type MotivoOmitida = "REGISTRADA" | "ABANDONADA";

/** Marcas de la búsqueda completa (en orden de prioridad) y las que se omiten por regla. */
export async function expedientesDelBarrido(db: PrismaClient, hoy = new Date()) {
  const todas = await expedientesParaHoy(db, 100000);
  const ids = todas.map((e) => e.id);
  const especiales = await db.expediente.findMany({
    where: { id: { in: ids }, OR: [{ etapa: { in: ["CONCEDIDA", "ABANDONADA"] } }, { numeroRegistro: { not: null } }, { desistio: { not: null } }] },
    select: {
      id: true, etapa: true, numeroRegistro: true, fechaConcesion: true, marcanetSync: true, desistio: true, ultimaActImpiFecha: true,
      oficiosImpi: { where: { descripcion: { contains: "ABANDON", mode: "insensitive" } }, select: { fechaNotificacion: true, fechaOficio: true } },
      servicios: { select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      notificaciones: { where: { fuente: { not: "MARCANET" } }, select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      notasMarca: { select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
      eventos: { where: { importado: false, OR: [{ autor: null }, { autor: { not: "MARCanet" } }] }, select: { creado: true }, orderBy: { creado: "desc" }, take: 1 },
    },
  });
  // Con un oficio en curso siempre se revisa
  const conOficio = new Set(
    (await db.notificacion.findMany({ where: { expedienteId: { in: especiales.map((e) => e.id) }, estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] } }, select: { expedienteId: true } })).map((n) => n.expedienteId)
  );
  const omitir = new Map<string, MotivoOmitida>();
  for (const e of especiales) {
    if (!e.marcanetSync || conOficio.has(e.id)) continue; // nunca consultada (se revisa una vez) o con oficio en curso
    const sync = e.marcanetSync;
    // ¿Se ingresó algo nuevo en la app sobre esta marca desde la última consulta?
    const nuevo = [e.servicios[0]?.creado, e.notificaciones[0]?.creado, e.notasMarca[0]?.creado, e.eventos[0]?.creado].some((d) => d && d > sync);
    if (nuevo) continue;
    if (e.etapa === "ABANDONADA" || e.desistio) {
      const fechas = [e.desistio, ...e.oficiosImpi.map((o) => o.fechaNotificacion ?? o.fechaOficio), e.etapa === "ABANDONADA" ? e.ultimaActImpiFecha : null].filter(Boolean) as Date[];
      const desde = fechas.length ? new Date(Math.max(...fechas.map((d) => d.getTime()))) : null;
      // Sin fecha conocida (abandonada desde el Excel) o hace más de un mes: ya no se revisa
      if (!desde || hoy.getTime() - desde.getTime() > UN_MES) omitir.set(e.id, "ABANDONADA");
      continue;
    }
    // Registrada: solo cerca de la declaración de uso (3 años) o de la renovación (10 años)
    const concesion = e.fechaConcesion;
    // (la DDU a los 3 años solo aplica a marcas concedidas a partir del 10/08/2018)
    const cerca = concesion && ((concesion >= REFORMA_DDU && enVentana(concesion, 34, 39, hoy)) || enVentana(concesion, 114, 126, hoy));
    if (!cerca) omitir.set(e.id, "REGISTRADA");
  }
  const lista: Expediente[] = todas.filter((e) => !omitir.has(e.id));
  return {
    lista,
    omitidas: { registradas: [...omitir.values()].filter((m) => m === "REGISTRADA").length, abandonadas: [...omitir.values()].filter((m) => m === "ABANDONADA").length },
  };
}
