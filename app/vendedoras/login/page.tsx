import Image from "next/image";
import { PhoneCall } from "lucide-react";
import { entrarVendedora } from "../actions";

export const metadata = { title: "Panel Vendedoras · Entrar" };

export default async function LoginVendedoras({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-fondo px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 rounded-2xl bg-carbon p-5">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="mx-auto w-48" priority />
        </div>
        <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-marca-claro px-2.5 py-0.5 text-xs font-semibold text-marca-oscuro"><PhoneCall size={12} aria-hidden /> Panel Vendedoras</p>
        <h1 className="font-titulo text-3xl font-semibold tracking-tight text-carbon">Bienvenida</h1>
        <p className="mb-7 mt-1 text-sm text-neutral-500">Entra con tu nombre y la contraseña que te dio el gerente.</p>
        <form action={entrarVendedora} className="space-y-4">
          <div>
            <label className="label" htmlFor="nombre">Nombre</label>
            <input id="nombre" name="nombre" required autoComplete="username" placeholder="Ej. Tanya Gonzalez" className="input min-h-11" />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" inputMode="numeric" className="input min-h-11" />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error === "bloqueado" ? "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." : error === "inactiva" ? "Tu acceso está desactivado. Habla con el gerente." : "Nombre o contraseña incorrectos."}
            </p>
          )}
          <button className="btn-primario min-h-11 w-full text-[15px]">Entrar</button>
        </form>
      </div>
    </main>
  );
}
