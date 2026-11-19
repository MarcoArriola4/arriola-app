"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Bell, CalendarClock, Check, CircleDollarSign, History, MessageCircle, NotebookPen, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ChipCanal, FormRegistro, ListaRegistros, RESULTADOS_UI, enDias, fmt, txtRes, type RegistroVista } from "@/components/registros-contacto";
import { CamposVenta, SERVICIOS, aFormData, type DatosVenta } from "@/components/campos-venta";
import { agregarContactoPropio, borrarNota, crearNota, editarNota, editarRegistro, editarVenta, guardarObservaciones, marcarNota, registrarLlamada, registrarVenta } from "./actions";

export type LeadVista = {
  id: string; nombre: string; telefono: string; email: string | null; nota: string | null; estado: string; cotizacion: boolean;
  marca: string | null; expediente: string | null; estatus: string | null; observaciones: string | null;
  comentario: string | null; volverLlamar: string | null; ultimaLlamada: string | null; intentos: number; asignadoEl: string; propio: boolean;
  canal: string | null; contestoPor: string | null; registros: RegistroVista[];
  venta: { estado: string; motivo: string | null } | null;
};

const ESTADOS_VENTA: Record<string, { txt: string; cls: string }> = {
  PENDIENTE: { txt: "Venta en revisión", cls: "bg-amber-50 text-amber-800" },
  APROBANDO: { txt: "Venta en revisión", cls: "bg-amber-50 text-amber-800" },
  APROBADA: { txt: "Venta aprobada", cls: "bg-marca-claro text-marca-oscuro" },
  RECHAZADA: { txt: "Venta rechazada", cls: "bg-red-50 text-red-700" },
};
const CERRADOS_UI = ["VENDIDO", "NO_INTERESA", "SIN_CONTACTO"];

