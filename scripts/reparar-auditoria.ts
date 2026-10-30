// Vuelve a consultar en MARCanet las marcas de una auditoría que quedaron como «No se pudo consultar».
// Uso: npx tsx scripts/reparar-auditoria.ts <id de la auditoría>
import { PrismaClient } from "@prisma/client";
import { consultarMarcanet, MarcanetCuotaError } from "../lib/marcanet/consulta";
import { analizarMarca, type ResultadoAuditoria } from "../lib/marcanet/auditoria";
import { ultimaActualizacion } from "../lib/marcanet/sincronizar";

const db = new PrismaClient();
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

(async () => {
  const id = process.argv[2];
  const a = await db.auditoria.findUniqueOrThrow({ where: { id } });
  const r: ResultadoAuditoria = JSON.parse(a.resultado!);
  const malas = r.marcas.filter((m) => m.error);
  let bien = 0;
  for (const m of malas) {
    try {
      const x = await consultarMarcanet(m.expediente, { tipo: m.tipoSolicitud, registro: m.registro, denominacion: m.denominacion });
      const an = analizarMarca(x, new Date());
      Object.assign(m, { estatus: an.estatus, tono: an.tono, categoria: an.categoria, ddu: an.ddu, renovacion: an.renovacion, contestaciones: an.contestaciones, vigencia: iso(an.vigencia) });
      const u = ultimaActualizacion(x);
      m.ultimo = u ? { fecha: u.fecha.toISOString(), texto: u.texto } : null;
      m.fechaPresentacion = iso(x.fechaPresentacion);
      m.fechaConcesion = iso(x.fechaConcesion);
      delete m.error;
      bien++;
    } catch (e) {
      if (e instanceof MarcanetCuotaError) { console.log("MARCanet pidió esperar; se guarda lo hecho"); break; }
    }
    if (bien % 5 === 0) await db.auditoria.update({ where: { id }, data: { resultado: JSON.stringify(r) } });
  }
  await db.auditoria.update({ where: { id }, data: { resultado: JSON.stringify(r) } });
  console.log(`Reparadas ${bien} de ${malas.length}`);
  await db.$disconnect();
})();
