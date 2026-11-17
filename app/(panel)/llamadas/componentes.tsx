"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRound, Trash2, UserPlus } from "lucide-react";
import { activarVendedora, asignarContactos, cambiarPasswordVendedora, crearVendedora, eliminarVendedora, quitarContacto } from "./actions";

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

const useAccion = () => {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<{ ok: boolean; t: string } | null>(null);
  const correr = (fn: () => Promise<string | void>) =>
    iniciar(async () => {
      setMensaje(null);
      try {
        const t = await fn();
        if (t) setMensaje({ ok: true, t });
        router.refresh();
      } catch (e) {
        setMensaje({ ok: false, t: e instanceof Error ? e.message : "No se guardó" });
      }
    });
  return { pendiente, mensaje, correr };
};

/** Pegar los contactos del día (uno por línea) y asignarlos a una vendedora. */
export function AsignarContactos({ vendedoras, hoy }: { vendedoras: { id: string; nombre: string }[]; hoy: string }) {
  const { pendiente, mensaje, correr } = useAccion();
  const [texto, setTexto] = useState("");
  const [vendedora, setVendedora] = useState(vendedoras[0]?.id ?? "");
  const [dia, setDia] = useState(hoy);
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim()).length;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold">Asignar contactos del día</h2>
      <p className="mb-3 mt-0.5 text-xs text-neutral-500">Uno por línea: <b>Nombre, teléfono, nota</b> (también puedes pegar columnas del Excel). Le aparecen a la vendedora en «Hoy».</p>
      {vendedoras.length === 0 ? <p className="text-sm text-neutral-500">Primero da acceso a una vendedora.</p> : (
        <form action={() => correr(async () => { const r = await asignarContactos(vendedora, dia, texto); setTexto(""); return `${r.asignados} contactos asignados${r.sinTelefono ? ` · ${r.sinTelefono} líneas sin teléfono no se agregaron` : ""}`; })} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Vendedora</span><select value={vendedora} onChange={(e) => setVendedora(e.target.value)} className="input min-h-10">{vendedoras.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></label>
            <label className="block"><span className="label">Para el día</span><input type="date" value={dia} min={hoy} onChange={(e) => setDia(e.target.value)} className="input min-h-10" /></label>
          </div>
          <label className="block">
            <span className="label">Contactos {lineas > 0 && <span className="text-neutral-400">· {lineas} {lineas === 1 ? "línea" : "líneas"}</span>}</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} required placeholder={"Juan Pérez, 5512345678, quiere registrar su marca\nMaría López, 33 1234 5678"} className="input font-mono text-xs" />
          </label>
          {mensaje && <p role="status" className={`text-sm ${mensaje.ok ? "text-marca-oscuro" : "text-red-600"}`}>{mensaje.t}</p>}
          <button disabled={pendiente || !lineas} className="btn-primario min-h-10">{pendiente ? "Asignando…" : "Asignar contactos"}</button>
        </form>
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
              <button disabled={pendiente} onClick={() => { const p = prompt(`Nueva contraseña para ${v.nombre}:`); if (p) correr(async () => { await cambiarPasswordVendedora(v.id, p); return `Contraseña de ${v.nombre} cambiada`; }); }} className="btn min-h-8 px-2 py-1 text-xs"><KeyRound size={13} aria-hidden /> Contraseña</button>
              <button disabled={pendiente} onClick={() => { if (confirm(v.activa ? `¿Quitarle el acceso a ${v.nombre}? Sus contactos y llamadas se conservan.` : `¿Devolverle el acceso a ${v.nombre}?`)) correr(() => activarVendedora(v.id, !v.activa)); }} className="btn min-h-8 px-2 py-1 text-xs">{v.activa ? "Quitar acceso" : "Devolver acceso"}</button>
              {v.contactos === 0 && (
                <button disabled={pendiente} onClick={() => { if (confirm(`¿Eliminar a ${v.nombre}?`)) correr(() => eliminarVendedora(v.id)); }} className="btn min-h-8 px-2 py-1 text-xs text-red-600" aria-label={`Eliminar a ${v.nombre}`}><Trash2 size={13} aria-hidden /></button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <form action={() => correr(async () => { await crearVendedora(nombre, password); setNombre(""); setPassword(""); return "Acceso creado"; })} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <label className="block"><span className="label">Nombre de la vendedora</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} required className="input min-h-10" placeholder="Nombre y apellido" /></label>
        <label className="block"><span className="label">Contraseña</span><input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} className="input min-h-10" autoComplete="new-password" /></label>
        <button disabled={pendiente} className="btn-primario min-h-10"><UserPlus size={15} aria-hidden /> Dar acceso</button>
      </form>
      {mensaje && <p role="status" className={`mt-2 text-sm ${mensaje.ok ? "text-marca-oscuro" : "text-red-600"}`}>{mensaje.t}</p>}
    </section>
  );
}

export function QuitarContacto({ id, nombre }: { id: string; nombre: string }) {
  const { pendiente, mensaje, correr } = useAccion();
  return (
    <>
      {mensaje && !mensaje.ok && <span className="mr-2 text-xs text-red-600">{mensaje.t}</span>}
      <button disabled={pendiente} onClick={() => { if (confirm(`¿Quitar a ${nombre} de los contactos asignados?`)) correr(() => quitarContacto(id)); }} className="text-xs text-neutral-400 underline hover:text-red-600">Quitar</button>
    </>
  );
}