/** Tarjeta de un contacto. `numero`: su lugar fijo en la lista del día; `siguiente`: el próximo por llamar. */
export function TarjetaLead({ l, numero, siguiente }: { l: LeadVista; numero?: number; siguiente?: boolean }) {
  const [abierto, setAbierto] = useState<"" | "nuevo" | "whats" | "historial">("");
  const esperandoWhats = l.canal === "WHATSAPP" && !l.contestoPor && !CERRADOS_UI.includes(l.estado);
  const estado = RESULTADOS_UI[l.estado];
  const vencido = l.volverLlamar && new Date(l.volverLlamar) <= new Date();
  const trabajado = numero != null && l.estado !== "PENDIENTE";

  return (
    <li className={`card overflow-hidden ${siguiente ? "border-marca ring-2 ring-marca/40" : vencido ? "border-amber-300 ring-1 ring-amber-200" : ""} ${trabajado && abierto === "" ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3">
        {numero != null && (
          <span className={`cifra flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-1.5 text-sm font-semibold ${trabajado ? "bg-marca-claro text-marca-oscuro" : siguiente ? "bg-marca text-white" : "bg-black/[0.06] text-neutral-600"}`} aria-label={`Contacto número ${numero}`}>
            {trabajado ? <Check size={15} aria-hidden /> : numero}
          </span>
        )}
        <div className="min-w-0 flex-1 basis-56">
          {siguiente && <p className="text-[11px] font-semibold uppercase tracking-wide text-marca-oscuro">Siguiente por llamar · #{numero}</p>}
          <p className="font-semibold">{trabajado && <span className="cifra mr-1 text-neutral-400">#{numero}</span>}{l.nombre}</p>
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
          {l.venta && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADOS_VENTA[l.venta.estado]?.cls ?? ""}`} title={l.venta.motivo ?? undefined}>{ESTADOS_VENTA[l.venta.estado]?.txt}{l.venta.motivo && ` · ${l.venta.motivo}`}</span>}
          {l.contestoPor && <ChipCanal canal={l.contestoPor} prefijo={l.contestoPor === "WHATSAPP" ? "Respondió por " : "Contestó por "} />}
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
        {(!l.venta || l.venta.estado === "RECHAZADA") && (
          <ReportarVenta
            leadId={l.id}
            inicial={{ clienteNombre: l.nombre, telefono: l.telefono, email: l.email ?? "", denominacion: l.marca ?? "", numeroExpediente: l.expediente ?? "" }}
          />
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          {esperandoWhats && (
            <button onClick={() => setAbierto(abierto === "whats" ? "" : "whats")} className="btn min-h-10 border-emerald-300 text-emerald-800">
              <MessageCircle size={15} aria-hidden /> {abierto === "whats" ? "Cerrar" : "Ya respondió el WhatsApp"}
            </button>
          )}
          <button onClick={() => setAbierto(abierto === "nuevo" ? "" : "nuevo")} className="btn-marca min-h-10">{abierto === "nuevo" ? "Cerrar" : "Registrar llamada o WhatsApp"}</button>
        </span>
      </div>
      {abierto === "nuevo" && (
        <div className="border-t border-linea px-4 py-3">
          <FormRegistro
            onGuardar={(f) => { f.set("leadId", l.id); return registrarLlamada(f); }}
            onListo={() => setAbierto("")}
            textoBoton="Guardar registro"
          />
        </div>
      )}
      {abierto === "whats" && (
        <div className="border-t border-linea bg-emerald-50/40 px-4 py-3">
          <p className="mb-2 text-xs text-emerald-900">¿Qué te respondió por WhatsApp?</p>
          <FormRegistro
            inicial={{ canal: "WHATSAPP" }}
            onGuardar={(f) => { f.set("leadId", l.id); return registrarLlamada(f); }}
            onListo={() => setAbierto("")}
            textoBoton="Guardar respuesta"
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
export function Avisos({ proximos }: { proximos: { id: string; texto: string; cuando: string }[] }) {
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
          const texto = p.texto;
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

const hoyMx = () => new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
const VENTA_VACIA: DatosVenta = { clienteNombre: "", telefono: "", email: "", servicio: "MARCA", denominacion: "", numeroExpediente: "", pagado: "", debe: "", fechaCobro: "", banco: "", notas: "" };

/** Botón "Registrar venta": la venta queda en revisión hasta que el administrador la apruebe. */
export function ReportarVenta({ leadId, ventaId, inicial, boton }: { leadId?: string; ventaId?: string; inicial?: Partial<DatosVenta>; boton?: React.ReactNode }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState<DatosVenta>({ ...VENTA_VACIA, fechaCobro: hoyMx(), ...inicial });
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  if (!abierto) {
    return (
      <button type="button" onClick={() => { setD({ ...VENTA_VACIA, fechaCobro: hoyMx(), ...inicial }); setError(""); setAbierto(true); }} className="btn min-h-10">
        {boton ?? <><CircleDollarSign size={15} aria-hidden /> Registrar venta</>}
      </button>
    );
  }
  const enviar = () =>
    iniciar(async () => {
      setError("");
      const f = aFormData(d);
      if (leadId) f.set("leadId", leadId);
      try {
        const r = ventaId ? await editarVenta(ventaId, f) : await registrarVenta(f);
        if (!r.ok) return setError(r.error);
        setAbierto(false);
        router.refresh();
      } catch { setError("No hay conexión o tu sesión se cerró. Recarga la página."); }
    });
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10" onClick={() => setAbierto(false)}>
      <form onClick={(e) => e.stopPropagation()} action={enviar} className="animate-aparecer w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-flotante">
        <div className="flex items-center justify-between">
          <h2 className="font-titulo text-xl font-semibold">{ventaId ? "Corregir venta" : "Registrar venta"}</h2>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"><X size={18} /></button>
        </div>
        <p className="text-xs text-neutral-500">La venta queda <b>en revisión</b>. Cuando el administrador la apruebe, pasa a Contrataciones y cuenta en tus ventas.</p>
        <CamposVenta d={d} set={setD} />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pendiente} className="btn-primario min-h-10 w-full">{pendiente ? "Enviando…" : "Enviar a revisión"}</button>
      </form>
    </div>
  );
}

export type VentaPropia = { id: string; estado: string; motivo: string | null; creado: string; datos: DatosVenta; revisadoEl: string | null };

/** Lista de ventas que reportó la vendedora, con su estado (en revisión, aprobada o rechazada). */
export function MisVentas({ ventas }: { ventas: VentaPropia[] }) {
  if (!ventas.length) return <p className="card px-4 py-6 text-center text-sm text-neutral-500">Todavía no has reportado ventas en este periodo.</p>;
  const mxn = (n: string) => (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
  return (
    <ul className="card divide-y divide-black/5">
      {ventas.map((v) => {
        const e = ESTADOS_VENTA[v.estado];
        return (
          <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1 basis-60">
              <p className="font-medium">{v.datos.clienteNombre}</p>
              <p className="text-xs text-neutral-500">
                {SERVICIOS[v.datos.servicio] ?? v.datos.servicio}{v.datos.denominacion && ` · ${v.datos.denominacion}`}{v.datos.numeroExpediente && ` · Exp. ${v.datos.numeroExpediente}`}
              </p>
              <p className="cifra text-xs text-neutral-600">Pagó {mxn(v.datos.pagado)}{Number(v.datos.debe) > 0 && ` · debe ${mxn(v.datos.debe)}`} · cobro {new Date(`${v.datos.fechaCobro}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })}</p>
              {v.motivo && <p className="text-xs text-red-600">Motivo del rechazo: {v.motivo}</p>}
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e?.cls ?? ""}`}>{e?.txt ?? v.estado}</span>
            {(v.estado === "PENDIENTE" || v.estado === "RECHAZADA") && <ReportarVenta ventaId={v.id} inicial={v.datos} boton={v.estado === "RECHAZADA" ? "Corregir y reenviar" : "Corregir"} />}
          </li>
        );
      })}
    </ul>
  );
}

export type NotaVista = { id: string; texto: string; recordarEl: string | null; hecha: boolean; creado: string };
const aLocalMx = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 6 * 3600e3).toISOString().slice(0, 16) : "");

/** Formulario de una nota: texto y recordatorio opcional (fecha y hora). */
function FormNota({ inicial, onListo, onCancelar }: { inicial?: NotaVista; onListo: () => void; onCancelar?: () => void }) {
  const router = useRouter();
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [cuando, setCuando] = useState(aLocalMx(inicial?.recordarEl ?? null));
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const guardar = () =>
    iniciar(async () => {
      setError("");
      const f = new FormData();
      f.set("texto", texto);
      f.set("recordarEl", cuando);
      try {
        const r = inicial ? await editarNota(inicial.id, f) : await crearNota(f);
        if (!r.ok) return setError(r.error);
        onListo();
        router.refresh();
      } catch { setError("No hay conexión o tu sesión se cerró. Recarga la página."); }
    });
  return (
    <form action={guardar} className="space-y-3">
      <label className="block">
        <span className="label">Nota</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} required autoFocus placeholder="Ej. Mandar la cotización corregida a la clienta de la marca de café" className="input" />
      </label>
      <label className="block">
        <span className="label">Recordarme el (opcional)</span>
        <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} className="input min-h-10" />
        <span className="mt-1 flex flex-wrap gap-1.5">
          {([["En 1 hora", 0], ["Mañana 10:00", 1], ["En 3 días", 3]] as const).map(([t, n]) => (
            <button key={t} type="button" onClick={() => setCuando(n === 0 ? aLocalMx(new Date(Date.now() + 3600e3).toISOString()) : enDias(n))} className="rounded-md bg-black/[0.05] px-2 py-1 text-[11px] text-neutral-600 hover:bg-black/10">{t}</button>
          ))}
          {cuando && <button type="button" onClick={() => setCuando("")} className="rounded-md px-2 py-1 text-[11px] text-neutral-500 underline">Sin recordatorio</button>}
        </span>
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={pendiente || !texto.trim()} className="btn-primario min-h-10">{pendiente ? "Guardando…" : inicial ? "Guardar cambios" : "Guardar nota"}</button>
        {onCancelar && <button type="button" onClick={onCancelar} className="btn min-h-10">Cancelar</button>}
      </div>
    </form>
  );
}

/** Botón «Nota»: agregar una nota propia con recordatorio desde cualquier pestaña. */
export function NuevaNota() {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) return <button onClick={() => setAbierto(true)} className="btn min-h-10"><NotebookPen size={15} aria-hidden /> Nota</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16" onClick={() => setAbierto(false)}>
      <div onClick={(e) => e.stopPropagation()} className="animate-aparecer w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-flotante">
        <div className="flex items-center justify-between">
          <h2 className="font-titulo text-xl font-semibold">Nueva nota</h2>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"><X size={18} /></button>
        </div>
        <p className="text-xs text-neutral-500">Solo tú ves tus notas. Si le pones fecha y hora, te avisa a esa hora mientras tengas el panel abierto.</p>
        <FormNota onListo={() => setAbierto(false)} />
      </div>
    </div>
  );
}

