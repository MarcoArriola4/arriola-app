"use client";
// Formulario para registrar o corregir un contacto con el cliente (llamada o WhatsApp) y la lista de registros.
// Lo usan el Panel Vendedoras (cada vendedora sus registros) y el reporte del gerente (todos).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageCircle, Pencil, Phone, Trash2 } from "lucide-react";
import type { Resultado } from "@/lib/vendedoras";

// Mismo catálogo que lib/vendedoras.ts (aquí para el navegador)
export const RESULTADOS_UI: Record<string, { txt: string; cls: string }> = {
  NO_CONTESTO: { txt: "No contestó", cls: "bg-neutral-100 text-neutral-600" },
  CONTESTO: { txt: "Contestó · interesado", cls: "bg-sky-50 text-sky-800" },
  COTIZACION: { txt: "Cotización enviada", cls: "bg-violet-50 text-violet-800" },
  VOLVER: { txt: "Volver a contactar", cls: "bg-amber-50 text-amber-800" },
  VENDIDO: { txt: "Vendido", cls: "bg-marca-claro text-marca-oscuro" },
  NO_INTERESA: { txt: "No le interesa", cls: "bg-red-50 text-red-700" },
  SIN_CONTACTO: { txt: "Sin WhatsApp · no se pudo contactar", cls: "bg-neutral-200 text-neutral-600" },
};
const CERRADOS_UI = ["VENDIDO", "NO_INTERESA", "SIN_CONTACTO"];
export const txtRes = (r: string, canal?: string | null) =>
  r === "NO_CONTESTO" ? (canal === "WHATSAPP" ? "WhatsApp enviado · sin respuesta" : "No contestó") : (RESULTADOS_UI[r]?.txt ?? "Por llamar");
/** Texto del botón al registrar: en llamada, "No contestó" significa que se le manda WhatsApp. */
const txtOpcion = (r: string, canal: string) =>
  r === "NO_CONTESTO" ? (canal === "WHATSAPP" ? "Todavía no responde" : "No contestó → se le envió WhatsApp") : r === "SIN_CONTACTO" ? "No contestó y no tiene WhatsApp" : txtRes(r, canal);

export function ChipCanal({ canal, prefijo = "" }: { canal: string; prefijo?: string }) {
  const wa = canal === "WHATSAPP";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${wa ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}>
      {wa ? <MessageCircle size={11} aria-hidden /> : <Phone size={11} aria-hidden />} {prefijo}{wa ? "WhatsApp" : "Llamada"}
    </span>
  );
}

export const fmt = (d: string) => new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
/** Fecha para <input type="datetime-local"> en hora de México, a N días */
export const enDias = (n: number, hora = "10:00") => `${new Date(Date.now() + n * 864e5 - 6 * 3600e3).toISOString().slice(0, 10)}T${hora}`;
const aLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 6 * 3600e3).toISOString().slice(0, 16) : "");

export type RegistroVista = {
  id: string; fecha: string; canal: string; resultado: string; comentario: string | null; cotizacion: boolean; interes?: string | null; volverLlamar: string | null; editado: string | null;
  encabezado?: string; // p. ej. "Cliente · Vendedora" en el reporte del gerente
};

type Valores = { canal: string; resultado: string; comentario: string; cotizacion: boolean; interes: string; volver: string };
const INTERES_UI: Record<string, string> = { INTERESADO: "Está interesado", SEGUIMIENTO: "Solo para dar seguimiento" };

