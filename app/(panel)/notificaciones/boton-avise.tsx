"use client";
import { useState, useTransition } from "react";
import { avisarCliente } from "@/app/actions";

/** "Ya avisé al cliente" de la lista por atender: si algo falla, lo dice aquí mismo en lugar de la pantalla de error. */
export function BotonAvise({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState(false);
  const avisar = () =>
    iniciar(async () => {
      setError(false);
      const f = new FormData();
      f.set("id", id);
      try {
        await avisarCliente(f);
      } catch {
        setError(true);
      }
    });
  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600">No se guardó; intenta de nuevo</span>}
      <button onClick={avisar} disabled={pendiente} className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60">
        {pendiente ? "Guardando…" : "Ya avisé al cliente"}
      </button>
    </span>
  );
}
