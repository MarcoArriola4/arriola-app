// Une en un solo cliente los registros de la misma persona con distinta razón social:
// "JUAN PÉREZ LÓPEZ / EMPRESA UNO" + "JUAN PÉREZ LÓPEZ / EMPRESA DOS" → "JUAN PÉREZ LÓPEZ".
// Cada marca conserva su titular completo para verse separada dentro del cliente.
// Uso: npx tsx --env-file=.env.production.local scripts/unir-titulares.ts [--aplicar]
import { PrismaClient } from "@prisma/client";
import { normalizarNombre, personaDeTitular } from "../lib/catalogos";

const db = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

async function main() {
  // 1) Cada marca guarda el nombre completo con el que se registró
  const sinTitular = await db.expediente.findMany({ where: { titular: null }, select: { id: true, cliente: { select: { nombre: true } } } });
  if (aplicar) {
    for (const e of sinTitular) await db.expediente.update({ where: { id: e.id }, data: { titular: e.cliente.nombre } });
  }
  console.log(`Marcas sin titular: ${sinTitular.length}${aplicar ? " (completadas)" : ""}`);

  // 2) Clientes agrupados por persona
  const clientes = await db.cliente.findMany({ include: { _count: { select: { expedientes: true } } }, orderBy: { creado: "asc" } });
  const grupos = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const k = normalizarNombre(personaDeTitular(c.nombre));
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }

  let unidos = 0;
  let renombrados = 0;
  for (const [k, lista] of grupos) {
    const persona = personaDeTitular(lista[0].nombre);
    // Destino: el que ya se llama solo como la persona; si no, el que tiene más marcas
    const destino = lista.find((c) => c.nombreNorm === k) ?? [...lista].sort((a, b) => b._count.expedientes - a._count.expedientes)[0];
    const otros = lista.filter((c) => c.id !== destino.id);
    if (!otros.length && destino.nombreNorm === k) continue;
    if (!aplicar) {
      if (otros.length) unidos += otros.length;
      if (destino.nombreNorm !== k) renombrados++;
      continue;
    }
    await db.$transaction(async (tx) => {
      const tels = [...new Set(lista.map((c) => c.telefono).filter(Boolean))];
      const correos = lista.map((c) => c.email).filter(Boolean);
      for (const o of otros) {
        await tx.expediente.updateMany({ where: { clienteId: o.id }, data: { clienteId: destino.id } });
        await tx.cliente.delete({ where: { id: o.id } });
      }
      await tx.cliente.update({
        where: { id: destino.id },
        data: {
          nombre: persona,
          nombreNorm: k,
          telefono: tels.join(" / ") || null,
          email: destino.email ?? correos[0] ?? null,
          rfc: destino.rfc ?? lista.map((c) => c.rfc).find(Boolean) ?? null,
          notas: [...new Set(lista.map((c) => c.notas).filter(Boolean))].join("\n") || null,
        },
      });
    });
    unidos += otros.length;
    if (destino.nombreNorm !== k) renombrados++;
  }
  console.log(`Clientes unidos a otro de la misma persona: ${unidos}`);
  console.log(`Clientes renombrados a solo la persona: ${renombrados}`);
  if (!aplicar) console.log("(simulación: usa --aplicar para guardar)");
}

main().finally(() => db.$disconnect());
