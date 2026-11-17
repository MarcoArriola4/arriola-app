"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { FileSpreadsheet, KeyRound, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { activarVendedora, asignarContactos, subirExcelContactos, cambiarPasswordVendedora, crearVendedora, editarContacto, eliminarVendedora, quitarContacto, type DatosContacto } from "./actions";
import type { Resultado } from "@/lib/vendedoras";

/** El reporte de hoy se actualiza solo cada 30 segundos (lo que van registrando las vendedoras). */
export function ActualizarSolo() {
  const router = useRouter();
  const [hace, setHace] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { router.refresh(); setHace(0); }, 30000);
    const s = setInterval(() => setHace((h) => h + 1), 1000);
    return () => { clearInterval(t); clearInterval(s); };
  }, [router]);
  return (
    <p className="-mt-3 mb-4 flex items-center gap-2 text-xs text-neutral-500" aria-live="polite">
      <span className="h-2 w-2 animate-pulse rounded-full bg-marca" aria-hidden /> En vivo · actualizado hace {hace} s
    </p>
  );
}

/** Corre una acción del servidor y muestra su mensaje (las acciones devuelven { ok, error } en lugar de fallar). */
const useAccion = () => {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; t: string } | null>(null);
  const correr = (fn: () => Promise<Resultado<unknown>>, alTerminar?: () => void) =>
    iniciar(async () => {
      setMensaje(null);
      try {
        const r = await fn();
        if (r.ok) {
          if (r.mensaje) setMensaje({ ok: true, t: r.mensaje });
          alTerminar?.();
          router.refresh();
        } else setMensaje({ ok: false, t: r.error });
      } catch {
        setMensaje({ ok: false, t: "No hay conexión o la sesión se cerró. Recarga la página e inténtalo de nuevo." });
      }
    });
  return { pendiente, mensaje, correr };
};

/** Subir el Excel de contactos del día (o pegarlos) y asignarlos a una vendedora. */
export function AsignarContactos({ vendedoras, hoy }: { vendedoras: { id: string; nombre: string }[]; hoy: string }) {
  const { pendiente, mensaje, correr } = useAccion();
  const [texto, setTexto] = useState("");
  const [vendedora, setVendedora] = useState(vendedoras[0]?.id ?? "");
  const [dia, setDia] = useState(hoy);
  const [modo, setModo] = useState<"excel" | "pegar">("excel");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Asignar contactos del día</h2>
      <p className="mb-3 mt-0.5 text-xs text-neutral-500">Le aparecen a la vendedora en «Hoy», con un apartado de observaciones por cada contacto.</p>
      {vendedoras.length === 0 ? <p className="text-sm text-neutral-500">Primero da acceso a una vendedora.</p> : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Vendedora</span><select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="input min-h-10">{vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></label>
            <label className="block"><span className="label">Para el día</span><input type="date" value={dia} min={hoy} onChange={(e) => setDia(e.target.value)} className="input min-h-10" /></label>
          </div>
          <div className="inline-flex rounded-lg bg-black/[0.05] p-1" role="tablist">
            {([["excel", "Subir Excel"], ["pegar", "Pegar contactos"]] as const).map(([id, t]) => (
              <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => setModo(id)} className={`rounded-md px-3 py-1.5 text-xs font-medium ${modo === id ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500"}`}>{t}</button>
            ))}
          </div>
          {modo === "excel" ? (
            <form action={(f) => { f.set("vendedoraId", vendedora); f.set("dia", dia); correr(() => subirExcelContactos(f)); }} className="space-y-3">
              <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-neutral-600">
                <FileSpreadsheet size={14} className="mr-1 inline text-marca-oscuro" aria-hidden />
                Columnas: <b>Cliente, Marca, Expediente, Teléfono, Correo, Estatus</b> (y <b>Observaciones</b>, opcional). Una fila por contacto.
              </p>
              <input type="file" name="archivo" required accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input min-h-10 py-1.5 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-carbon file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white" />
              {mensaje && <p role="status" className={`text-sm ${mensaje.ok ? "text-marca-oscuro" : "text-red-600"}`}>{mensaje.t}</p>}
              <button disabled={pendiente} className="btn-primario min-h-10">{pendiente ? "Subiendo…" : "Subir y asignar"}</button>
            </form>
          ) : (
        <form action={() => correr(() => asignarContactos(vendedora, dia, texto), () => setTexto(""))} className="space-y-3">
          <p className="text-xs text-neutral-500">
            Puedes pegar filas copiadas del Excel, un contacto por línea separado por comas (<b>Cliente, Marca, Expediente, Teléfono, Correo, Estatus</b>)
            o cada dato en su renglón dejando <b>una línea en blanco entre contactos</b>.
          </p>
          <label className="block">
            <span className="label">Contactos {lineas > 0 && <span className="text-neutral-400">· {lineas} {lineas === 1 ? "línea" : "líneas"}</span>}</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} required placeholder={"Juan Pérez, Bonafont, 3123456, 5512345678, juan@correo.com, Negativa\n\nó un dato por renglón:\nMaría López\nLa Casa\n3111111\n33 1234 5678"} className="input font-mono text-xs" />
          </label>
          {mensaje && <p role="status" className={`text-sm ${mensaje.ok ? "text-marca-oscuro" : "text-red-600"}`}>{mensaje.t}</p>}
          <button disabled={pendiente || !lineas} className="btn-primario min-h-10">{pendiente ? "Asignando…" : "Asignar contactos"}</button>
        </form>
          )}
        </div>
      )}
    </section>
  );
}

