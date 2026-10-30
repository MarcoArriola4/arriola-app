"use client";
import { useTransition } from "react";
import { cambiarEstadoTrabajo, cambiarNotaEstado } from "@/app/actions";
import { ESTADOS_TRABAJO, TIPOS_SERVICIO, fmtFecha } from "@/lib/catalogos";
import { TextoEditable } from "@/app/(panel)/contrataciones/hoja";

export type ServicioTrabajo = { id: string; tipo: string; fecha: string | null; estadoTrabajo: string | null; avance: string | null };

/**
 * "Trabajo y estatus" de la marca: es el mismo dato de la columna de Contrataciones (mismo registro),
 * así que lo que se cambia aquí se ve igual allá y al revés.
 */
export function TrabajoEstatus({ servicios, editable }: { servicios: ServicioTrabajo[]; editable: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="rounded-xl border border-black/[0.07] bg-neutral-50/70 p-3">
      <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Trabajo y estatus
        <span className="font-normal normal-case text-neutral-400">{pendiente ? "Guardando…" : "Igual que en Contrataciones"}</span>
      </p>
      <ul className="space-y-2">
        {servicios.map((s) => (
          <li key={s.id} className="grid gap-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,13rem)_minmax(0,1fr)] sm:items-center">
            <span className="text-xs text-neutral-600">
              <b className="font-medium text-neutral-800">{TIPOS_SERVICIO[s.tipo] ?? s.tipo}</b>
              {s.fecha && <span className="text-neutral-400"> · {fmtFecha(s.fecha)}</span>}
            </span>
            {editable ? (
              <select
                value={s.estadoTrabajo ?? ""}
                disabled={pendiente}
                onChange={(e) => iniciar(() => cambiarEstadoTrabajo(s.id, e.target.value || null))}
                className={`w-full cursor-pointer rounded-md border-0 py-1 pl-2 pr-7 text-xs font-semibold ring-1 ring-black/10 ${s.estadoTrabajo ? ESTADOS_TRABAJO[s.estadoTrabajo]?.cls : "bg-white text-neutral-500"}`}
              >
                <option value="">Sin registrar</option>
                {Object.entries(ESTADOS_TRABAJO).map(([k, v]) => <option key={k} value={k}>{v.txt}</option>)}
              </select>
            ) : s.estadoTrabajo ? (
              <span className={`w-fit rounded px-1.5 py-0.5 text-xs font-semibold ${ESTADOS_TRABAJO[s.estadoTrabajo]?.cls}`}>{ESTADOS_TRABAJO[s.estadoTrabajo]?.txt}</span>
            ) : (
              <span className="text-xs text-neutral-300">Sin registrar</span>
            )}
            {editable ? (
              <TextoEditable valor={s.avance ?? ""} placeholder="Escribir estatus…" chico alGuardar={(v) => iniciar(() => cambiarNotaEstado(s.id, v))} />
            ) : (
              <span className="text-[11px] text-neutral-500">{s.avance}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
