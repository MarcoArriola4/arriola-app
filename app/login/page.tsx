import Image from "next/image";
import { iniciarSesion } from "./actions";

export const metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-carbon px-4">
      <div className="w-full max-w-sm">
        <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="mx-auto mb-8 w-64" priority />
        <form action={iniciarSesion} className="rounded-2xl bg-white p-6">
          <h1 className="mb-1 text-lg font-semibold">Control de marcas</h1>
          <p className="mb-5 text-sm text-neutral-500">Entra con tu cuenta del despacho.</p>
          <label className="label" htmlFor="email">Correo</label>
          <input id="email" name="email" type="email" required className="input mb-3" autoComplete="username" />
          <label className="label" htmlFor="password">Contraseña</label>
          <input id="password" name="password" type="password" required className="input mb-4" autoComplete="current-password" />
          {error && (
            <p className="mb-3 text-sm text-red-600">
              {error === "bloqueado" ? "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." : error === "inactivo" ? "Este usuario está desactivado. Habla con el administrador." : "Correo o contraseña incorrectos."}
            </p>
          )}
          <button className="btn-primario w-full justify-center py-2">Entrar</button>
        </form>
      </div>
    </main>
  );
}