/** Formulario de un registro. `onGuardar` recibe el FormData con canal, resultado, comentario, cotizacion y volverLlamar. */
export function FormRegistro({ inicial, onGuardar, onListo, onCancelar, textoBoton }: {
  inicial?: Partial<Valores>; onGuardar: (f: FormData) => Promise<Resultado>; onListo?: () => void; onCancelar?: () => void; textoBoton?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<Valores>({ canal: "LLAMADA", resultado: "", comentario: "", cotizacion: false, interes: "", volver: "", ...inicial });
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const cerrado = CERRADOS_UI.includes(v.resultado);
  const wa = v.canal === "WHATSAPP";
  const conCotizacion = v.cotizacion || v.resultado === "COTIZACION";
  const falta = !v.resultado ? "Elige qué pasó" : conCotizacion && !v.interes ? "Elige: interesado o seguimiento" : "";

  const guardar = () =>
    iniciar(async () => {
      setError("");
      const f = new FormData();
      f.set("canal", v.canal);
      f.set("resultado", v.resultado);
      f.set("comentario", v.comentario);
      if (v.cotizacion) f.set("cotizacion", "on");
      if (conCotizacion) f.set("interes", v.interes);
      if (!cerrado) f.set("volverLlamar", v.volver);
      try {
        const r = await onGuardar(f);
        if (!r.ok) return setError(r.error);
        onListo?.();
        router.refresh();
      } catch {
        setError("No hay conexión o tu sesión se cerró. Recarga la página e inténtalo de nuevo.");
      }
    });

  return (
    <form action={guardar} className="space-y-3">
      <div>
        <p className="label">¿Por dónde?</p>
        <div className="inline-flex rounded-lg bg-black/[0.05] p-1" role="radiogroup" aria-label="Canal">
          {[
            { k: "LLAMADA", t: "Llamada", I: Phone },
            { k: "WHATSAPP", t: "WhatsApp", I: MessageCircle },
          ].map(({ k, t, I }) => (
            <button key={k} type="button" role="radio" aria-checked={v.canal === k} onClick={() => setV({ ...v, canal: k })}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition ${v.canal === k ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500 hover:text-carbon"}`}>
              <I size={14} aria-hidden /> {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="label">¿Qué pasó?</p>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(RESULTADOS_UI).map(([k, r]) => (
            <button
              key={k}
              type="button"
              onClick={() => setV({ ...v, resultado: k, volver: v.volver || (k === "VOLVER" ? enDias(1) : k === "NO_CONTESTO" ? enDias(1, "12:00") : "") })}
              aria-pressed={v.resultado === k}
              className={`min-h-9 rounded-full px-3 text-xs font-medium ring-1 transition ${v.resultado === k ? `${r.cls} ring-current` : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}
            >
              {txtOpcion(k, v.canal)}
            </button>
          ))}
        </div>
        {!wa && v.resultado === "NO_CONTESTO" && (
          <p className="mt-1.5 text-xs text-emerald-800">Se registra también el WhatsApp enviado. Cuando te responda, usa «Ya respondió el WhatsApp» en este contacto.</p>
        )}
        {v.resultado === "SIN_CONTACTO" && (
          <p className="mt-1.5 text-xs text-neutral-500">El contacto se da por cerrado: no se pudo contactar.</p>
        )}
      </div>
      <label className="block">
        <span className="label">{wa ? "¿Qué respondió por WhatsApp?" : "¿Qué dijo?"} (comentario)</span>
        <textarea value={v.comentario} onChange={(e) => setV({ ...v, comentario: e.target.value })} rows={2} placeholder="Ej. le interesa registrar su marca de ropa, quiere precio" className="input" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {!cerrado && (
          <label className="block">
            <span className="label">Recordatorio: volver a contactar el</span>
            <input type="datetime-local" value={v.volver} onChange={(e) => setV({ ...v, volver: e.target.value })} className="input min-h-10" />
            <span className="mt-1 flex flex-wrap gap-1.5">
              {([["Mañana", 1], ["En 3 días", 3], ["En 1 semana", 7]] as const).map(([t, n]) => (
                <button key={t} type="button" onClick={() => setV({ ...v, volver: enDias(n) })} className="rounded-md bg-black/[0.05] px-2 py-1 text-[11px] text-neutral-600 hover:bg-black/10">{t}</button>
              ))}
              {v.volver && <button type="button" onClick={() => setV({ ...v, volver: "" })} className="rounded-md px-2 py-1 text-[11px] text-neutral-500 underline">Sin recordatorio</button>}
            </span>
          </label>
        )}
        <label className="flex items-center gap-2 self-center text-sm">
          <input type="checkbox" checked={v.cotizacion || v.resultado === "COTIZACION"} disabled={v.resultado === "COTIZACION"} onChange={(e) => setV({ ...v, cotizacion: e.target.checked })} className="h-5 w-5 accent-[#91ac45]" />
          Le envié cotización
        </label>
      </div>
      {conCotizacion && (
        <div>
          <p className="label">Con la cotización, el cliente…</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Interés del cliente">
            {Object.entries(INTERES_UI).map(([k, t]) => (
              <button key={k} type="button" role="radio" aria-checked={v.interes === k} onClick={() => setV({ ...v, interes: k })}
                className={`min-h-9 rounded-full px-3 text-xs font-medium ring-1 transition ${v.interes === k ? (k === "INTERESADO" ? "bg-sky-50 text-sky-800 ring-current" : "bg-amber-50 text-amber-800 ring-current") : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={!!falta || pendiente} className="btn-primario min-h-10">{pendiente ? "Guardando…" : falta || (textoBoton ?? "Guardar")}</button>
        {onCancelar && <button type="button" onClick={onCancelar} className="btn min-h-10">Cancelar</button>}
      </div>
    </form>
  );
}

/** Historial de registros de un contacto, cada uno se puede corregir (y, si se permite, borrar). */
export function ListaRegistros({ registros, editar, eliminar, vacio = "Sin registros todavía." }: {
  registros: RegistroVista[]; editar: (id: string, f: FormData) => Promise<Resultado>; eliminar?: (id: string) => Promise<Resultado>; vacio?: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  if (!registros.length) return <p className="px-4 py-4 text-center text-sm text-neutral-500">{vacio}</p>;
  return (
    <ul className="divide-y divide-black/5">
      {registros.map((r) => (
        <li key={r.id} className="px-4 py-2.5 text-sm">
          {editando === r.id ? (
            <FormRegistro
              inicial={{ canal: r.canal, resultado: r.resultado, comentario: r.comentario ?? "", cotizacion: r.cotizacion, interes: r.interes ?? "", volver: aLocal(r.volverLlamar) }}
              onGuardar={(f) => editar(r.id, f)}
              onListo={() => setEditando(null)}
              onCancelar={() => setEditando(null)}
              textoBoton="Guardar cambios"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs text-neutral-500">{fmt(r.fecha)}</span>
                <ChipCanal canal={r.canal} />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RESULTADOS_UI[r.resultado]?.cls ?? ""}`}>{txtRes(r.resultado, r.canal)}</span>
                {r.encabezado && <span className="text-xs font-medium text-carbon">{r.encabezado}</span>}
                <span className="ml-auto flex items-center">
                  <button type="button" onClick={() => { setError(""); setEditando(r.id); }} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-neutral-600 hover:bg-black/[0.05] hover:text-carbon">
                    <Pencil size={13} aria-hidden /> Editar
                  </button>
                  {eliminar && (
                    <button
                      type="button"
                      disabled={pendiente}
                      onClick={() => {
                        if (!confirm("¿Borrar este registro? El contacto se conserva.")) return;
                        iniciar(async () => {
                          try { const x = await eliminar(r.id); if (!x.ok) return setError(x.error); router.refresh(); } catch { setError("No hay conexión. Recarga la página."); }
                        });
                      }}
                      className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} aria-hidden /> Borrar
                    </button>
                  )}
                </span>
              </div>
              {r.comentario && <p className="mt-0.5 text-xs text-neutral-700">“{r.comentario}”</p>}
              <p className="text-[11px] text-neutral-400">
                {[r.cotizacion && `Cotización enviada${r.interes ? ` · ${INTERES_UI[r.interes]?.toLowerCase()}` : ""}`, r.volverLlamar && `Volver a contactar: ${fmt(r.volverLlamar)}`, r.editado && `Corregido ${fmt(r.editado)}`].filter(Boolean).join(" · ")}
              </p>
            </>
          )}
        </li>
      ))}
      {error && <li role="alert" className="px-4 py-2 text-sm text-red-600">{error}</li>}
    </ul>
  );
}
