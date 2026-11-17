"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Bell, CalendarClock, History, Plus, X } from "lucide-react";
import { ChipCanal, FormRegistro, ListaRegistros, RESULTADOS_UI, fmt, txtRes, type RegistroVista } from "@/components/registros-contacto";
import { agregarContactoPropio, editarRegistro, guardarObservaciones, registrarLlamada } from "./actions";

export type LeadVista = {
  id: string; nombre: string; telefono: string; email: string | null; nota: string | null; estado: string; cotizacion: boolean;
  marca: string | null; expediente: string | null; estatus: string | null; observaciones: string | null;
  comentario: string | null; volverLlamar: string | null; ultimaLlamada: string | null; intentos: number; asignadoEl: string; propio: boolean;
  canal: string | null; contestoPor: string | null; registros: RegistroVista[];
};

export function TarjetaLead({ l }: { l: LeadVista }) {
  const [abierto, setAbierto] = useState<"" | "nuevo" | "historial">("");
  const estado = RESULTADOS_UI[l.estado];
  const vencido = l.volverLlamar && new Date(l.volverLlamar) <= new Date();

  return (
    <li className={`card overflow-hidden ${vencido ? "border-amber-300 ring-1 ring-amber-200" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-semibold">{l.nombre}</p>
          <p className="text-sm text-neutral-600">{l.telefono || "Sin teléfono"}{l.email && <span className="text-neutral-400"> · {l.email}</span>}</p>
          {(l.marca || l.expediente || l.estatus) && (
            <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {l.marca && <span className="rounded-md bg-carbon px-2 py-0.5 font-medium text-white">{l.marca}</span>}
              {l.expediente && <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-neutral-700">Exp. {l.expediente}</span>}
              {l.estatus && <span className="rounded-md bg-sky-50 px-2 py-0.5 text-sky-800">{l.estatus}</span>}
            </p>
          )}
          {l.nota && <p className="mt-0.5 text-xs text-neutral-500">Nota: {l.nota}</p>}
          {l.comentario && <p className="mt-1 text-xs text-neutral-700">“{l.comentario}”</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
            {l.ultimaLlamada && <span>Último contacto: {fmt(l.ultimaLlamada)} · {l.intentos} {l.intentos === 1 ? "registro" : "registros"}</span>}
            {l.propio && <span>Contacto propio</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estado ? estado.cls : "bg-white text-carbon ring-1 ring-black/10"}`}>{estado ? txtRes(l.estado, l.canal) : "Por llamar"}</span>
          {l.contestoPor && <ChipCanal canal={l.contestoPor} prefijo={l.contestoPor === "WHATSAPP" ? "Respondió por " : "Contestó por "} />}
          {!l.contestoPor && l.canal === "WHATSAPP" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">WhatsApp enviado · sin respuesta</span>}
          {l.cotizacion && l.estado !== "COTIZACION" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">Con cotización</span>}
          {l.volverLlamar && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${vencido ? "text-amber-700" : "text-neutral-600"}`}><CalendarClock size={13} aria-hidden /> {vencido ? "Contactar ya · " : "Volver a contactar: "}{fmt(l.volverLlamar)}</span>
          )}
        </div>
      </div>
      <Observaciones id={l.id} valor={l.observaciones} />
      <div className="flex flex-wrap items-center gap-2 border-t border-linea bg-black/[0.015] px-4 py-2.5">
        {l.registros.length > 0 && (
          <button type="button" onClick={() => setAbierto(abierto === "historial" ? "" : "historial")} aria-expanded={abierto === "historial"} className="btn min-h-10">
            <History size={15} aria-hidden /> {abierto === "historial" ? "Ocultar registros" : `Ver / editar registros (${l.registros.length})`}
          </button>
        )}
        <button onClick={() => setAbierto(abierto === "nuevo" ? "" : "nuevo")} className="btn-marca ml-auto min-h-10">{abierto === "nuevo" ? "Cerrar" : "Registrar llamada o WhatsApp"}</button>
      </div>
      {abierto === "nuevo" && (
        <div className="border-t border-linea px-4 py-3">
          <FormRegistro
            inicial={{ cotizacion: l.cotizacion }}
            onGuardar={(f) => { f.set("leadId", l.id); return registrarLlamada(f); }}
            onListo={() => setAbierto("")}
            textoBoton="Guardar registro"
          />
        </div>
      )}
      {abierto === "historial" && (
        <div className="border-t border-linea">
          <p className="px-4 pt-2 text-[11px] text-neutral-400">Puedes corregir lo que registraste: por dónde fue, qué pasó, qué dijo el cliente, cotización y recordatorio.</p>
          <ListaRegistros registros={l.registros} editar={editarRegistro} />
        </div>
      )}
    </li>
  );
}

/** Agregar un contacto propio (no asignado por el gerente). */
export function AgregarContacto() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  if (!abierto) return <button onClick={() => setAbierto(true)} className="btn min-h-10"><Plus size={15} aria-hidden /> Agregar contacto</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16" onClick={() => setAbierto(false)}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={(f) => iniciar(async () => { setError(""); try { const r = await agregarContactoPropio(f); if (!r.ok) return setError(r.error); setAbierto(false); router.refresh(); } catch { setError("No hay conexión o tu sesión se cerró. Recarga la página."); } })}
        className="animate-aparecer w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-flotante"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-titulo text-xl font-semibold">Agregar contacto</h2>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"><X size={18} /></button>
        </div>
        <label className="block"><span className="label">Nombre</span><input name="nombre" required className="input min-h-10" /></label>
        <label className="block"><span className="label">Teléfono</span><input name="telefono" required inputMode="tel" className="input min-h-10" /></label>
        <label className="block"><span className="label">Marca (opcional)</span><input name="marca" className="input min-h-10" /></label>
        <label className="block"><span className="label">Correo (opcional)</span><input name="email" type="email" className="input min-h-10" /></label>
        <label className="block"><span className="label">Nota (opcional)</span><input name="nota" className="input min-h-10" placeholder="De dónde viene, qué busca…" /></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pendiente} className="btn-primario min-h-10 w-full">{pendiente ? "Guardando…" : "Agregar a mis contactos de hoy"}</button>
      </form>
    </div>
  );
}

/**
 * Avisos de recordatorios: mientras el panel está abierto, al llegar la hora de volver a llamar a alguien aparece
 * un aviso (y una notificación del navegador si se activaron). La página se actualiza sola cada 2 minutos.
 */
export function Avisos({ proximos }: { proximos: { id: string; nombre: string; cuando: string }[] }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [permiso, setPermiso] = useState<string>("default");

  useEffect(() => {
    if (typeof Notification !== "undefined") setPermiso(Notification.permission);
    const refresco = setInterval(() => router.refresh(), 2 * 60 * 1000);
    const timers = proximos
      .map((p) => ({ ...p, ms: new Date(p.cuando).getTime() - Date.now() }))
      .filter((p) => p.ms > 0 && p.ms < 12 * 3600 * 1000)
      .map((p) =>
        setTimeout(() => {
          const texto = `Es hora de volver a llamar a ${p.nombre}`;
          setAviso(texto);
          try { if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Panel Vendedoras", { body: texto, icon: "/icon.png" }); } catch {}
          router.refresh();
        }, p.ms)
      );
    return () => { clearInterval(refresco); timers.forEach(clearTimeout); };
  }, [proximos, router]);

  return (
    <>
      {aviso && (
        <div role="alert" className="animate-aparecer fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl bg-carbon px-4 py-3 text-sm text-white shadow-flotante">
          <Bell size={18} className="shrink-0 text-marca" aria-hidden />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-white/60 hover:text-white"><X size={16} /></button>
        </div>
      )}
      {permiso === "default" && proximos.length > 0 && (
        <button
          onClick={async () => { try { setPermiso(await Notification.requestPermission()); } catch {} }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline hover:text-carbon"
        >
          <Bell size={13} aria-hidden /> Activar avisos en este dispositivo para los recordatorios
        </button>
      )}
    </>
  );
}

/** Apartado de observaciones de cada contacto: se guarda solo al salir del cuadro. */
function Observaciones({ id, valor }: { id: string; valor: string | null }) {
  const [texto, setTexto] = useState(valor ?? "");
  const [estado, setEstado] = useState<"" | "guardando" | "listo" | "error">("");
  const guardar = async () => {
    if (texto.trim() === (valor ?? "").trim()) return;
    setEstado("guardando");
    try { const r = await guardarObservaciones(id, texto); setEstado(r.ok ? "listo" : "error"); } catch { setEstado("error"); }
  };
  return (
    <label className="block border-t border-linea px-4 py-2.5">
      <span className="label flex items-center justify-between">
        Observaciones
        <span className="text-[11px] font-normal text-neutral-400">{estado === "guardando" ? "Guardando…" : estado === "listo" ? "Guardado" : estado === "error" ? <span className="text-red-600">No se guardó</span> : ""}</span>
      </span>
      <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setEstado(""); }} onBlur={guardar} rows={2} placeholder="Escribe aquí lo importante de este cliente…" className="input text-sm" />
    </label>
  );
}
