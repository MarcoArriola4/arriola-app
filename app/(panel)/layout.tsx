import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requerirSesion } from "@/lib/auth";
import { db } from "@/lib/db";
import { salir } from "../login/actions";
import { Nav } from "@/components/nav";
import { Buscador } from "@/components/buscador";
import { AvisoRecordatorios } from "@/components/aviso-recordatorios";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  const esAdmin = sesion.rol === "ADMIN";
  const permisos = [...sesion.permisos];
  // Recordatorios del bloc de notas de este usuario que ya tocan
  const recordatorios = await db.recordatorio.count({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: new Date() } } });
  // Numerito de Notificaciones: oficios en curso que llegaron después de la última vez que este usuario abrió Notificaciones
  const vistas = (await db.usuario.findUnique({ where: { id: sesion.id }, select: { notifVistasHasta: true } }))?.notifVistasHasta;
  const urgentes = await db.notificacion.count({
    // Los de contestaciones ya vendidas no cuentan: ya se sabe de ellos
    where: { estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] }, servicio: { is: null }, creado: { gt: vistas ?? new Date(Date.now() - 30 * 864e5) } },
  });

  return (
    <div className="min-h-screen md:flex">
      <Nav urgentes={urgentes} esAdmin={esAdmin} permisos={permisos} recordatorios={recordatorios} nombre={sesion.nombre} salir={salir} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-16 z-30 flex items-center gap-3 border-b border-linea bg-fondo/85 px-4 py-3 backdrop-blur-md print:hidden md:top-0 md:px-8">
          <Buscador />
          {sesion.permisos.has("altas") && (
            <Link href="/admin/alta" className="btn-primario ml-auto min-h-10 shrink-0" aria-label="Nuevo cliente o servicio"><UserPlus size={16} aria-hidden /> <span className="hidden sm:inline">Nuevo cliente / servicio</span></Link>
          )}
        </header>
        <main className="animate-aparecer mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8 print:p-0">{children}</main>
        <AvisoRecordatorios />
      </div>
    </div>
  );
}
