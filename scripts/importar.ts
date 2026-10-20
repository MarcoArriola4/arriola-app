// Uso: npm run importar -- "../Pagos 2026 Actual.xlsx"
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { importarExcel } from "../lib/importar";

async function main() {
  // Uso por mes (recomendado): npm run importar -- "../Pagos 2026 Actual.xlsx" --mes=2026-10 [--mes=2026-09]
  const args = process.argv.slice(2);
  const archivo = args.find((a) => !a.startsWith("--")) ?? "../Pagos 2026 Actual.xlsx";
  const meses = args.filter((a) => a.startsWith("--mes=")).map((a) => a.slice(6));
  const rangoArg = args.find((a) => a.startsWith("--rango="))?.slice(8).split("-").map(Number) as [number, number] | undefined;
  console.log(`Importando ${archivo}${meses.length ? ` · meses ${meses.join(", ")}` : ""}${rangoArg ? ` · grupos ${rangoArg.join("-")}` : ""}…`);
  const t = Date.now();
  const r = await importarExcel(db, archivo, new Date(), { meses, rango: rangoArg });
  console.log(r, `${((Date.now() - t) / 1000).toFixed(1)} s`);

  await db.configuracion.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });

  if ((await db.usuario.count()) === 0) {
    // El correo del primer administrador se toma de ADMIN_EMAIL (no se guarda en el código)
    const correoAdmin = process.env.ADMIN_EMAIL;
    if (!correoAdmin) throw new Error("Define ADMIN_EMAIL en .env para crear el primer administrador");
    const password = randomBytes(6).toString("base64url");
    await db.usuario.create({
      data: { email: correoAdmin, nombre: "Administrador", rol: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
    });
    const f = "CREDENCIALES-INICIALES.txt";
    writeFileSync(f, `Usuario: ${correoAdmin}\nContraseña: ${password}\n\nCámbiala en Configuración después de entrar y borra este archivo.\n`);
    console.log(`Usuario administrador creado. Credenciales en ${f}`);
  }
}

main().finally(() => db.$disconnect());
