// Trabajo en segundo plano dentro de la app (Vercel): auditorías, revisión de oficios en curso, marcas pedidas
// y la búsqueda completa. Cada corrida trabaja ~4 min y, si queda trabajo, se vuelve a llamar sola.
// Así no depende de que GitHub corra a tiempo (GitHub queda como respaldo).
import type { PrismaClient } from "@prisma/client";
import { cargarInhabiles } from "./inhabiles";
import { DIA } from "./plazos";
import { TIPOS_SIGNO } from "./catalogos";
import { avanzarAuditoria } from "./marcanet/auditoria";
import { MarcanetCuotaError } from "./marcanet/consulta";
import { expedientesDelBarrido } from "./marcanet/seleccion";
import { sincronizarExpediente } from "./marcanet/sincronizar";

export const PRESUPUESTO_MS = 200 * 1000; // la función dura máx. 300 s: se deja margen
const CANDADO_MS = 6 * 60 * 1000;
const ESPERA_CUOTA_MS = 11 * 60 * 1000;
const ACTIVAS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"];

/** Toma el candado (solo una corrida a la vez). false = ya hay otra trabajando. */
export async function tomarCandado(db: PrismaClient) {
  const ahora = new Date();
  const r = await db.configuracion.updateMany({
    where: { id: "main", OR: [{ trabajadorHasta: null }, { trabajadorHasta: { lt: ahora } }] },
    data: { trabajadorHasta: new Date(ahora.getTime() + CANDADO_MS) },
  });
  return r.count === 1;
}
export const soltarCandado = (db: PrismaClient) => db.configuracion.update({ where: { id: "main" }, data: { trabajadorHasta: null } });

/** ¿Hay algo que hacer? */
export async function hayTrabajo(db: PrismaClient) {
  const cfg = await db.configuracion.findUnique({ where: { id: "main" } });
  if (!cfg) return false;
  if (await db.auditoria.count({ where: { estado: { in: ["PENDIENTE", "BUSCANDO"] } } })) return true;
  return !!(cfg.solicitudActivos || cfg.solicitudMarcas || cfg.solicitudBusqueda || (cfg.barridoInicio && !cfg.barridoTermino && !cfg.barridoPausa));
}

/**
 * Programa lo automático (lo llama el cron diario de Vercel): empieza la búsqueda completa cuando toca (cada 7 días)
 * y pide la revisión diaria de los oficios en curso.
 */
export async function programarAutomatico(db: PrismaClient) {
  const cfg = await db.configuracion.upsert({ where: { id: "main" }, update: {}, create: { id: "main" } });
  const ahora = new Date();
  const data: Record<string, unknown> = {};
  const enBarrido = cfg.barridoInicio && !cfg.barridoTermino;
  if (!enBarrido && !cfg.barridoPausa && (!cfg.barridoTermino || ahora.getTime() - cfg.barridoTermino.getTime() >= cfg.diasEntreBarridos * DIA)) {
    Object.assign(data, { barridoInicio: ahora, barridoTermino: null });
  }
  if (!cfg.ultimaRevisionActivos || ahora.getTime() - cfg.ultimaRevisionActivos.getTime() > 20 * 3600 * 1000) data.solicitudActivos = ahora;
  if (Object.keys(data).length) await db.configuracion.update({ where: { id: "main" }, data });
}

/** Revisa una lista de marcas en MARCanet hasta el límite de tiempo y deja registro. Devuelve cuántas faltan. */
async function revisarMarcas(db: PrismaClient, modo: string, pendientes: Awaited<ReturnType<typeof db.expediente.findMany>>, limite: number, barrido?: Date) {
  const inhabiles = await cargarInhabiles(db);
  const sync = await db.syncMarcanet.create({ data: { modo, total: pendientes.length, barrido: barrido ?? null } });
  const t = { consultados: 0, errores: 0, nuevos: 0, contestados: 0 };
  let mensaje: string | null = null;
  let i = 0;
  try {
    for (; i < pendientes.length && Date.now() < limite; i++) {
      const exp = pendientes[i];
      try {
        const r = await sincronizarExpediente(db, exp, inhabiles);
        t.consultados++;
        t.nuevos += r.nuevos;
        t.contestados += r.contestados;
      } catch (e) {
        if (e instanceof MarcanetCuotaError) throw e;
        t.errores++;
        await db.expediente.update({ where: { id: exp.id }, data: { marcanetError: e instanceof Error ? e.message : String(e), marcanetSync: new Date() } });
      }
    }
  } catch (e) {
    if (!(e instanceof MarcanetCuotaError)) throw e;
    await db.configuracion.update({ where: { id: "main" }, data: { esperaCuotaHasta: new Date(Date.now() + ESPERA_CUOTA_MS) } });
    mensaje = "Pausa obligatoria de MARCanet (10 min); continúa sola";
  } finally {
    await db.syncMarcanet.update({ where: { id: sync.id }, data: { ...t, total: pendientes.length, fin: new Date(), mensaje: mensaje ?? (i < pendientes.length ? `Tramo de la app: ${pendientes.length - i} siguen en el próximo tramo` : null) } });
  }
  return pendientes.length - i;
}

