// Elimina expedientes duplicados sin número del IMPI (mismo cliente + misma denominación).
// Conserva el que tenga movimientos hechos en la app; si ninguno, el más reciente.
import { db } from "../lib/db";

async function main() {
  const sinNumero = await db.expediente.findMany({
    where: { numeroExpediente: null },
    select: {
      id: true, clienteId: true, denominacion: true, creado: true,
      _count: { select: { notificaciones: true } },
      servicios: { select: { filaExcel: true, editadoEnApp: true } },
      eventos: { where: { importado: false }, select: { id: true } },
    },
  });
  const grupos = new Map<string, typeof sinNumero>();
  for (const e of sinNumero) {
    const k = `${e.clienteId}|${e.denominacion.trim().toUpperCase()}`;
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  const usado = (e: (typeof sinNumero)[number]) =>
    e._count.notificaciones > 0 || e.eventos.length > 0 || e.servicios.some((s) => s.filaExcel === null || s.editadoEnApp);
  let borrados = 0;
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;
    const conservar = lista.find(usado) ?? [...lista].sort((a, b) => b.creado.getTime() - a.creado.getTime())[0];
    const borrar = lista.filter((e) => e.id !== conservar.id);
    if (borrar.some(usado)) console.log("⚠️ Grupo con más de un expediente usado en la app, se revisa a mano:", conservar.denominacion);
    else {
      await db.expediente.deleteMany({ where: { id: { in: borrar.map((e) => e.id) } } });
      borrados += borrar.length;
    }
  }
  console.log({ expedientesSinNumero: sinNumero.length, grupos: grupos.size, borrados, total: await db.expediente.count(), servicios: await db.servicio.count() });
}

main().finally(() => db.$disconnect());
