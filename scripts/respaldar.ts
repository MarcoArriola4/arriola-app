// Respaldo completo de la base (todas las tablas) a respaldos/base-AAAAMMDD-HHMM.json
import { writeFileSync, mkdirSync } from "fs";
import { Prisma } from "@prisma/client";
import { db } from "../lib/db";

async function main() {
  const salida: Record<string, unknown[]> = {};
  for (const m of Prisma.dmmf.datamodel.models) {
    // SQL directo: funciona aunque el esquema del código sea más nuevo que el de la base
    const existe = await db.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) as n from information_schema.tables where table_name = '${m.name}'`);
    if (Number(existe[0].n) === 0) continue;
    salida[m.name] = await db.$queryRawUnsafe(`select * from "${m.name}"`);
  }
  mkdirSync("respaldos", { recursive: true });
  const f = `respaldos/base-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.json`;
  writeFileSync(f, JSON.stringify(salida));
  console.log(f, Object.fromEntries(Object.entries(salida).map(([k, v]) => [k, v.length])));
}

main().finally(() => db.$disconnect());
