"use client";
// Botón con alerta: lo que ya contrataron y sigue «Por trabajar» (morado en el Excel). Solo lectura.
import Link from "next/link";
import { useState } from "react";
import { BellRing, X } from "lucide-react";

export type PendienteTrabajo = {
  id: string; fecha: string | null; dias: number | null; cliente: string; clienteId: string; expedienteId: string;
  marca: string; expediente: string | null; servicio: string; vendio: string | null; oficio: string | null;
};

export function PendientesTrabajo({ lista }: { lista: PendienteTrabajo[] }) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState("");
  const tipos = [...new Set(lista.map((p) => p.servicio))];
  const visibles = tipo ? lista.filter((p) => p.servicio === tipo) : lista;
  const atrasados = lista.filter((p) => (p.dias ?? 0) > 15).length;
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`relative inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ring-1 ${lista.length ? "bg-violet-50 text-violet-900 ring-violet-300 hover:bg-violet-100" : "bg-white text-neutral-500 ring-black/10"}`}
      >
        <BellRing size={15} className={lista.length ? "text-violet-700" : ""} aria-hidden />
        Pendientes por trabajar
        <span className={`cifra ml-0.5 rounded-full px-1.5 text-xs font-semibold ${lista.length ? "bg-violet-700 text-white" : "bg-black/[0.06]"}`}>{lista.length}</span>
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" onClick={() => setAbierto(false)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pendientes por trabajar" className="animate-aparecer w-full max-w-3xl rounded-2xl bg-white shadow-flotante">
            <div className="flex items-start gap-3 border-b border-linea px-5 py-4">
              <div className="flex-1">
                <h2 className="font-titulo text-xl font-semibold">Contratado y pendiente por trabajar · {lista.length}</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Todo lo que ya te contrataron y en Contrataciones sigue como «Por trabajar» (morado), de lo más antiguo a lo más reciente.
                  {atrasados > 0 && <span className="font-medium text-red-600"> {atrasados} llevan más de 15 días.</span>} Cuando lo trabajes, cámbialo en la hoja y sale de aquí.
                </p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"><X size={18} /></button>
            </div>
            {tipos.length > 1 && (
              <div className="flex flex-wrap gap-1.5 border-b border-linea px-5 py-2.5">
                {["", ...tipos].map((t) => (
                  <button key={t || "todos"} type="button" onClick={() => setTipo(t)} aria-pressed={tipo === t}
                    className={`min-h-8 rounded-full px-3 text-xs font-medium ring-1 ${tipo === t ? "bg-carbon text-white ring-carbon" : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}>
                    {t || "Todos"} <span className="cifra opacity-60">{t ? lista.filter((p) => p.servicio === t).length : lista.length}</span>
                  </button>
                ))}
              </div>
            )}
            {visibles.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-neutral-500">No tienes nada pendiente por trabajar.</p>
            ) : (
              <ul className="max-h-[65vh] divide-y divide-black/5 overflow-y-auto">
                {visibles.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm">
                    <span className={`cifra w-16 shrink-0 text-xs font-semibold ${(p.dias ?? 0) > 30 ? "text-red-600" : (p.dias ?? 0) > 15 ? "text-amber-700" : "text-neutral-500"}`}>
                      {p.dias == null ? "—" : p.dias === 0 ? "hoy" : `${p.dias} d`}
                    </span>
                    <div className="min-w-0 flex-1 basis-60">
                      <Link href={`/clientes/${p.clienteId}?marca=${p.expedienteId}`} className="font-medium hover:underline">{p.marca}</Link>
                      <span className="text-neutral-500"> · {p.cliente}</span>
                      <p className="text-xs text-neutral-500">
                        <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-800">{p.servicio}</span>
                        {p.expediente && ` · Exp. ${p.expediente}`}
                        {p.fecha && ` · contratado ${new Date(p.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`}
                        {p.vendio && ` · vendió ${p.vendio}`}
                      </p>
                      {p.oficio && <p className="text-xs font-medium text-red-600">{p.oficio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
