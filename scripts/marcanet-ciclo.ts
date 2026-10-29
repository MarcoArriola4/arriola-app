// Ciclo de revisión con MARCanet (lo ejecuta GitHub Actions cada 6 horas):
//  1. Búsqueda completa: revisa TODAS las marcas sin parar (en bloques de ~5.5 h) hasta terminar.
//  2. Al terminar, espera `diasEntreBarridos` (7) días; mientras, revisa una vez al día las marcas con oficios en curso y las nuevas.
//  3. Pasados los días, empieza otra búsqueda completa.
// Uso: npm run marcanet:ciclo -- --horas=5.5
import { db } from "../lib/db";
import { DIA } from "../lib/plazos";
import { ACTIVAS } from "../lib/consultas";
import { TIPOS_SIGNO } from "../lib/catalogos";
import { sincronizarMarcanet } from "../lib/marcanet/sincronizar";
import { expedientesDelBarrido } from "../lib/marcanet/seleccion";
import { procesarAuditoria } from "../lib/marcanet/auditoria";

const horas = Number(process.argv.find((a) => a.startsWith("--horas="))?.split("=")[1] ?? 5);
const log = (m: string) => console.log(`[${new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}] ${m}`);

/** Marcas con oficios en curso (y, si se pide, las que nunca se han consultado). */
async function marcasConOficiosEnCurso(conNuevas = false) {
  const lista = await db.expediente.findMany({
    where: {
      numeroExpediente: { not: null },
      tipo: { in: TIPOS_SIGNO },
      OR: [{ notificaciones: { some: { estado: { in: ACTIVAS } } } }, ...(conNuevas ? [{ marcanetSync: null }] : [])],
    },
    orderBy: { marcanetSync: { sort: "asc", nulls: "first" } },
  });
  return lista.filter((e) => /^\d{5,8}$/.test(e.numeroExpediente ?? ""));
}

async function main() {
  let cfg = await db.configuracion.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });
  const ahora = new Date();

  // La app (Vercel) ya está trabajando en segundo plano: GitHub no se encima (es solo respaldo).
  // Si no, GitHub toma el candado mientras corre para que la app no consulte MARCanet al mismo tiempo.
  const candado = await db.configuracion.updateMany({
    where: { id: "main", OR: [{ trabajadorHasta: null }, { trabajadorHasta: { lt: ahora } }] },
    data: { trabajadorHasta: new Date(ahora.getTime() + (horas + 0.5) * 3600 * 1000) },
  });
  if (!candado.count) {
    log("La app está trabajando en segundo plano; nada que hacer aquí.");
    return;
  }
  try {
    await cicloConCandado(cfg, ahora);
  } finally {
    await db.configuracion.update({ where: { id: "main" }, data: { trabajadorHasta: null } });
  }
}

