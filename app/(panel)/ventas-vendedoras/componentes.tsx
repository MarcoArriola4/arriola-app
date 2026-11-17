"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { aprobarVenta, rechazarVenta } from "./actions";
import { CamposVenta, aFormData, type DatosVenta } from "@/components/campos-venta";

const fmt = (d: string) => new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export type CandidatoCliente = { id: string; nombre: string; telefono: string | null; marcas: number; exacto: boolean };
export type VentaRevision = {
  id: string; vendedora: string; vendio: string; creado: string; datos: DatosVenta; candidatos: CandidatoCliente[];
  lead: { nombre: string; asignado: string; intentos: number; contestoPor: string | null } | null;
  expedienteExistente: { denominacion: string; cliente: string; clienteId: string } | null;
};

/** Tarjeta de una venta pendiente: verificar, corregir si hace falta y aprobar o rechazar. */
export function RevisarVenta({ v }: { v: VentaRevision }) {
  const router = useRouter();
  const [d, setD] = useState(v.datos);
  const exacto = v.candidatos.find((c) => c.exacto);
  const [clienteId, setClienteId] = useState(v.expedienteExistente?.clienteId ?? exacto?.id ?? "");
  const [vendio, setVendio] = useState(v.vendio);
  const [error, setError] = useState("");
  const [listo, setListo] = useState<{ url: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const aprobar = () =>
    iniciar(async () => {
      setError("");
      const f = aFormData(d);
      f.set("clienteId", clienteId);
      f.set("vendio", vendio);
      try {
        const r = await aprobarVenta(v.id, f);
        if (!r.ok) return setError(r.error);
        setListo(r.datos ?? { url: "/contrataciones" });
        router.refresh();
      } catch { setError("No hay conexión o la sesión se cerró. Recarga la página."); }
    });
  const rechazar = () => {
    const motivo = prompt(`¿Por qué rechazas la venta de ${v.vendedora} a ${d.clienteNombre}? (lo verá ella)`);
    if (!motivo) return;
    iniciar(async () => {
      try { const r = await rechazarVenta(v.id, motivo); if (!r.ok) return setError(r.error); router.refresh(); } catch { setError("No hay conexión. Recarga la página."); }
    });
  };

  if (listo) {
    return (
      <div className="card flex flex-wrap items-center gap-3 border-marca/40 bg-marca-claro/40 px-4 py-3 text-sm">
        <Check size={18} className="text-marca-oscuro" aria-hidden /> Venta de <b>{d.clienteNombre}</b> aprobada: ya está en Contrataciones.
        <Link href={listo.url} className="btn ml-auto min-h-9">Ver cliente</Link>
      </div>
    );
  }
  return (
    <article className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-linea bg-amber-50/60 px-4 py-3">
        <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-semibold text-carbon">Por aprobar</span>
        <p className="text-sm"><b>{v.vendedora}</b> reportó una venta · {fmt(v.creado)}</p>
        {v.lead && (
          <p className="text-xs text-neutral-500">
            Contacto asignado el {new Date(v.lead.asignado).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short" })} · {v.lead.intentos} registros
            {v.lead.contestoPor && ` · contestó por ${v.lead.contestoPor === "WHATSAPP" ? "WhatsApp" : "llamada"}`}
          </p>
        )}
        {!v.lead && <p className="text-xs text-neutral-500">Venta sin contacto asignado (cliente que consiguió ella)</p>}
      </header>
      <div className="space-y-4 px-4 py-4">
        <CamposVenta d={d} set={setD} />

        <div className="grid gap-3 rounded-xl bg-black/[0.03] p-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Cliente en ArriolApp</span>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="input min-h-10">
              <option value="">Crear cliente nuevo: {d.clienteNombre || "—"}</option>
              {v.candidatos.map((c) => <option key={c.id} value={c.id}>Ya existe: {c.nombre}{c.telefono ? ` · ${c.telefono}` : ""} · {c.marcas} marcas</option>)}
            </select>
            {v.candidatos.length > 0 && <span className="mt-1 block text-[11px] text-neutral-500">Encontré {v.candidatos.length} {v.candidatos.length === 1 ? "cliente parecido" : "clientes parecidos"}; revisa si es el mismo para no duplicarlo.</span>}
          </label>
          <label className="block">
            <span className="label">Vendió (como aparece en Contrataciones)</span>
            <input value={vendio} onChange={(e) => setVendio(e.target.value)} className="input min-h-10" />
          </label>
          {v.expedienteExistente && (
            <p className="flex gap-2 text-xs text-amber-800 sm:col-span-2">
              <AlertTriangle size={14} className="shrink-0" aria-hidden />
              El expediente {d.numeroExpediente} ya está en ArriolApp: «{v.expedienteExistente.denominacion}» de {v.expedienteExistente.cliente}. La venta se agregará a esa marca.
            </p>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button onClick={aprobar} disabled={pendiente} className="btn-primario min-h-10"><Check size={16} aria-hidden /> {pendiente ? "Guardando…" : "Aprobar y pasar a Contrataciones"}</button>
          <button onClick={rechazar} disabled={pendiente} className="btn min-h-10 text-red-600"><X size={16} aria-hidden /> Rechazar</button>
        </div>
      </div>
    </article>
  );
}
