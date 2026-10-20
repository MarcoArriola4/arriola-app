// Copia todos los datos de la base local SQLite (prisma/dev.db) a PostgreSQL (DATABASE_URL).
// Uso (una sola vez): npx tsx --env-file=.env.production.local scripts/migrar-a-postgres.ts ruta/a/dev.db
import { execFileSync } from "child_process";
import { Prisma, PrismaClient } from "@prisma/client";

const archivo = process.argv[2] ?? "prisma/dev.db";
const db = new PrismaClient();

// Orden: primero las tablas de las que dependen las demás
const MODELOS = [
  "Usuario", "Configuracion", "DiaInhabil", "Cliente", "Expediente", "Notificacion", "Servicio",
  "Evento", "TramiteImpi", "OficioImpi", "PromocionImpi", "SyncMarcanet",
];

function leer(tabla: string): Record<string, unknown>[] {
  const salida = execFileSync("sqlite3", ["-json", archivo, `select * from "${tabla}"`], { maxBuffer: 512 * 1024 * 1024 }).toString();
  return salida.trim() ? JSON.parse(salida) : [];
}

async function main() {
  const existentes = await db.expediente.count();
  if (existentes > 0 && !process.argv.includes("--forzar")) {
    throw new Error(`La base destino ya tiene ${existentes} expedientes. Usa --forzar para borrarla y copiar de nuevo.`);
  }
  if (existentes > 0) {
    for (const m of [...MODELOS].reverse()) await (db as any)[m[0].toLowerCase() + m.slice(1)].deleteMany(); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  for (const nombre of MODELOS) {
    const modelo = Prisma.dmmf.datamodel.models.find((m) => m.name === nombre)!;
    const campos = modelo.fields.filter((f) => f.kind === "scalar");
    const filas = leer(nombre).map((fila) => {
      const out: Record<string, unknown> = {};
      for (const f of campos) {
        const v = fila[f.name];
        if (v === null || v === undefined) out[f.name] = null;
        else if (f.type === "DateTime") out[f.name] = new Date(typeof v === "number" ? v : String(v));
        else if (f.type === "Boolean") out[f.name] = v === 1 || v === true || v === "1";
        else if (f.type === "Float") out[f.name] = Number(v);
        else if (f.type === "Int") out[f.name] = Math.round(Number(v));
        else out[f.name] = v;
      }
      return out;
    });
    const delegado = (db as any)[nombre[0].toLowerCase() + nombre.slice(1)]; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let i = 0; i < filas.length; i += 500) await delegado.createMany({ data: filas.slice(i, i + 500) });
    const total = await delegado.count();
    console.log(`${nombre.padEnd(14)} ${String(filas.length).padStart(6)} filas → ${total} en PostgreSQL${total === filas.length ? "" : "  ⚠️ NO COINCIDE"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
