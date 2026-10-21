"use client";
import { useRef, useState, useTransition } from "react";
import { Pencil, StickyNote, Trash2 } from "lucide-react";
import { crearNotaMarca, editarNotaMarca, eliminarNotaMarca } from "@/app/actions";

type Nota = { id: string; texto: string; autor: string | null; creado: string; editado: string | null };
const fmt = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Notas de la marca: lo que hay que saber de ella (acuerdos con el cliente, pendientes, avisos internos). */
export function NotasMarca({ expedienteId, notas, editable }: { expedienteId: string; notas: Nota[]; editable: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <section className="card">
      <h3 className="flex items-center gap-2 border-b border-black/5 px-4 py-3 text-sm font-semibold"><StickyNote size={15} className="text-amber-500" /> Notas de esta marca <span className="font-normal text-neutral-400">{notas.length}</span></h3>
      {editable && (
        <form ref={form} action={async (f) => { await crearNotaMarca(f); form.current?.reset(); }} className="flex flex-wrap gap-2 border-b border-black/5 px-4 py-3">
          <input type="hidden" name="expedienteId" value={expedienteId} />
          <textarea name="texto" required rows={2} placeholder="Escribe una nota sobre esta marca…" className="input min-w-0 flex-1" />
          <button className="btn self-end">Agregar nota</button>
        </form>
      )}
      {notas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-neutral-400">Sin notas todavía.</p>
      ) : (
        <ul className="divide-y divide-black/5">{notas.map((n) => <Item key={n.id} n={n} editable={editable} />)}</ul>
      )}
    </section>
  );
}

function Item({ n, editable }: { n: Nota; editable: boolean }) {
  const [editando, setEditando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (editando) {
    return (
      <li className="px-4 py-3">
        <form action={async (f) => { await editarNotaMarca(f); setEditando(false); }} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={n.id} />
          <textarea name="texto" defaultValue={n.texto} required rows={2} className="input min-w-0 flex-1" />
          <div className="flex gap-2 self-end"><button className="btn-primario">Guardar</button><button type="button" onClick={() => setEditando(false)} className="btn">Cancelar</button></div>
        </form>
      </li>
    );
  }
  return (
    <li className={`flex items-start gap-2 bg-amber-50/40 px-4 py-3 ${pendiente ? "opacity-50" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-line text-sm">{n.texto}</p>
        <p className="mt-1 text-[11px] text-neutral-400">{n.autor ?? "—"} · {fmt(n.creado)}{n.editado && ` · editada ${fmt(n.editado)}`}</p>
      </div>
      {editable && (
        <>
          <button onClick={() => setEditando(true)} title="Editar" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-black"><Pencil size={13} /></button>
          <button onClick={() => { if (confirm("¿Borrar esta nota?")) iniciar(() => eliminarNotaMarca(n.id)); }} title="Borrar" className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} /></button>
        </>
      )}
    </li>
  );
}
