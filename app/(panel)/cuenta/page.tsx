import { cambiarMiNombre, cambiarPassword } from "@/app/actions";
import { requerirSesion } from "@/lib/auth";
import { Encabezado } from "@/components/ui";

export const metadata = { title: "Mi cuenta" };

export default async function Cuenta({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ ok, error }, s] = await Promise.all([searchParams, requerirSesion()]);
  return (
    <>
      <Encabezado titulo="Mi cuenta" subtitulo={`${s.nombre} · ${s.email}`} />
      {ok && <p className="mb-4 rounded-lg bg-marca-claro px-4 py-2.5 text-sm text-marca-oscuro">{ok === "nombre" ? "Nombre actualizado." : "Contraseña actualizada."}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error === "nombre" ? "Escribe tu nombre." : error === "corta" ? "La contraseña debe tener al menos 8 caracteres." : "La contraseña actual no es correcta."}</p>}
      <section className="card mb-4 max-w-md p-5">
        <h2 className="mb-4 text-sm font-semibold">Mi nombre</h2>
        <form action={cambiarMiNombre} className="flex gap-2">
          <input name="nombre" defaultValue={s.nombre} required minLength={2} className="input" />
          <button className="btn-primario shrink-0">Guardar</button>
        </form>
        <p className="mt-2 text-xs text-neutral-400">Es el nombre que aparece en el menú y en el historial de cada marca.</p>
      </section>
      <section className="card max-w-md p-5">
        <h2 className="mb-4 text-sm font-semibold">Cambiar contraseña</h2>
        <form action={cambiarPassword} className="space-y-3">
          <label className="block"><span className="label">Contraseña actual</span><input name="actual" type="password" required className="input" autoComplete="current-password" /></label>
          <label className="block"><span className="label">Nueva contraseña (mínimo 8 caracteres)</span><input name="nueva" type="password" required minLength={8} className="input" autoComplete="new-password" /></label>
          <button className="btn-primario">Actualizar</button>
        </form>
      </section>
    </>
  );
}