/** Pestaña «Mis notas»: pendientes (las de recordatorio en orden de fecha) y hechas. */
export function ListaNotas({ pendientes, hechas }: { pendientes: NotaVista[]; hechas: NotaVista[] }) {
  return (
    <>
      <section className="mt-6">
        <h2 className="rotulo mb-2 px-1">Pendientes · {pendientes.length}</h2>
        {pendientes.length === 0 ? <p className="card px-4 py-6 text-center text-sm text-neutral-500">No tienes notas pendientes. Usa el botón «Nota» para agregar una.</p> : (
          <ul className="space-y-2">{pendientes.map((n) => <TarjetaNota key={n.id} n={n} />)}</ul>
        )}
      </section>
      {hechas.length > 0 && (
        <section className="mt-6">
          <h2 className="rotulo mb-2 px-1">Hechas · {hechas.length}</h2>
          <ul className="space-y-2">{hechas.map((n) => <TarjetaNota key={n.id} n={n} />)}</ul>
        </section>
      )}
    </>
  );
}

function TarjetaNota({ n }: { n: NotaVista }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const vencida = !n.hecha && n.recordarEl && new Date(n.recordarEl) <= new Date();
  const correr = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    iniciar(async () => {
      setError("");
      try { const r = await fn(); if (!r.ok) return setError(r.error ?? "No se pudo guardar"); router.refresh(); } catch { setError("No hay conexión. Recarga la página."); }
    });
  return (
    <li className={`card px-4 py-3 ${vencida ? "border-violet-300 ring-1 ring-violet-200" : ""} ${n.hecha ? "opacity-70" : ""}`}>
      {editando ? (
        <FormNota inicial={n} onListo={() => setEditando(false)} onCancelar={() => setEditando(false)} />
      ) : (
        <>
          <p className={`whitespace-pre-wrap text-sm ${n.hecha ? "text-neutral-500 line-through" : "text-carbon"}`}>{n.texto}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {n.recordarEl ? (
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${vencida ? "text-violet-700" : "text-neutral-600"}`}><CalendarClock size={13} aria-hidden /> {vencida ? "Ya es hora · " : "Recordatorio: "}{fmt(n.recordarEl)}</span>
            ) : <span className="text-xs text-neutral-400">Sin recordatorio</span>}
            <span className="text-[11px] text-neutral-400">Creada {fmt(n.creado)}</span>
            <span className="ml-auto flex flex-wrap items-center gap-1">
              <button type="button" disabled={pendiente} onClick={() => correr(() => marcarNota(n.id, !n.hecha))} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-marca-oscuro hover:bg-marca-claro">
                {n.hecha ? <><RotateCcw size={13} aria-hidden /> Volver a pendiente</> : <><Check size={13} aria-hidden /> Hecha</>}
              </button>
              <button type="button" onClick={() => setEditando(true)} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-neutral-600 hover:bg-black/[0.05]"><Pencil size={13} aria-hidden /> Editar</button>
              <button type="button" disabled={pendiente} onClick={() => { if (confirm("¿Borrar esta nota?")) correr(() => borrarNota(n.id)); }} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={13} aria-hidden /> Borrar</button>
            </span>
          </div>
          {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
        </>
      )}
    </li>
  );
}
