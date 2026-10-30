"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/**
 * Menú desplegable de acciones. Las opciones siguen montadas aunque el menú se cierre,
 * así las ventanas que abren (editar, unir…) se quedan abiertas.
 */
export function MenuOpciones({ titulo = "Opciones", children }: { titulo?: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="btn">
        <MoreHorizontal size={14} /> {titulo} <ChevronDown size={14} className={`transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      <div
        // Al elegir una opción el menú se cierra (la ventana que abra, si abre una, se queda)
        onClick={() => setAbierto(false)}
        className={`${abierto ? "" : "hidden"} absolute right-0 z-40 mt-1.5 w-56 overflow-hidden rounded-xl border border-black/[0.08] bg-white p-1 shadow-xl
          [&_.btn]:w-full [&_.btn]:justify-start [&_.btn]:rounded-lg [&_.btn]:border-0 [&_.btn]:bg-transparent [&_.btn]:shadow-none [&_.btn:hover]:bg-neutral-100`}
      >
        {children}
      </div>
    </div>
  );
}
