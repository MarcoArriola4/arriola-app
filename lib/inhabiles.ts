import type { PrismaClient } from "@prisma/client";
import { db as dbDefault } from "./db";
import { INHABILES_OFICIALES } from "./inhabiles-oficiales";
import { plazosDeOficio, type Inhabiles } from "./plazos";

/** Días inhábiles del IMPI guardados en la base; la primera vez carga los oficiales del DOF. */
export async function cargarInhabiles(db: PrismaClient = dbDefault): Promise<Inhabiles> {
  let filas = await db.diaInhabil.findMany({ select: { fecha: true } });
  if (filas.length === 0) {
    await db.diaInhabil.createMany({
      data: INHABILES_OFICIALES.map((d) => ({ fecha: new Date(`${d.fecha}T00:00:00Z`), motivo: d.motivo, fuente: d.fuente })),
    });
    filas = await db.diaInhabil.findMany({ select: { fecha: true } });
  }
  return new Set(filas.map((f) => f.fecha.toISOString().slice(0, 10)));
}

/** Recalcula los plazos de todos los oficios cuya fecha límite no se escribió a mano. */
export async function recalcularPlazos(db: PrismaClient = dbDefault) {
  const inh = await cargarInhabiles(db);
  const notifs = await db.notificacion.findMany({ where: { limiteManual: false }, select: { id: true, tipo: true, fechaNotificacion: true } });
  for (const n of notifs) {
    await db.notificacion.update({ where: { id: n.id }, data: plazosDeOficio(n.tipo, n.fechaNotificacion, inh) });
  }
  return notifs.length;
}