async function cicloConCandado(cfgInicial: Awaited<ReturnType<typeof db.configuracion.upsert>>, ahora: Date) {
  let cfg = cfgInicial;

  // Corridas que GitHub cortó (sin hora de término): se cierran para que no se queden "en curso" para siempre
  await db.syncMarcanet.updateMany({
    where: { fin: null, inicio: { lt: new Date(ahora.getTime() - 6 * 3600 * 1000) } },
    data: { fin: ahora, mensaje: "Interrumpida: la corrida se cortó por tiempo (lo que faltó se revisa en el siguiente bloque)" },
  });

  // 0) Auditorías (búsqueda por titular / apoderado) pedidas desde la app: tienen prioridad
  await db.auditoria.updateMany({ where: { estado: "BUSCANDO", creado: { lt: new Date(ahora.getTime() - 6 * 3600 * 1000) } }, data: { estado: "PENDIENTE" } });
  for (const a of await db.auditoria.findMany({ where: { estado: "PENDIENTE" }, orderBy: { creado: "asc" }, take: 3 })) {
    log("Auditoría pedida desde la app");
    try {
      await procesarAuditoria(db, a.id, log);
    } catch (e) {
      await db.auditoria.updateMany({ where: { id: a.id, estado: { in: ["PENDIENTE", "BUSCANDO"] } }, data: { estado: "ERROR", avance: e instanceof Error ? e.message : "Error" } });
      log("La auditoría terminó con error");
    }
  }

  // 1) Revisión de oficios en curso pedida desde la app (botón "Revisar ahora los oficios en curso")
  if (cfg.solicitudActivos) {
    await db.configuracion.update({ where: { id: "main" }, data: { solicitudActivos: null } });
    const activos = await marcasConOficiosEnCurso();
    log(`Revisión de oficios en curso pedida desde la app: ${activos.length} marcas`);
    const r = await sincronizarMarcanet({ modo: "ACTIVOS", expedientes: activos, horasMax: Math.min(horas, 2) });
    log(`Listo: ${r.consultados} revisadas, ${r.nuevos} oficios nuevos, ${r.contestados} contestados, ${r.errores} errores.`);
    cfg = await db.configuracion.findUniqueOrThrow({ where: { id: "main" } });
  }

  // 1b) Marcas puntuales pedidas desde la app (reporte de un cliente)
  if (cfg.solicitudMarcas) {
    const ids = cfg.solicitudMarcas.split(",").filter(Boolean);
    await db.configuracion.update({ where: { id: "main" }, data: { solicitudMarcas: null } });
    const marcas = (await db.expediente.findMany({ where: { id: { in: ids }, numeroExpediente: { not: null } } })).filter((e) => /^\d{5,8}$/.test(e.numeroExpediente ?? ""));
    log(`Marcas pedidas desde la app: ${marcas.length}`);
    const r = await sincronizarMarcanet({ modo: "ACTIVOS", expedientes: marcas, horasMax: Math.min(horas, 2) });
    log(`Listo: ${r.consultados} revisadas, ${r.nuevos} oficios nuevos, ${r.errores} errores.`);
    cfg = await db.configuracion.findUniqueOrThrow({ where: { id: "main" } });
  }

  // 2) Búsqueda completa pedida desde la app (botón "Actualizar todas")
  if (cfg.solicitudBusqueda) {
    const enCurso = cfg.barridoInicio && !cfg.barridoTermino;
    const data: Record<string, unknown> = { solicitudBusqueda: null };
    if (enCurso && cfg.barridoPausa) {
      // Detenida hace menos de 30 h: continúa donde se quedó; si no, empieza de cero
      if (ahora.getTime() - cfg.barridoPausa.getTime() < 30 * 3600 * 1000) Object.assign(data, { barridoPausa: null });
      else Object.assign(data, { barridoPausa: null, barridoInicio: ahora });
    } else if (!enCurso) {
      Object.assign(data, { barridoInicio: ahora, barridoTermino: null, barridoPausa: null });
    }
    cfg = await db.configuracion.update({ where: { id: "main" }, data });
    log("Búsqueda completa pedida desde la app");
  }

  // ¿Toca empezar una búsqueda completa?
  const enBarrido = cfg.barridoInicio && !cfg.barridoTermino;
  const toca = !cfg.barridoTermino || ahora.getTime() - cfg.barridoTermino.getTime() >= cfg.diasEntreBarridos * DIA;
  if (!enBarrido && toca && !cfg.barridoPausa) {
    cfg = await db.configuracion.update({ where: { id: "main" }, data: { barridoInicio: ahora, barridoTermino: null } });
    log("Empieza una búsqueda completa de todas las marcas");
  }

  if (cfg.barridoInicio && !cfg.barridoTermino && cfg.barridoPausa) {
    log("Búsqueda completa detenida por el administrador (se continúa desde la app). Solo revisión diaria de oficios en curso.");
  } else if (cfg.barridoInicio && !cfg.barridoTermino) {
    const inicio = cfg.barridoInicio;
    // Todas las marcas (prioridad: oficios en curso, activas, resto) que aún no se revisan en esta búsqueda
    // (registradas sin novedades y abandonadas hace más de un mes no entran: ver lib/marcanet/seleccion.ts)
    const { lista, omitidas } = await expedientesDelBarrido(db);
    const pendientes = lista.filter((e) => !e.marcanetSync || e.marcanetSync < inicio);
    log(`Se omiten ${omitidas.registradas} registradas sin novedades y ${omitidas.abandonadas} abandonadas hace más de un mes`);
    log(`Búsqueda completa: faltan ${pendientes.length} marcas`);
    if (pendientes.length) {
      const r = await sincronizarMarcanet({ modo: "BARRIDO", expedientes: pendientes, horasMax: horas, barrido: inicio, alAvanzar: (i, t) => { if (i % 50 === 0) log(`  ${i}/${t}`); } });
      log(`Bloque terminado: ${r.consultados} revisadas, ${r.nuevos} oficios nuevos, ${r.contestados} contestados, ${r.errores} errores.`);
    }
    const quedan = await db.expediente.count({
      where: { numeroExpediente: { not: null }, tipo: { in: TIPOS_SIGNO }, OR: [{ marcanetSync: null }, { marcanetSync: { lt: inicio } }] },
    });
    // Los números que no son del IMPI (s/n, MX/…) no cuentan; con menos de 10 pendientes (errores sueltos) se da por terminada
    const realesQuedan = (await expedientesDelBarrido(db)).lista.filter((e) => !e.marcanetSync || e.marcanetSync < inicio).length;
    if (realesQuedan < 10) {
      await db.configuracion.update({ where: { id: "main" }, data: { barridoTermino: new Date() } });
      // Queda escrito en el último bloque para el reporte
      const ultimo = await db.syncMarcanet.findFirst({ where: { modo: "BARRIDO", barrido: inicio }, orderBy: { inicio: "desc" } });
      if (ultimo) await db.syncMarcanet.update({ where: { id: ultimo.id }, data: { mensaje: [`Búsqueda completa TERMINADA · ${realesQuedan} sin revisar`, ultimo.mensaje].filter(Boolean).join(" — ") } });
      log(`Búsqueda completa TERMINADA (${quedan} sin revisar por error). La próxima empieza en ${cfg.diasEntreBarridos} días.`);
    }
    return;
  }

  // Entre búsquedas completas: oficios en curso, una vez al día
  if (cfg.ultimaRevisionActivos && ahora.getTime() - cfg.ultimaRevisionActivos.getTime() < 20 * 3600 * 1000) {
    const proxima = cfg.barridoTermino ? new Date(cfg.barridoTermino.getTime() + cfg.diasEntreBarridos * DIA).toLocaleDateString("es-MX") : "al reanudarla";
    log(`En espera. Próxima búsqueda completa: ${proxima}. Nada que hacer ahora.`);
    return;
  }
  // Oficios en curso + marcas nuevas que nunca se han consultado (las que se dan de alta durante el mes)
  const activos = await marcasConOficiosEnCurso(true);
  log(`Revisión diaria: ${activos.length} marcas (oficios en curso y marcas nuevas)`);
  const r = await sincronizarMarcanet({ modo: "NOCTURNO", expedientes: activos, horasMax: Math.min(horas, 2) });
  // Si MARCanet no respondió, se reintenta en ~1 hora en lugar de esperar al día siguiente
  const fallo = r.consultados === 0 && r.errores > 0;
  await db.configuracion.update({ where: { id: "main" }, data: { ultimaRevisionActivos: fallo ? new Date(Date.now() - 19 * 3600 * 1000) : new Date() } });
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
