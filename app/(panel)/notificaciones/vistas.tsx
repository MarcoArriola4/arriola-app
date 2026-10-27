"use client";
import { useEffect } from "react";
import { marcarNotificacionesVistas } from "@/app/actions";

/** Al ver el tablero, las notificaciones nuevas cuentan como vistas: se quita el numerito del menú. */
export function MarcarVistas() {
  useEffect(() => {
    const t = setTimeout(() => void marcarNotificacionesVistas().catch(() => {}), 1500);
    // El numerito del menú se quita en cuanto se ve el tablero
    const quitar = setTimeout(() => document.querySelectorAll("[data-numerito=notificaciones]").forEach((e) => e.remove()), 1500);
    return () => { clearTimeout(t); clearTimeout(quitar); };
  }, []);
  return null;
}
