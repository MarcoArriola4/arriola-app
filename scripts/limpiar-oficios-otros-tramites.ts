// Quita los oficios de MARCanet que vienen de trámites distintos a "Solicitud de registro" y "Recurso de revisión".
import { db } from "../lib/db";

async function main() {
  const fuera = await db.oficioImpi.findMany({
    where: { NOT: [{ tramite: { contains: "SOLICITUD DE REGISTRO", mode: "insensitive" } }, { tramite: { contains: "RECURSO DE REVISI", mode: "insensitive" } }] },
    select: { numero: true, descripcion: true, tramite: true },
  });
  const numeros = fuera.map((o) => o.numero);
  // Tarjetas creadas por MARCanet a partir de esos oficios (si nadie las movió en la app) se quitan; las del Excel solo se desligan
  const borradas = await db.notificacion.deleteMany({ where: { numeroOficio: { in: numeros }, fuente: "MARCANET", editadoEnApp: false } });
  const desligadas = await db.notificacion.updateMany({ where: { numeroOficio: { in: numeros } }, data: { numeroOficio: null, pendienteNotificar: false } });
  const oficios = await db.oficioImpi.deleteMany({ where: { numero: { in: numeros } } });
  const promos = await db.promocionImpi.deleteMany({
    where: { tramite: { not: null }, NOT: [{ tramite: { contains: "SOLICITUD DE REGISTRO", mode: "insensitive" } }, { tramite: { contains: "RECURSO DE REVISI", mode: "insensitive" } }] },
  });
  console.log({ oficiosQuitados: oficios.count, tarjetasBorradas: borradas.count, tarjetasDesligadas: desligadas.count, promocionesQuitadas: promos.count, ejemplos: fuera.slice(0, 8).map((o) => `${o.tramite} · ${o.descripcion}`) });
}

main().finally(() => db.$disconnect());
