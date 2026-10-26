import { db } from "../db";
import { DIA } from "../plazos";
import { expedientesDelBarrido } from "./seleccion";

export type EstadoBarrido = {
  activo: boolean;
  /** el admin la detuvo con el tache (se continúa a mano o se reanuda) */
  pausada: boolean;
  pausadaEn: string | null;
  inicio: string | null;
  termino: string | null;
  proximo: string | null;
  revisadas: number;
  total: number;
  /** marcas de esta búsqueda que terminaron con error de consulta */
  errores: number;
  /** al terminar: marcas que se quedaron sin revisar */
  faltaron: number;
  omitidas: { registradas: number; abandonadas: number };
  /** se pidió desde la app; GitHub la toma en ≤15 min */
  solicitada: boolean;
  /** revisión de oficios en curso pedida desde la app */
  activos: {
    solicitada: boolean;
    enCurso: { revisadas: number; total: number } | null;
    ultima: { fin: string; consultados: number; total: number; nuevos: number; contestados: number; errores: number } | null;
  };
  /** segundos aproximados que faltan (según la velocidad real de esta búsqueda) */
  restanteSeg: number | null;
  calculadoEn: string;
};

/** Avance de la búsqueda completa de cada 7 días, su resultado y su tiempo aproximado restante. */
export async function estadoBarrido(): Promise<EstadoBarrido> {
  const cfg = await db.configuracion.findUnique({ where: { id: "main" } });
  const ahora = new Date();
  const { lista: todas, omitidas } = await expedientesDelBarrido(db);
  const inicio = cfg?.barridoInicio ?? null;
  const pausada = !!inicio && !cfg?.barridoTermino && !!cfg?.barridoPausa;
  const activo = !!inicio && !cfg?.barridoTermino && !pausada;
  const revisadasLista = inicio ? todas.filter((e) => e.marcanetSync && e.marcanetSync >= inicio) : [];
  const revisadas = revisadasLista.length;
  const errores = revisadasLista.filter((e) => e.marcanetError).length;
  let restanteSeg: number | null = null;
  if (activo && inicio) {
    const transcurrido = (ahora.getTime() - inicio.getTime()) / 1000;
    const faltan = todas.length - revisadas;
    // Velocidad real (incluye pausas de MARCanet y esperas entre bloques); al inicio se estiman 28 s por marca
    const porMarca = revisadas >= 20 ? transcurrido / revisadas : 28;
    restanteSeg = Math.round(faltan * porMarca);
  }
  const [corriendoActivos, ultimaActivos] = await Promise.all([
    db.syncMarcanet.findFirst({ where: { modo: "ACTIVOS", fin: null, inicio: { gte: new Date(ahora.getTime() - 3 * 3600 * 1000) } }, orderBy: { inicio: "desc" } }),
    db.syncMarcanet.findFirst({ where: { modo: "ACTIVOS", fin: { not: null } }, orderBy: { inicio: "desc" } }),
  ]);
  return {
    activo,
    solicitada: !!cfg?.solicitudBusqueda,
    activos: {
      solicitada: !!cfg?.solicitudActivos,
      enCurso: corriendoActivos ? { revisadas: corriendoActivos.consultados + corriendoActivos.errores, total: corriendoActivos.total } : null,
      ultima: ultimaActivos
        ? { fin: ultimaActivos.fin!.toISOString(), consultados: ultimaActivos.consultados, total: ultimaActivos.total, nuevos: ultimaActivos.nuevos, contestados: ultimaActivos.contestados, errores: ultimaActivos.errores }
        : null,
    },
    pausada,
    pausadaEn: cfg?.barridoPausa?.toISOString() ?? null,
    inicio: inicio?.toISOString() ?? null,
    termino: cfg?.barridoTermino?.toISOString() ?? null,
    proximo: cfg?.barridoTermino ? new Date(cfg.barridoTermino.getTime() + cfg.diasEntreBarridos * DIA).toISOString() : null,
    revisadas,
    total: todas.length,
    errores,
    faltaron: cfg?.barridoTermino ? Math.max(0, todas.length - revisadas) : 0,
    omitidas,
    restanteSeg,
    calculadoEn: ahora.toISOString(),
  };
}
