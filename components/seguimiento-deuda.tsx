"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { fijarSeguimientoCliente } from "@/app/actions";
import { SEGUIMIENTOS_DEUDA, mxn } from "@/lib/catalogos";

export type Deudor = {
  id: string;
  nombre: string;
  debe: number;
  seguimiento: string | null;
  nota: string | null;
  fecha: string | null;
  autor: string | null;
};

/** Un cliente que debe, con "¿Qué pasó?": va a pagar, dejó de contestar o ya no quiere (y una nota). */
export function FilaDeudor({ d }: { d: Deudor }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState(d.seguimiento);
  const [nota, setNota] = useState(d.nota ?? "");
  const [guardando, iniciar] = useTransition();
  const s = d.seguimiento ? SEGUIMIENTOS_DEUDA[d.seguimiento] : null;

  const guardar = (nuevo: string | null) =>
    iniciar(async () => {
      await fijarSeguimientoCliente(d.id, nuevo, nota);
      setAbierto(false);
    });

  return (
    <div className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/clientes/${d.id}`} className="min-w-0 truncate hover:underline">{d.nombre}</Link>
        <span className="shrink-0 font-semibold text-red-600">{mxn.format(d.debe)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {s && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.txt}</span>}
        {d.nota && !abierto && <span className="min-w-0 truncate text-[11px] text-neutral-500" title={d.nota}>“{d.nota}”</span>}
        <button type="button" onClick={() => setAbierto((v) => !v)} className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 hover:text-black">
          <MessageSquareText size={12} /> {s || d.nota ? "Cambiar" : "¿Qué pasó?"}
        </button>
      </div>
      {abierto && (
        <div className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SEGUIMIENTOS_DEUDA).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setEstado(estado === k ? null : k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${estado === k ? `${v.cls} ring-current` : "bg-white text-neutral-600 ring-black/10"}`}
              >
                {v.txt}
              </button>
            ))}
          </div>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota (ej. paga el viernes, no responde desde agosto…)"
            className="input py-1.5 text-xs"
          />
          <div className="flex items-center justify-between gap-2">
            {d.fecha && <span className="text-[10px] text-neutral-400">Último: {new Date(d.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}{d.autor ? ` · ${d.autor}` : ""}</span>}
            <div className="ml-auto flex gap-1.5">
              {(d.seguimiento || d.nota) && (
                <button type="button" disabled={guardando} onClick={() => { setNota(""); guardar(null); }} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-white">Borrar</button>
              )}
              <button type="button" disabled={guardando} onClick={() => guardar(estado)} className="rounded-md bg-carbon px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60">
                {guardando ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
