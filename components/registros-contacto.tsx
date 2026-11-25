"use client";
// Formulario para registrar o corregir un contacto con el cliente (llamada o WhatsApp) y la lista de registros.
// Lo usan el Panel Vendedoras (cada vendedora sus registros) y el reporte del gerente (todos).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BadgeCheck, CalendarClock, ChevronRight, FileText, FileX, MessageCircle, Pencil, Phone, PhoneIncoming, PhoneOff, RotateCcw, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
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

/** Camino del árbol de decisiones: cada respuesta abre la siguiente pregunta. */
type Ruta = { contesto?: boolean; whats?: boolean; interesado?: boolean; cotizo?: boolean; cierre?: "SEGUIMIENTO" | "VENDIDO" };
const ORDEN: (keyof Ruta)[] = ["contesto", "whats", "interesado", "cotizo", "cierre"];

/** Camino que corresponde a un registro ya guardado (para corregirlo). */
function rutaDe(v: Valores): Ruta {
  switch (v.resultado) {
    case "NO_CONTESTO": return { contesto: false, whats: true };
    case "SIN_CONTACTO": return { contesto: false, whats: false };
    case "NO_INTERESA": return { contesto: true, interesado: false };
    case "VENDIDO": return { contesto: true, interesado: true, cotizo: v.cotizacion, cierre: "VENDIDO" };
    case "COTIZACION": return { contesto: true, interesado: true, cotizo: true, cierre: "SEGUIMIENTO" };
    case "CONTESTO": case "VOLVER": return { contesto: true, interesado: true, cotizo: v.cotizacion, cierre: "SEGUIMIENTO" };
    default: return {};
  }
}

/** Resultado que se guarda al terminar el camino (null si falta contestar algo). */
function resultadoDe(r: Ruta, wa: boolean): { resultado: string; cotizacion: boolean; interes: string } | null {
  const sin = { cotizacion: false, interes: "" };
  if (r.contesto === false) {
    if (wa) return { resultado: "NO_CONTESTO", ...sin };
    if (r.whats === undefined) return null;
    return { resultado: r.whats ? "NO_CONTESTO" : "SIN_CONTACTO", ...sin };
  }
  if (r.contesto !== true || r.interesado === undefined) return null;
  if (!r.interesado) return { resultado: "NO_INTERESA", ...sin };
  if (r.cotizo === undefined || !r.cierre) return null;
  const cot = { cotizacion: r.cotizo, interes: r.cotizo ? "INTERESADO" : "" };
  if (r.cierre === "VENDIDO") return { resultado: "VENDIDO", ...cot };
  return { resultado: r.cotizo ? "COTIZACION" : "CONTESTO", ...cot };
}

type Opcion<T> = { val: T; txt: string; corto: string; I: typeof Phone; tono: "si" | "no" };
type Pregunta = { k: keyof Ruta; titulo: string; opciones: Opcion<boolean | string>[] };

function preguntas(r: Ruta, wa: boolean): Pregunta[] {
  const ps: Pregunta[] = [{
    k: "contesto",
    titulo: wa ? "¿Respondió el WhatsApp?" : "¿Contestó la llamada?",
    opciones: [
      { val: true, txt: wa ? "Respondió" : "Contestó", corto: wa ? "Respondió" : "Contestó", I: PhoneIncoming, tono: "si" },
      { val: false, txt: wa ? "Todavía no responde" : "No contestó", corto: wa ? "No responde" : "No contestó", I: PhoneOff, tono: "no" },
    ],
  }];
  if (r.contesto === false && !wa)
    ps.push({ k: "whats", titulo: "¿Le enviaste WhatsApp?", opciones: [
      { val: true, txt: "Sí, le envié WhatsApp", corto: "WhatsApp enviado", I: MessageCircle, tono: "si" },
      { val: false, txt: "No tiene WhatsApp", corto: "Sin WhatsApp", I: X, tono: "no" },
    ] });
  if (r.contesto === true)
    ps.push({ k: "interesado", titulo: "¿Está interesado?", opciones: [
      { val: true, txt: "Interesado", corto: "Interesado", I: ThumbsUp, tono: "si" },
      { val: false, txt: "No le interesa", corto: "No le interesa", I: ThumbsDown, tono: "no" },
    ] });
  if (r.interesado === true)
    ps.push({ k: "cotizo", titulo: "¿Se le envió cotización?", opciones: [
      { val: true, txt: "Sí, se envió cotización", corto: "Cotización enviada", I: FileText, tono: "si" },
      { val: false, txt: "No se envió cotización", corto: "Sin cotización", I: FileX, tono: "no" },
    ] });
  if (r.cotizo !== undefined && r.interesado === true)
    ps.push({ k: "cierre", titulo: "¿Cómo queda?", opciones: [
      { val: "SEGUIMIENTO", txt: "Darle seguimiento", corto: "Seguimiento", I: CalendarClock, tono: "si" },
      { val: "VENDIDO", txt: "Ya compró", corto: "Vendido", I: BadgeCheck, tono: "si" },
    ] });
  return ps;
}

