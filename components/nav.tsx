"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, FileBarChart, FileDown, Home, KeyRound, LogOut, Menu, NotebookPen, Sheet, ShieldCheck, Users, Wallet, X } from "lucide-react";

type Item = { href: string; label: string; icon: typeof Home };

/**
 * Menú de la app. En computadora: barra lateral fija, agrupada por secciones.
 * En teléfono: barra superior con botón que abre el menú completo (sin desplazarse de lado).
 */
export function Nav({
  urgentes, esAdmin, permisos, recordatorios, nombre, salir,
}: { urgentes: number; esAdmin: boolean; permisos: string[]; recordatorios: number; nombre: string; salir: () => Promise<void> }) {
  const path = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [path]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [abierto]);

  const grupos: { titulo: string; items: Item[] }[] = [
    {
      titulo: "Día a día",
      items: [
        { href: "/", label: "Inicio", icon: Home },
        { href: "/notificaciones", label: "Notificaciones", icon: Bell },
        { href: "/contrataciones", label: "Contrataciones", icon: Sheet },
        { href: "/vencimientos", label: "Vencimientos", icon: CalendarClock },
      ],
    },
    {
      titulo: "Clientes",
      items: [
        { href: "/clientes", label: "Clientes y marcas", icon: Users },
        ...(permisos.includes("ver_pagos") ? [{ href: "/pagos", label: "Pagos", icon: Wallet }] : []),
      ],
    },
    {
      titulo: "Herramientas",
      items: [
        { href: "/reportes", label: "Reportes", icon: FileBarChart },
        { href: "/notas", label: "Mis notas", icon: NotebookPen },
        ...(permisos.includes("exportar") ? [{ href: "/exportar", label: "Exportar Excel", icon: FileDown }] : []),
        ...(esAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
      ],
    },
  ];
  const activoEn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || (href === "/clientes" && path.startsWith("/expedientes")));
  const iniciales = nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  const lista = (
    <nav aria-label="Secciones" className="flex flex-col gap-5 px-3">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{g.titulo}</p>
          <ul className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon }) => {
              const activo = activoEn(href);
              const numero = href === "/notificaciones" ? urgentes : href === "/notas" ? recordatorios : 0;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={activo ? "page" : undefined}
                    className={`group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] transition duration-150 ${
                      activo ? "bg-white/[0.08] font-medium text-white" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
                    }`}
                  >
                    {activo && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-marca" aria-hidden />}
                    <Icon size={18} strokeWidth={activo ? 2.1 : 1.8} className={activo ? "text-marca" : "text-white/50 group-hover:text-white/80"} aria-hidden />
                    {label}
                    {numero > 0 && (
                      <span
                        data-numerito={href === "/notificaciones" ? "notificaciones" : undefined}
                        title={href === "/notificaciones" ? "Notificaciones nuevas sin ver" : "Recordatorios pendientes"}
                        className={`cifra ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${href === "/notificaciones" ? "bg-red-500 text-white" : "bg-amber-400 text-carbon"}`}
                      >
                        {numero}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const usuario = (
    <div className="border-t border-white/10 px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca text-xs font-bold text-carbon" aria-hidden>{iniciales}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white/90">{nombre}</p>
          <p className="text-xs text-white/40">{esAdmin ? "Administrador" : "Usuario"}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Link href="/cuenta" className="inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-white/[0.06] px-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"><KeyRound size={13} aria-hidden /> Mi cuenta</Link>
        <form action={salir} className="flex-1">
          <button className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-white/[0.06] px-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"><LogOut size={13} aria-hidden /> Salir</button>
        </form>
      </div>
    </div>
  );

  const logo = (
    <Link href="/" aria-label="Inicio · Arriola Abogados">
      <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-32 md:w-40" priority />
    </Link>
  );

  return (
    <>
      {/* Computadora */}
      <aside className="hidden bg-carbon text-white print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col">
        <div className="px-6 pb-6 pt-7">{logo}</div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{lista}</div>
        {usuario}
      </aside>

      {/* Teléfono */}
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between bg-carbon px-4 text-white print:hidden md:hidden">
        {logo}
        <button onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto} className="relative flex h-11 w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10">
          <Menu size={22} aria-hidden />
          {urgentes + recordatorios > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-carbon" aria-hidden />}
        </button>
      </div>
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button className="absolute inset-0 bg-black/50" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <div className="animate-aparecer absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-carbon text-white shadow-flotante">
            <div className="flex items-center justify-between px-5 py-4">
              {logo}
              <button onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="flex h-11 w-11 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"><X size={22} aria-hidden /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-2">{lista}</div>
            {usuario}
          </div>
        </div>
      )}
    </>
  );
}