/** Accesos al Panel Vendedoras: dar de alta, cambiar contraseña, quitar o devolver el acceso, eliminar. */
export function Accesos({ vendedoras }: { vendedoras: { id: string; nombre: string; activa: boolean; contactos: number }[] }) {
  const { pendiente, mensaje, correr } = useAccion();
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Accesos al Panel Vendedoras</h2>
      <p className="mb-3 mt-0.5 text-xs text-neutral-500">Entran en <b>/vendedoras</b> con su nombre y la contraseña que les des. Solo ven sus propios contactos.</p>
      <ul className="mb-4 divide-y divide-black/5 rounded-xl border border-linea">
        {vendedoras.length === 0 && <li className="px-3 py-4 text-center text-sm text-neutral-500">Sin vendedoras todavía.</li>}
        {vendedoras.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
            <span className={`font-medium ${v.activa ? "" : "text-neutral-400 line-through"}`}>{v.nombre}</span>
            <span className="text-xs text-neutral-400">{v.contactos} contactos</span>
            <span className="ml-auto flex flex-wrap gap-1.5">
              <button disabled={pendiente} onClick={() => { const p = prompt(`Nueva contraseña para ${v.nombre}:`); if (p) correr(() => cambiarPasswordVendedora(v.id, p)); }} className="btn min-h-8 px-2 py-1 text-xs"><KeyRound size={13} aria-hidden /> Contraseña</button>
              <button disabled={pendiente} onClick={() => { if (confirm(v.activa ? `¿Quitarle el acceso a ${v.nombre}? Sus contactos y llamadas se conservan.` : `¿Devolverle el acceso a ${v.nombre}?`)) correr(() => activarVendedora(v.id, !v.activa)); }} className="btn min-h-8 px-2 py-1 text-xs">{v.activa ? "Quitar acceso" : "Devolver acceso"}</button>
              {v.contactos === 0 && (
                <button disabled={pendiente} onClick={() => { if (confirm(`¿Eliminar a ${v.nombre}?`)) correr(() => eliminarVendedora(v.id)); }} className="btn min-h-8 px-2 py-1 text-xs text-red-600" aria-label={`Eliminar a ${v.nombre}`}><Trash2 size={13} aria-hidden /></button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form action={() => correr(() => crearVendedora(nombre, password), () => { setNombre(""); setPassword(""); })} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <label className="block"><span className="label">Nombre de la vendedora</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="input min-h-10" placeholder="Nombre y apellido" /></label>
        <label className="block"><span className="label">Contraseña</span><input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} className="input min-h-10" autoComplete="new-password" /></label>
        <button disabled={pendiente} className="btn-primario min-h-10"><UserPlus size={15} aria-hidden /> Dar acceso</button>
      </form>
      {mensaje && <p role="status" className={`mt-2 text-sm ${mensaje.ok ? "text-marca-oscuro" : "text-red-600"}`}>{mensaje.t}</p>}
    </section>
  );
}

export function QuitarContacto({ id, nombre, llamadas = 0 }: { id: string; nombre: string; llamadas?: number }) {
  const { pendiente, mensaje, correr } = useAccion();
  const pregunta = llamadas
    ? `¿Eliminar a ${nombre}? También se borran sus ${llamadas} ${llamadas === 1 ? "llamada registrada" : "llamadas registradas"}. No se puede deshacer.`
    : `¿Eliminar a ${nombre} de los contactos asignados?`;
  return (
    <>
      {mensaje && !mensaje.ok && <span className="mr-2 text-xs text-red-600">{mensaje.t}</span>}
      <button disabled={pendiente} onClick={() => { if (confirm(pregunta)) correr(() => quitarContacto(id)); }} title="Eliminar contacto" aria-label={`Eliminar a ${nombre}`} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600">
        <Trash2 size={13} aria-hidden /> Eliminar
      </button>
    </>
  );
}

/** Editar un contacto ya asignado (datos, vendedora y día). */
export function EditarContacto({ id, datos, vendedoras }: { id: string; datos: DatosContacto; vendedoras: { id: string; nombre: string }[] }) {
  const { pendiente, mensaje, correr } = useAccion();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(datos);
  const campo = (k: keyof DatosContacto, t: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block">
      <span className="label">{t}</span>
      <input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} className="input min-h-10" {...extra} />
    </label>
  );
  if (!abierto) {
    return (
      <button onClick={() => { setD(datos); setAbierto(true); }} title="Editar contacto" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-neutral-600 hover:bg-black/[0.05] hover:text-carbon">
        <Pencil size={13} aria-hidden /> Editar
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-12" onClick={() => setAbierto(false)}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={() => correr(() => editarContacto(id, d), () => setAbierto(false))}
        className="animate-aparecer w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 text-left shadow-flotante"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-titulo text-xl font-semibold">Editar contacto</h2>
          <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100"><X size={18} /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {campo("nombre", "Cliente", { required: true })}
          {campo("telefono", "Teléfono", { inputMode: "tel" })}
          {campo("marca", "Marca")}
          {campo("expediente", "Expediente")}
          {campo("email", "Correo", { type: "email" })}
          {campo("estatus", "Estatus")}
        </div>
        {campo("nota", "Nota para la vendedora")}
        <label className="block">
          <span className="label">Observaciones</span>
          <textarea value={d.observaciones} onChange={(e) => setD({ ...d, observaciones: e.target.value })} rows={2} className="input" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Vendedora</span><select value={d.vendedoraId} onChange={(e) => setD({ ...d, vendedoraId: e.target.value })} className="input min-h-10">{vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></label>
          {campo("dia", "Asignado para el día", { type: "date", required: true })}
        </div>
        {mensaje && !mensaje.ok && <p role="alert" className="text-sm text-red-600">{mensaje.t}</p>}
        <div className="flex gap-2">
          <button disabled={pendiente} className="btn-primario min-h-10 flex-1">{pendiente ? "Guardando…" : "Guardar cambios"}</button>
          <button type="button" onClick={() => setAbierto(false)} className="btn min-h-10">Cancelar</button>
        </div>
      </form>
    </div>
  );
}
