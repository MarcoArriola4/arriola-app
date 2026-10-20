import { db } from "../db";
import { DIA } from "../plazos";
import { expedientesParaHoy } from "./sincronizar";

export type EstadoBarrido = {
  activo: boolean;
  inicio: string | null;
  termino: string | null;
  proximo: string | null;
  revisadas: number;
  total: number;
  /** segundos aproximados que faltan (según la velocidad real de esta búsqueda) */
  restanteSeg: number | null;
  calculadoEn: string;
};

/** Avance de la búsqueda completa de cada 7 días y su tiempo aproximado restante. */
export async function estadoBarrido(): Promise<EstadoBarrido> {
  const cfg = await db.configuracion.findUnique({ where: { id: "main" } });
  const ahora = new Date();
  const todas = await expedientesParaHoy(db, 100000);
  const inicio = cfg?.barridoInicio ?? null;
  const activo = !!inicio && !cfg?.barridoTermino;
  const revisadas = inicio ? todas.filter((e) => e.marcanetSync && e.marcanetSync >= inicio).length : 0;
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
    inicio: inicio?.toISOString() ?? null,
    termino: cfg?.barridoTermino?.toISOString() ?? null,
    proximo: cfg?.barridoTermino ? new Date(cfg.barridoTermino.getTime() + cfg.diasEntreBarridos * DIA).toISOString() : null,
    revisadas,
    total: todas.length,
    restanteSeg,
    calculadoEn: ahora.toISOString(),
  };
}
