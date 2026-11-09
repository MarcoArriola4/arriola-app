import Image from "next/image";
import { Bell, CalendarClock, ShieldCheck } from "lucide-react";
import { iniciarSesion } from "./actions";

export const metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen bg-fondo lg:grid-cols-[1.1fr_1fr]">
      {/* Marca (computadora) */}
      <section className="relative hidden overflow-hidden bg-carbon p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-marca/10 blur-3xl" aria-hidden />
        <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-56" priority />
        <div className="relative max-w-md">
          <h2 className="font-titulo text-[2.6rem] font-semibold leading-[1.1] tracking-tight">El control de tus marcas, en un solo lugar.</h2>
          <ul className="mt-8 space-y-4 text-[15px] text-white/70">
            <li className="flex items-center gap-3"><Bell size={18} className="text-marca" aria-hidden /> Oficios del IMPI detectados en MARCanet</li>
            <li className="flex items-center gap-3"><CalendarClock size={18} className="text-marca" aria-hidden /> Plazos, declaraciones de uso y renovaciones</li>
            <li className="flex items-center gap-3"><ShieldCheck size={18} className="text-marca" aria-hidden /> Contrataciones, pagos y seguimiento de clientes</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/35">Arriola Abogados · Propiedad intelectual</p>
      </section>

      {/* Formulario */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 rounded-2xl bg-carbon p-5 lg:hidden">
            <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="mx-auto w-52" priority />
          </div>
          <h1 className="font-titulo text-3xl font-semibold tracking-tight text-carbon">Bienvenido</h1>
          <p className="mb-7 mt-1 text-sm text-neutral-500">Entra con tu cuenta del despacho.</p>
          <form action={iniciarSesion} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Correo</label>
              <input id="email" name="email" type="email" required className="input min-h-11" autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="password">Contraseña</label>
              <input id="password" name="password" type="password" required className="input min-h-11" autoComplete="current-password" />
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error === "bloqueado" ? "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo." : error === "inactivo" ? "Este usuario está desactivado. Habla con el administrador." : "Correo o contraseña incorrectos."}
              </p>
            )}
            <button className="btn-primario min-h-11 w-full text-[15px]">Entrar</button>
          </form>
        </div>
      </section>
    </main>
  );
}
