// Marcas recién concedidas (últimos 90 días): para avisar al cliente y venderle el título de concesión.
import type { PrismaClient } from "@prisma/client";
import { TIPOS_SIGNO } from "./catalogos";

export const DIAS_CONCESION_RECIENTE = 90;

export async function concesionesRecientes(db: PrismaClient, hoy = new Date()) {
  const desde = new Date(hoy.getTime() - DIAS_CONCESION_RECIENTE * 864e5);
  const marcas = await db.expediente.findMany({
    // Solo concesiones comprobadas: estatus Concedida y número de registro (el IMPI lo asigna al conceder), o confirmada
    // a mano (estatus puesto en la app, p. ej. al marcar el oficio como «Título»). Una fecha sola no basta
    // (p. ej. una fecha tomada de una nota del Excel).
    where: {
      tipo: { in: TIPOS_SIGNO }, etapa: "CONCEDIDA", fechaConcesion: { gte: desde, lte: hoy }, desistio: null,
      OR: [{ numeroRegistro: { not: null } }, { etapaManual: true }],
    },
    select: {
      id: true, clienteId: true, denominacion: true, numeroExpediente: true, numeroRegistro: true, fechaConcesion: true,
      tituloNotificado: true, tituloVendido: true, tituloNota: true,
      cliente: { select: { nombre: true, telefono: true, email: true } },
      servicios: { where: { tipo: "TITULO" }, select: { id: true, fechaContratacion: true, vendedor: true }, take: 1, orderBy: { creado: "desc" } },
    },
    orderBy: { fechaConcesion: "desc" },
  });
  // Vendido: marcado aquí o con una venta de título registrada en Contrataciones
  return marcas.map((m) => ({ ...m, vendido: m.tituloVendido ?? m.servicios[0]?.fechaContratacion ?? (m.servicios[0] ? new Date() : null) }));
}

export type ConcesionReciente = Awaited<ReturnType<typeof concesionesRecientes>>[number];
