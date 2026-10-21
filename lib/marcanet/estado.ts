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
  return {
    activo,
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
