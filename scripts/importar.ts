// Uso: npm run importar -- "../Pagos 2026 Actual.xlsx"
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import { importarExcel } from "../lib/importar";

async function main() {
  const archivo = process.argv[2] ?? "../Pagos 2026 Actual.xlsx";
  console.log(`Importando ${archivo}…`);
  const t = Date.now();
  const r = await importarExcel(db, archivo);
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
