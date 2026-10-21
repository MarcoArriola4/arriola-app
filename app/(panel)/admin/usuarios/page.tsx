import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { PERMISOS, listaPermisos } from "@/lib/permisos";
import { crearUsuario, editarUsuario, eliminarUsuario } from "@/app/actions";
import { Encabezado } from "@/components/ui";
import { BotonConfirmar } from "@/components/boton-confirmar";

export const metadata = { title: "Usuarios" };

const MENSAJES: Record<string, [string, boolean]> = {
  creado: ["Usuario creado.", true],
  guardado: ["Cambios guardados. Aplican desde su siguiente clic.", true],
  eliminado: ["Usuario eliminado.", true],
  corta: ["La contraseña debe tener al menos 8 caracteres.", false],
  existe: ["Ya existe un usuario con ese correo.", false],
  propio: ["No puedes quitarte a ti mismo el acceso de administrador ni eliminarte.", false],
};

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [sesion, sp] = await Promise.all([requerirAdmin(), searchParams]);
  const usuarios = await db.usuario.findMany({ orderBy: [{ activo: "desc" }, { creado: "asc" }] });
  const msg = MENSAJES[sp.ok ?? sp.error ?? ""];

  return (
    <>
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> Admin</Link>
      <Encabezado titulo="Usuarios y permisos" subtitulo="Solo tú, como administrador, puedes agregar, editar o quitar usuarios y cambiar lo que cada uno puede hacer." />
      {msg && <p className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg[1] ? "bg-marca-claro text-marca-oscuro" : "bg-red-50 text-red-700"}`}>{msg[0]}</p>}

      <div className="space-y-3">
        {usuarios.map((u) => {
          const tiene = listaPermisos(u);
          const yo = u.id === sesion.id;
          return (
            <details key={u.id} className={`card overflow-hidden ${u.activo ? "" : "opacity-60"}`}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
                <span>
                  <span className="font-semibold">{u.nombre}</span>
                  {yo && <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">tú</span>}
                  <span className="block text-xs text-neutral-500">{u.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {!u.activo && <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">Desactivado</span>}
                  {u.rol === "ADMIN" ? (
                    <span className="rounded bg-carbon px-1.5 py-0.5 font-medium text-white">Administrador · todo</span>
                  ) : (
                    [...tiene].map((p) => <span key={p} className="rounded bg-marca-claro px-1.5 py-0.5 text-marca-oscuro">{PERMISOS[p].txt}</span>)
                  )}
                  <span className="ml-1 text-neutral-400">Editar ▾</span>
                </span>
              </summary>
              <form action={editarUsuario} className="grid gap-3 border-t border-black/5 px-5 py-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={u.id} />
                <label className="block"><span className="label">Nombre</span><input name="nombre" defaultValue={u.nombre} required className="input" /></label>
                <label className="block"><span className="label">Correo</span><input name="email" type="email" defaultValue={u.email} required className="input" /></label>
                <label className="block"><span className="label">Tipo</span>
                  <select name="rol" defaultValue={u.rol} className="input"><option value="OPERATIVO">Usuario (con los permisos de abajo)</option><option value="ADMIN">Administrador (todo)</option></select>
                </label>
                <label className="block"><span className="label">Contraseña nueva (opcional)</span><input name="password" type="text" minLength={8} placeholder="Déjala vacía para no cambiarla" className="input" autoComplete="off" /></label>
                <Permisos activos={new Set((u.permisos ?? "").split(","))} />
                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="activo" defaultChecked={u.activo} className="accent-marca-oscuro" /> Activo (puede entrar a la app)</label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button className="btn-primario">Guardar cambios</button>
                </div>
              </form>
              {!yo && (
                <form action={eliminarUsuario} className="border-t border-black/5 px-5 py-3 text-right">
                  <input type="hidden" name="id" value={u.id} />
                  <BotonConfirmar mensaje={`¿Eliminar a ${u.nombre}? Ya no podrá entrar. (Si solo quieres quitarle el acceso un tiempo, mejor desactívalo.)`} className="text-xs font-medium text-neutral-400 hover:text-red-600">Eliminar usuario</BotonConfirmar>
                </form>
              )}
            </details>
          );
        })}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold">Agregar usuario</h2>
        <form action={crearUsuario} className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Nombre</span><input name="nombre" required className="input" /></label>
          <label className="block"><span className="label">Correo</span><input name="email" type="email" required className="input" /></label>
          <label className="block"><span className="label">Contraseña inicial (mín. 8)</span><input name="password" type="text" required minLength={8} className="input" autoComplete="off" /></label>
          <label className="block"><span className="label">Tipo</span>
            <select name="rol" className="input"><option value="OPERATIVO">Usuario (con los permisos de abajo)</option><option value="ADMIN">Administrador (todo)</option></select>
          </label>
          <Permisos activos={new Set(["oficios", "marcas", "cobros", "contrataciones"])} />
          <div className="sm:col-span-2"><button className="btn-primario">+ Agregar usuario</button></div>
        </form>
      </section>
    </>
  );
}

function Permisos({ activos }: { activos: Set<string> }) {
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">Permisos (si es administrador, tiene todos)</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(PERMISOS).map(([k, p]) => (
          <label key={k} className="flex items-start gap-2 rounded-lg border border-black/[0.07] px-3 py-2 text-sm">
            <input type="checkbox" name="permisos" value={k} defaultChecked={activos.has(k)} className="mt-0.5 accent-marca-oscuro" />
            <span><span className="font-medium">{p.txt}</span><span className="block text-xs text-neutral-500">{p.ayuda}</span></span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-400">Todos pueden ver clientes, marcas, notificaciones y reportes. Solo el administrador entra a Admin y descarga contraseñas del IMPI.</p>
    </fieldset>
  );
}
