// Marcas dadas de alta en la app que el Excel pudo haber creado otra vez (misma denominación, distinto registro).
import { db } from "../lib/db";
import { normalizarNombre } from "../lib/catalogos";

async function main() {
  const altas = await db.evento.findMany({ where: { importado: false, titulo: { startsWith: "Alta de servicio" } }, select: { expedienteId: true } });
  const ids = [...new Set(altas.map((a) => a.expedienteId))];
  const deApp = await db.expediente.findMany({ where: { id: { in: ids } }, include: { cliente: { select: { nombre: true } } } });
  const todos = await db.expediente.findMany({ select: { id: true, denominacion: true, numeroExpediente: true, clienteId: true, cliente: { select: { nombre: true } } } });
  const porNombre = new Map<string, typeof todos>();
  for (const e of todos) {
    const k = normalizarNombre(e.denominacion);
    porNombre.set(k, [...(porNombre.get(k) ?? []), e]);
  }
  const posibles = deApp.flatMap((a) =>
    (porNombre.get(normalizarNombre(a.denominacion)) ?? [])
      .filter((o) => o.id !== a.id)
      .map((o) => `${a.denominacion} — app: exp ${a.numeroExpediente ?? "s/n"} (${a.cliente.nombre}) · Excel: exp ${o.numeroExpediente ?? "s/n"} (${o.cliente.nombre})`)
  );
  console.log({ altasEnApp: deApp.length, posiblesDuplicados: posibles.length });
  posibles.forEach((p) => console.log(" -", p));
}

main().finally(() => db.$disconnect());