/** Recordatorio sugerido al terminar el camino. */
const recordatorioSugerido = (resultado: string) =>
  resultado === "NO_CONTESTO" ? enDias(1, "12:00") : resultado === "COTIZACION" ? enDias(3) : resultado === "CONTESTO" ? enDias(1) : "";

/**
 * Formulario de un registro como árbol de decisiones: Contestó / No contestó → ¿interesado? → ¿cotización? → ¿cómo queda?
 * `onGuardar` recibe el FormData con canal, resultado, comentario, cotizacion, interes y volverLlamar.
 */
export function FormRegistro({ inicial, onGuardar, onListo, onCancelar, textoBoton, elegirCanal = false }: {
  /** Mostrar Llamada / WhatsApp: solo en seguimientos y al corregir; el primer contacto siempre es llamada. */
  elegirCanal?: boolean;
  inicial?: Partial<Valores>; onGuardar: (f: FormData) => Promise<Resultado>; onListo?: () => void; onCancelar?: () => void; textoBoton?: string;
}) {
  const router = useRouter();
  const base: Valores = { canal: "LLAMADA", resultado: "", comentario: "", cotizacion: false, interes: "", volver: "", ...inicial };
  const [rutaInicial] = useState(() => rutaDe(base));
  const [ruta, setRuta] = useState<Ruta>(rutaInicial);
  const [canal, setCanal] = useState(base.canal);
  const [comentario, setComentario] = useState(base.comentario);
  const [volver, setVolverEstado] = useState(base.volver);
  // Mientras no lo cambie a mano, el recordatorio se sugiere según lo que pasó
  const [auto, setAuto] = useState(!base.volver);
  const setVolver = (x: string) => { setAuto(false); setVolverEstado(x); };
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const wa = canal === "WHATSAPP";

  // Al corregir sin cambiar el camino se conserva tal cual lo que ya estaba guardado
  const sinCambio = !!base.resultado && JSON.stringify(ruta) === JSON.stringify(rutaInicial) && canal === base.canal;
  const fin = sinCambio ? { resultado: base.resultado, cotizacion: base.cotizacion, interes: base.interes } : resultadoDe(ruta, wa);
  const cerrado = !!fin && CERRADOS_UI.includes(fin.resultado);
  const ps = preguntas(ruta, wa);
  const actual = ps.find((p) => ruta[p.k] === undefined);
  const respondidas = ps.filter((p) => ruta[p.k] !== undefined);

  const elegir = (k: keyof Ruta, val: boolean | string) => {
    const nueva: Ruta = {};
    for (const x of ORDEN) {
      if (x === k) break;
      (nueva as Record<string, unknown>)[x] = ruta[x];
    }
    (nueva as Record<string, unknown>)[k] = val;
    setRuta(nueva);
    const r = resultadoDe(nueva, wa);
    if (r && auto) setVolverEstado(recordatorioSugerido(r.resultado));
  };
  /** Regresa a una pregunta ya contestada (borra esa respuesta y las siguientes). */
  const regresar = (k: keyof Ruta) => {
    const nueva: Ruta = {};
    for (const x of ORDEN) {
      if (x === k) break;
      (nueva as Record<string, unknown>)[x] = ruta[x];
    }
    setRuta(nueva);
  };

  const guardar = () =>
    iniciar(async () => {
      if (!fin) return;
      setError("");
      const f = new FormData();
      f.set("canal", canal);
      f.set("resultado", fin.resultado);
      f.set("comentario", comentario);
      if (fin.cotizacion) {
        f.set("cotizacion", "on");
        f.set("interes", fin.interes || "INTERESADO");
      }
      if (!cerrado) f.set("volverLlamar", volver);
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
      {/* Canal: solo en seguimientos (el primer contacto siempre es llamada) */}
      <div className="flex items-center justify-between gap-2">
        {elegirCanal ? <div className="inline-flex rounded-lg bg-black/[0.05] p-0.5" role="radiogroup" aria-label="Por dónde">
          {[
            { k: "LLAMADA", t: "Llamada", I: Phone },
            { k: "WHATSAPP", t: "WhatsApp", I: MessageCircle },
          ].map(({ k, t, I }) => (
            <button key={k} type="button" role="radio" aria-checked={canal === k} onClick={() => setCanal(k)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition ${canal === k ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500 hover:text-carbon"}`}>
              <I size={13} aria-hidden /> {t}
            </button>
          ))}
        </div> : <span />}
        {respondidas.length > 0 && (
          <button type="button" onClick={() => setRuta({})} className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs text-neutral-500 hover:bg-black/[0.05] hover:text-carbon">
            <RotateCcw size={12} aria-hidden /> Empezar de nuevo
          </button>
        )}
      </div>

      {/* Camino elegido: cada paso se puede tocar para cambiarlo */}
      {respondidas.length > 0 && (
        <ol className="flex flex-wrap items-center gap-1" aria-label="Lo que elegiste">
          {respondidas.map((p, i) => {
            const o = p.opciones.find((x) => x.val === ruta[p.k]);
            if (!o) return null;
            return (
              <li key={p.k} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={13} className="text-neutral-300" aria-hidden />}
                <button type="button" onClick={() => regresar(p.k)} title={`Cambiar: ${p.titulo}`}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ring-1 transition hover:ring-black/30 ${o.tono === "si" ? "bg-marca-claro text-marca-oscuro ring-marca/30" : "bg-neutral-100 text-neutral-700 ring-black/10"}`}>
                  <o.I size={12} aria-hidden /> {o.corto}
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* Pregunta actual: solo dos opciones */}
      {actual && (
        <fieldset key={actual.k} className="animate-aparecer">
          <legend className="mb-2 text-sm font-semibold text-carbon">{actual.titulo}</legend>
          <div className="grid grid-cols-2 gap-2">
            {actual.opciones.map((o) => (
              <button key={String(o.val)} type="button" onClick={() => elegir(actual.k, o.val)}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold ring-1 transition active:scale-[0.98] ${o.tono === "si" ? "bg-white text-carbon ring-marca/50 hover:bg-marca-claro" : "bg-white text-neutral-700 ring-black/10 hover:bg-neutral-50"}`}>
                <o.I size={18} className={o.tono === "si" ? "text-marca-oscuro" : "text-neutral-400"} aria-hidden /> {o.txt}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {/* Al terminar el camino: comentario, recordatorio y guardar */}
      {fin && !actual && (
        <div className="animate-aparecer space-y-3 rounded-xl bg-black/[0.025] p-3">
          {!wa && fin.resultado === "NO_CONTESTO" && <p className="text-xs text-emerald-800">Se registra también el WhatsApp enviado. Cuando te responda, usa «Ya respondió el WhatsApp».</p>}
          {fin.resultado === "SIN_CONTACTO" && <p className="text-xs text-neutral-500">El contacto se da por cerrado: no se pudo contactar.</p>}
          {fin.resultado === "NO_INTERESA" && <p className="text-xs text-neutral-500">El contacto se da por cerrado: no le interesa.</p>}
          {fin.resultado === "VENDIDO" && <p className="text-xs text-marca-oscuro">Recuerda registrar la venta con «Registrar venta» para que el administrador la apruebe.</p>}
          {sinCambio && fin.cotizacion && fin.interes && <p className="text-[11px] text-neutral-500">Cotización: {INTERES_UI[fin.interes]?.toLowerCase()}</p>}
          <label className="block">
            <span className="label">{wa ? "¿Qué respondió?" : "¿Qué dijo?"} <span className="font-normal text-neutral-400">(opcional)</span></span>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} placeholder="Ej. le interesa registrar su marca de ropa" className="input" />
          </label>
          {!cerrado && (
            <div>
              <span className="label">Recordatorio para volver a contactar</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <input type="datetime-local" value={volver} onChange={(e) => setVolver(e.target.value)} className="input min-h-10 w-auto" aria-label="Fecha y hora del recordatorio" />
                {([["Mañana", 1], ["En 3 días", 3], ["En 1 semana", 7]] as const).map(([t, n]) => (
                  <button key={t} type="button" onClick={() => setVolver(enDias(n))} className="min-h-8 rounded-md bg-white px-2 text-[11px] text-neutral-600 ring-1 ring-black/10 hover:bg-neutral-50">{t}</button>
                ))}
                {volver && <button type="button" onClick={() => setVolver("")} className="min-h-8 rounded-md px-2 text-[11px] text-neutral-500 underline">Sin recordatorio</button>}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {fin && !actual && <button disabled={pendiente} className="btn-primario min-h-10">{pendiente ? "Guardando…" : (textoBoton ?? "Guardar")}</button>}
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
              elegirCanal
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
