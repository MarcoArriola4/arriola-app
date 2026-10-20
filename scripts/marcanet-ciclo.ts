// Ciclo de revisión con MARCanet (lo ejecuta GitHub Actions cada 6 horas):
//  1. Búsqueda completa: revisa TODAS las marcas sin parar (en bloques de ~5.5 h) hasta terminar.
//  2. Al terminar, espera `diasEntreBarridos` (7) días; mientras, revisa una vez al día las marcas con oficios en curso y las nuevas.
//  3. Pasados los días, empieza otra búsqueda completa.
// Uso: npm run marcanet:ciclo -- --horas=5.5
import { db } from "../lib/db";
import { DIA } from "../lib/plazos";
import { ACTIVAS } from "../lib/consultas";
import { TIPOS_SIGNO } from "../lib/catalogos";
import { expedientesParaHoy, sincronizarMarcanet } from "../lib/marcanet/sincronizar";

const horas = Number(process.argv.find((a) => a.startsWith("--horas="))?.split("=")[1] ?? 5.5);
const log = (m: string) => console.log(`[${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}] ${m}`);

async function main() {
  let cfg = await db.configuracion.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });
  const ahora = new Date();

  // ¿Toca empezar una búsqueda completa?
  const enBarrido = cfg.barridoInicio && !cfg.barridoTermino;
  const toca = !cfg.barridoTermino || ahora.getTime() - cfg.barridoTermino.getTime() >= cfg.diasEntreBarridos * DIA;
  if (!enBarrido && toca) {
    cfg = await db.configuracion.update({ where: { id: "main" }, data: { barridoInicio: ahora, barridoTermino: null } });
    log("Empieza una búsqueda completa de todas las marcas");
  }

  if (cfg.barridoInicio && !cfg.barridoTermino) {
    const inicio = cfg.barridoInicio;
    // Todas las marcas (prioridad: oficios en curso, activas, resto) que aún no se revisan en esta búsqueda
    const pendientes = (await expedientesParaHoy(db, 100000)).filter((e) => !e.marcanetSync || e.marcanetSync < inicio);
    log(`Búsqueda completa: faltan ${pendientes.length} marcas`);
    if (pendientes.length) {
      const r = await sincronizarMarcanet({ modo: "BARRIDO", expedientes: pendientes, horasMax: horas, barrido: inicio, alAvanzar: (i, t) => { if (i % 50 === 0) log(`  ${i}/${t}`); } });
      log(`Bloque terminado: ${r.consultados} revisadas, ${r.nuevos} oficios nuevos, ${r.contestados} contestados, ${r.errores} errores.`);
    }
    const quedan = await db.expediente.count({
      where: { numeroExpediente: { not: null }, tipo: { in: TIPOS_SIGNO }, OR: [{ marcanetSync: null }, { marcanetSync: { lt: inicio } }] },
    });
    // Los números que no son del IMPI (s/n, MX/…) no cuentan; con menos de 10 pendientes (errores sueltos) se da por terminada
    const realesQuedan = (await expedientesParaHoy(db, 100000)).filter((e) => !e.marcanetSync || e.marcanetSync < inicio).length;
    if (realesQuedan < 10) {
      await db.configuracion.update({ where: { id: "main" }, data: { barridoTermino: new Date() } });
      log(`Búsqueda completa TERMINADA (${quedan} sin revisar por error). La próxima empieza en ${cfg.diasEntreBarridos} días.`);
    }
    return;
  }

  // Entre búsquedas completas: oficios en curso, una vez al día
  if (cfg.ultimaRevisionActivos && ahora.getTime() - cfg.ultimaRevisionActivos.getTime() < 20 * 3600 * 1000) {
    const proxima = new Date(cfg.barridoTermino!.getTime() + cfg.diasEntreBarridos * DIA);
    log(`En espera. Próxima búsqueda completa: ${proxima.toLocaleDateString("es-MX")}. Nada que hacer ahora.`);
    return;
  }
  // Oficios en curso + marcas nuevas que nunca se han consultado (las que se dan de alta durante el mes)
  const activos = (
    await db.expediente.findMany({
      where: {
        numeroExpediente: { not: null },
        tipo: { in: TIPOS_SIGNO },
        OR: [{ notificaciones: { some: { estado: { in: ACTIVAS } } } }, { marcanetSync: null }],
      },
    })
  ).filter((e) => /^\d{5,8}$/.test(e.numeroExpediente ?? ""));
  log(`Revisión diaria: ${activos.length} marcas (oficios en curso y marcas nuevas)`);
  const r = await sincronizarMarcanet({ modo: "NOCTURNO", expedientes: activos, horasMax: Math.min(horas, 2) });
  await db.configuracion.update({ where: { id: "main" }, data: { ultimaRevisionActivos: new Date() } });
  log(`Listo: ${r.consultados} revisadas, ${r.nuevos} oficios nuevos, ${r.contestados} contestados.`);
}

main()
  .catch((e) => {
    // Los registros de GitHub son públicos: solo el tipo de error, nunca su detalle (podría incluir datos)
    const err = e as { code?: string; name?: string };
    console.error(`Error: ${err.code ?? err.name ?? "desconocido"}`);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
