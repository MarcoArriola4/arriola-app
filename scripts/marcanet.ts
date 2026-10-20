// Actualiza los expedientes con MARCanet (IMPI).
//   npm run marcanet                 → corrida diaria (activos + rotación)
//   npm run marcanet -- 3384695 ...  → solo esos expedientes
import { db } from "../lib/db";
import { sincronizarMarcanet } from "../lib/marcanet/sincronizar";
import { enviarResumen } from "../lib/alertas";

async function main() {
  const horas = Number(process.argv.find((a) => a.startsWith("--horas="))?.split("=")[1] ?? 5);
  const numeros = process.argv.slice(2).filter((a) => !a.startsWith("--")).flatMap((a) => a.split(/[\s,]+/)).filter((a) => /^\d+$/.test(a));
  const expedientes = numeros.length ? await db.expediente.findMany({ where: { numeroExpediente: { in: numeros } } }) : undefined;
  const t0 = Date.now();
  console.log(`[${new Date().toLocaleString("es-MX")}] Actualizando con MARCanet${numeros.length ? `: ${numeros.join(", ")}` : " (corrida diaria)"}…`);
  const r = await sincronizarMarcanet({
    modo: numeros.length > 1 ? "MANUAL" : numeros.length ? "EXPEDIENTE" : "NOCTURNO",
    expedientes,
    horasMax: horas,
    alAvanzar: (i, total) => { if (i % 25 === 0 || i === total) console.log(`  ${i}/${total}`); },
  });
  console.log({ consultados: r.consultados, errores: r.errores, nuevos: r.nuevos, contestados: r.contestados, mensaje: r.mensaje }, `${Math.round((Date.now() - t0) / 60000)} min`);
  if (!numeros.length && process.argv.includes("--correo")) console.log("Correo:", await enviarResumen());
}

main().finally(() => db.$disconnect());
