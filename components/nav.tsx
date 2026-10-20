"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CalendarClock, FileBarChart, FileDown, Home, Sheet, ShieldCheck, Users, Wallet } from "lucide-react";

export function Nav({ urgentes, esAdmin }: { urgentes: number; esAdmin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Inicio", icon: Home },
    { href: "/notificaciones", label: "Notificaciones", icon: Bell },
    { href: "/contrataciones", label: "Contrataciones", icon: Sheet },
    { href: "/clientes", label: "Clientes y marcas", icon: Users },
    { href: "/pagos", label: "Pagos", icon: Wallet },
    { href: "/vencimientos", label: "Vencimientos", icon: CalendarClock },
    { href: "/reportes", label: "Reportes", icon: FileBarChart },
    ...(esAdmin ? [{ href: "/exportar", label: "Exportar Excel", icon: FileDown }, { href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:px-3 md:pb-0">
      {items.map(({ href, label, icon: Icon }) => {
        const activo = href === "/" ? path === "/" : path.startsWith(href) || (href === "/clientes" && path.startsWith("/expedientes"));
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition ${
              activo ? "bg-marca font-medium text-carbon" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} strokeWidth={activo ? 2.2 : 1.8} />
            {label}
            {href === "/notificaciones" && urgentes > 0 && (
              <span className={`ml-auto rounded-full px-1.5 text-[11px] font-semibold ${activo ? "bg-carbon text-marca" : "bg-red-500 text-white"}`}>{urgentes}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
