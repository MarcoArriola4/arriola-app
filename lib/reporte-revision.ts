// Reporte de cada revisión de marcas con MARCanet: qué se revisó, qué no y por qué (con su próxima revisión),
// qué cambió en el IMPI y los pendientes de los últimos 3 meses.
import type { PrismaClient } from "@prisma/client";
import { expedientesDelBarrido, type Omitida } from "./marcanet/seleccion";

export type Revision = { clave: string; modo: string; inicio: Date; fin: Date | null; revisadas: number; total: number; errores: number; enCurso: boolean };

const MODO: Record<string, string> = { BARRIDO: "Búsqueda completa", NOCTURNO: "Revisión diaria de oficios en curso", ACTIVOS: "Revisión de oficios en curso", MANUAL: "Revisión manual" };
export const nombreModo = (m: string) => MODO[m] ?? m;

/** Revisiones recientes (los bloques de una misma búsqueda completa se juntan en una). */
export async function listarRevisiones(db: PrismaClient, max = 20): Promise<Revision[]> {
  const corridas = await db.syncMarcanet.findMany({ where: { modo: { in: ["BARRIDO", "NOCTURNO", "ACTIVOS", "MANUAL"] }, consultados: { gt: 0 } }, orderBy: { inicio: "desc" }, take: 400 });
  const out: Revision[] = [];
  for (const c of corridas) {
    // Los tramos de la app de una misma revisión de oficios (separados por < 30 min) también se juntan
    const clave = c.modo === "BARRIDO" && c.barrido ? `B${c.barrido.toISOString()}` : c.id;
    const g = out.find((x) => x.clave === clave) ?? (c.modo === "ACTIVOS" ? out.find((x) => x.modo === "ACTIVOS" && x.inicio.getTime() - (c.fin ?? c.inicio).getTime() < 30 * 60000) : undefined);
    if (g) {
      if (c.inicio < g.inicio) g.inicio = c.inicio;
      if (c.fin && (!g.fin || c.fin > g.fin)) g.fin = c.fin;
      g.revisadas += c.consultados;
      g.total += c.consultados + c.errores;
      g.errores += c.errores;
      g.enCurso ||= !c.fin;
    } else {
      out.push({ clave, modo: c.modo, inicio: c.barrido ?? c.inicio, fin: c.fin, revisadas: c.consultados, total: c.consultados + c.errores, errores: c.errores, enCurso: !c.fin });
    }
    if (out.length > max) break;
  }
  return out.slice(0, max);
}

type MarcaBreve = { id: string; clienteId: string; denominacion: string; numeroExpediente: string | null; cliente: string; fecha: Date | null; detalle: string };

export type DatosRevision = {
  revision: Revision;
  novedades: { ganadas: MarcaBreve[]; negadas: MarcaBreve[]; abandonadas: MarcaBreve[]; oficios: MarcaBreve[]; contestadas: MarcaBreve[] };
  noRevisadas: { perdidas: (Omitida & { cliente: string })[]; registradas: (Omitida & { cliente: string })[] };
  conError: MarcaBreve[];
  tresMeses: {
    desde: Date;
    ingresadas: MarcaBreve[];
    porPagar: { cuantos: number; monto: number };
    porTrabajar: number;
    porPresentar: number;
    voBo: number;
    pagarSistema: number;
    oficiosPorAvisar: number;
    oficiosEsperandoPago: number;
  };
};

