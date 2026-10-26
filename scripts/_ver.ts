import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const a = await db.auditoria.findUniqueOrThrow({ where: { id: "cmvph9cfj000093te6ddke2x1" } });
  const r = a.resultado ? JSON.parse(a.resultado) : null;
  console.log(new Date().toISOString().slice(11, 19), a.estado, a.avance, r?.marcas?.length ?? 0);
  console.log(await db.configuracion.findUnique({ where: { id: "main" }, select: { trabajadorHasta: true, esperaCuotaHasta: true, solicitudActivos: true } }));
  await db.$disconnect();
})();