const valido = (n: string | null) => /^\d{5,8}$/.test(n ?? "");

/** Una corrida: trabaja hasta `limite` en orden de prioridad. Devuelve true si queda trabajo. */
export async function trabajar(db: PrismaClient, limite = Date.now() + PRESUPUESTO_MS): Promise<boolean> {
  let cfg = await db.configuracion.findUniqueOrThrow({ where: { id: "main" } });
  // MARCanet pidió esperar: no se consulta hasta que pase (la cadena sigue viva)
  if (cfg.esperaCuotaHasta && cfg.esperaCuotaHasta > new Date()) return true;

  try {
    // 1) Auditorías
    for (const a of await db.auditoria.findMany({ where: { estado: { in: ["PENDIENTE", "BUSCANDO"] } }, orderBy: { creado: "asc" } })) {
      if (Date.now() > limite) return true;
      try {
        if (!(await avanzarAuditoria(db, a.id, limite))) return true;
      } catch (e) {
        if (e instanceof MarcanetCuotaError) throw e;
        await db.auditoria.updateMany({ where: { id: a.id, estado: { in: ["PENDIENTE", "BUSCANDO"] } }, data: { estado: "ERROR", avance: e instanceof Error ? e.message : "Error" } });
      }
    }

    // 2) Oficios en curso (botón o revisión diaria): las que no se han revisado desde que se pidió
    if (cfg.solicitudActivos) {
      const desde = cfg.solicitudActivos;
      const pendientes = (
        await db.expediente.findMany({
          where: { numeroExpediente: { not: null }, tipo: { in: TIPOS_SIGNO }, notificaciones: { some: { estado: { in: ACTIVAS } } }, OR: [{ marcanetSync: null }, { marcanetSync: { lt: desde } }] },
          orderBy: { marcanetSync: { sort: "asc", nulls: "first" } },
        })
      ).filter((e) => valido(e.numeroExpediente));
      const faltan = pendientes.length ? await revisarMarcas(db, "ACTIVOS", pendientes, limite) : 0;
      if (faltan > 0) return true;
      await db.configuracion.update({ where: { id: "main" }, data: { solicitudActivos: null, ultimaRevisionActivos: new Date() } });
    }

    // 3) Marcas puntuales (reporte de un cliente)
    if (cfg.solicitudMarcas) {
      const desde = cfg.solicitudMarcasEn ?? new Date(0);
      const ids = cfg.solicitudMarcas.split(",").filter(Boolean);
      const pendientes = (await db.expediente.findMany({ where: { id: { in: ids }, OR: [{ marcanetSync: null }, { marcanetSync: { lt: desde } }] } })).filter((e) => valido(e.numeroExpediente));
      const faltan = pendientes.length ? await revisarMarcas(db, "ACTIVOS", pendientes, limite) : 0;
      if (faltan > 0) return true;
      await db.configuracion.update({ where: { id: "main" }, data: { solicitudMarcas: null, solicitudMarcasEn: null } });
    }

    // 4) Búsqueda completa: pedida con el botón o en curso
    cfg = await db.configuracion.findUniqueOrThrow({ where: { id: "main" } });
    if (cfg.solicitudBusqueda) {
      const ahora = new Date();
      const enCurso = cfg.barridoInicio && !cfg.barridoTermino;
      const data: Record<string, unknown> = { solicitudBusqueda: null };
      if (enCurso && cfg.barridoPausa) Object.assign(data, ahora.getTime() - cfg.barridoPausa.getTime() < 30 * 3600 * 1000 ? { barridoPausa: null } : { barridoPausa: null, barridoInicio: ahora });
      else if (!enCurso) Object.assign(data, { barridoInicio: ahora, barridoTermino: null, barridoPausa: null });
      cfg = await db.configuracion.update({ where: { id: "main" }, data });
    }
    if (cfg.barridoInicio && !cfg.barridoTermino && !cfg.barridoPausa) {
      const inicio = cfg.barridoInicio;
      const pendientes = (await expedientesDelBarrido(db)).lista.filter((e) => !e.marcanetSync || e.marcanetSync < inicio);
      const faltan = pendientes.length ? await revisarMarcas(db, "BARRIDO", pendientes, limite, inicio) : 0;
      if (faltan >= 10) return true;
      await db.configuracion.update({ where: { id: "main" }, data: { barridoTermino: new Date() } });
      const ultimo = await db.syncMarcanet.findFirst({ where: { modo: "BARRIDO", barrido: inicio }, orderBy: { inicio: "desc" } });
      if (ultimo) await db.syncMarcanet.update({ where: { id: ultimo.id }, data: { mensaje: `Búsqueda completa TERMINADA · ${faltan} sin revisar` } });
    }
    return false;
  } catch (e) {
    if (e instanceof MarcanetCuotaError) {
      await db.configuracion.update({ where: { id: "main" }, data: { esperaCuotaHasta: new Date(Date.now() + ESPERA_CUOTA_MS) } });
      return true;
    }
    throw e;
  }
}
