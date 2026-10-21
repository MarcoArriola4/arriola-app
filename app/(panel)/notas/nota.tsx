"use client";
import { useState, useTransition } from "react";
import { Bell, Check, Pencil, Trash2 } from "lucide-react";
import { editarRecordatorio, eliminarRecordatorio, marcarRecordatorio, posponerRecordatorio } from "@/app/actions";

export type Nota = { id: string; texto: string; recordarEn: string | null; hecho: boolean; creado: string };

const TZ = "America/Mexico_City";
const fmt = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** ISO → valor de <input type="datetime-local"> en hora de la Ciudad de México */
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 6 * 3600000).toISOString().slice(0, 16) : "");

export function NotaPersonal({ n }: { n: Nota }) {
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const toca = !n.hecho && n.recordarEn && new Date(n.recordarEn) <= new Date();

  if (editando) {
    return (
      <form action={async (f) => { await editarRecordatorio(f); setEditando(false); }} className="card grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <input type="hidden" name="id" value={n.id} />
        <textarea name="texto" defaultValue={n.texto} required rows={2} className="input" />
        <input type="datetime-local" name="recordarEn" defaultValue={local(n.recordarEn)} className="input" />
        <div className="flex gap-2"><button className="btn-primario">Guardar</button><button type="button" onClick={() => setEditando(false)} className="btn">Cancelar</button></div>
      </form>
    );
  }
  return (
    <article className={`card flex items-start gap-3 p-3 ${toca ? "border-amber-300 bg-amber-50" : ""} ${pendiente ? "opacity-50" : ""}`}>
      <button
        onClick={() => iniciar(() => marcarRecordatorio(n.id, !n.hecho))}
        title={n.hecho ? "Marcar como pendiente" : "Marcar como hecha"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${n.hecho ? "border-marca-oscuro bg-marca text-carbon" : "border-black/20 bg-white hover:border-black/40"}`}
      >
        {n.hecho && <Check size={13} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`whitespace-pre-line text-sm ${n.hecho ? "text-neutral-400 line-through" : ""}`}>{n.texto}</p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
          {n.recordarEn && <span className={`inline-flex items-center gap-1 ${toca ? "font-semibold text-amber-700" : ""}`}><Bell size={11} /> {fmt(n.recordarEn)}</span>}
          <span>anotada {fmt(n.creado)}</span>
          {toca && (
            <>
              <button onClick={() => iniciar(() => posponerRecordatorio(n.id, 60))} className="rounded border border-amber-300 px-1.5 text-amber-800 hover:bg-amber-100">+1 hora</button>
              <button onClick={() => iniciar(() => posponerRecordatorio(n.id, 24 * 60))} className="rounded border border-amber-300 px-1.5 text-amber-800 hover:bg-amber-100">Mañana</button>
            </>
          )}
        </p>
      </div>
      <button onClick={() => setEditando(true)} title="Editar" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-black"><Pencil size={14} /></button>
      <button onClick={() => { if (confirm("¿Borrar esta nota?")) iniciar(() => eliminarRecordatorio(n.id)); }} title="Borrar" className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
    </article>
  );
}