/** Todo lo que va en el reporte de una revisión. */
export async function datosRevision(db: PrismaClient, revision: Revision): Promise<DatosRevision> {
  const desde = revision.inicio;
  const hasta = new Date((revision.fin ?? new Date()).getTime() + 5 * 60000);
  const enVentana = { gte: desde, lte: hasta };

  // Lo que el IMPI movió durante la revisión (oficios detectados por primera vez)
  const oficios = await db.oficioImpi.findMany({
    where: { detectado: enVentana },
    include: { expediente: { select: { id: true, clienteId: true, denominacion: true, numeroExpediente: true, cliente: { select: { nombre: true } } } } },
    orderBy: { fechaOficio: "desc" },
  });
  const breve = (o: (typeof oficios)[number]): MarcaBreve => ({
    id: o.expediente.id, clienteId: o.expediente.clienteId, denominacion: o.expediente.denominacion, numeroExpediente: o.expediente.numeroExpediente, cliente: o.expediente.cliente.nombre,
    fecha: o.fechaNotificacion ?? o.fechaOficio, detalle: o.descripcion,
  });
  const interno = (d: string) => /ARCHIVO FON|EXAMEN FIGURATIVO/i.test(d);
  const ganadas = oficios.filter((o) => /CONCESI|T[IÍ]TULO DE REGISTRO|SE OTORGA/i.test(o.descripcion)).map(breve);
  const negadas = oficios.filter((o) => /NEGATIVA|CONFIRMA EL ACTO/i.test(o.descripcion)).map(breve);
  const abandonadas = oficios.filter((o) => /ABANDON/i.test(o.descripcion)).map(breve);
  const otros = oficios.filter((o) => !interno(o.descripcion) && !/CONCESI|T[IÍ]TULO DE REGISTRO|SE OTORGA|NEGATIVA|CONFIRMA EL ACTO|ABANDON/i.test(o.descripcion)).map(breve);
  const promos = await db.promocionImpi.findMany({
    where: { detectado: enVentana },
    include: { expediente: { select: { id: true, clienteId: true, denominacion: true, numeroExpediente: true, cliente: { select: { nombre: true } } } } },
  });
  const contestadas = promos.map((p) => ({ id: p.expediente.id, clienteId: p.expediente.clienteId, denominacion: p.expediente.denominacion, numeroExpediente: p.expediente.numeroExpediente, cliente: p.expediente.cliente.nombre, fecha: p.fechaPresentacion, detalle: p.descripcion }));

  // Marcas que no se revisan por regla (con su próxima revisión)
  const { omitidasDetalle } = await expedientesDelBarrido(db);
  const clientes = new Map((await db.cliente.findMany({ where: { id: { in: [...new Set(omitidasDetalle.map((o) => o.clienteId))] } }, select: { id: true, nombre: true } })).map((c) => [c.id, c.nombre]));
  const conCliente = omitidasDetalle.map((o) => ({ ...o, cliente: clientes.get(o.clienteId) ?? "" }));
  const perdidas = conCliente.filter((o) => o.motivo !== "REGISTRADA").sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es"));
  const registradas = conCliente.filter((o) => o.motivo === "REGISTRADA").sort((a, b) => (a.proximaRevision?.getTime() ?? Infinity) - (b.proximaRevision?.getTime() ?? Infinity));

  // Marcas que no se pudieron consultar en esta revisión
  const errores = await db.expediente.findMany({
    where: { marcanetError: { not: null }, marcanetSync: enVentana },
    select: { id: true, clienteId: true, denominacion: true, numeroExpediente: true, marcanetError: true, marcanetSync: true, cliente: { select: { nombre: true } } },
  });
  const conError = errores.map((e) => ({ id: e.id, clienteId: e.clienteId, denominacion: e.denominacion, numeroExpediente: e.numeroExpediente, cliente: e.cliente.nombre, fecha: e.marcanetSync, detalle: e.marcanetError ?? "" }));

  // Últimos 3 meses: lo que se contrató y lo que falta (pagar, trabajar, presentar…)
  const ahora = new Date();
  const desde3 = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() - 3, ahora.getDate()));
  const servicios = await db.servicio.findMany({
    where: { fechaContratacion: { gte: desde3 } },
    select: { tipo: true, costo: true, pagado: true, estadoTrabajo: true, fechaContratacion: true, expediente: { select: { id: true, clienteId: true, denominacion: true, numeroExpediente: true, cliente: { select: { nombre: true } } } } },
    orderBy: { fechaContratacion: "desc" },
  });
  const ingresadas = servicios
    .filter((s) => s.tipo === "REGISTRO")
    .map((s) => ({ id: s.expediente.id, clienteId: s.expediente.clienteId, denominacion: s.expediente.denominacion, numeroExpediente: s.expediente.numeroExpediente, cliente: s.expediente.cliente.nombre, fecha: s.fechaContratacion, detalle: s.estadoTrabajo ?? "" }));
  const conSaldo = servicios.filter((s) => (s.costo ?? 0) > s.pagado);
  const cuenta = (e: string) => servicios.filter((s) => s.estadoTrabajo === e).length;
  const [oficiosPorAvisar, oficiosEsperandoPago] = await Promise.all([
    db.notificacion.count({ where: { estado: "RECIBIDA", fechaNotificacion: { gte: desde3 } } }),
    db.notificacion.count({ where: { estado: "AVISADO", fechaNotificacion: { gte: desde3 } } }),
  ]);

  return {
    revision,
    novedades: { ganadas, negadas, abandonadas, oficios: otros, contestadas },
    noRevisadas: { perdidas, registradas },
    conError,
    tresMeses: {
      desde: desde3,
      ingresadas,
      porPagar: { cuantos: conSaldo.length, monto: conSaldo.reduce((a, s) => a + (s.costo ?? 0) - s.pagado, 0) },
      porTrabajar: cuenta("PENDIENTE"),
      porPresentar: cuenta("PRESENTAR"),
      voBo: cuenta("VOBO"),
      pagarSistema: cuenta("PAGAR_SISTEMA"),
      oficiosPorAvisar,
      oficiosEsperandoPago,
    },
  };
}
