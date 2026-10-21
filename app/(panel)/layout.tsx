import Image from "next/image";
import Link from "next/link";
import { KeyRound, LogOut, UserPlus } from "lucide-react";
import { requerirSesion } from "@/lib/auth";
import { db } from "@/lib/db";
import { DIA } from "@/lib/plazos";
import { salir } from "../login/actions";
import { Nav } from "@/components/nav";
import { Buscador } from "@/components/buscador";
import { AvisoRecordatorios } from "@/components/aviso-recordatorios";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await requerirSesion();
  const esAdmin = sesion.rol === "ADMIN";
  const permisos = [...sesion.permisos];
  const ahora = new Date();
  const hoyUTC = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())); // los plazos se guardan a medianoche UTC
  // Recordatorios del bloc de notas de este usuario que ya tocan
  const recordatorios = await db.recordatorio.count({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: new Date() } } });
  const urgentes = await db.notificacion.count({
    where: {
      estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] },
      pendienteNotificar: false,
      fechaLimite: { gte: hoyUTC, lte: new Date(hoyUTC.getTime() + 7 * DIA) }, // vencen en los próximos 7 días (no las ya vencidas)
    },
  });

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-carbon text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-4 py-4 md:block md:px-5 md:py-6">
          <Link href="/"><Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-36 md:w-44" priority /></Link>
          <form action={salir} className="md:hidden">
            <button className="text-white/60 hover:text-white" aria-label="Salir"><LogOut size={18} /></button>
          </form>
        </div>
        <Nav urgentes={urgentes} esAdmin={esAdmin} permisos={permisos} recordatorios={recordatorios} />
        <div className="mt-auto hidden border-t border-white/10 px-5 py-4 md:block">
          <p className="truncate text-sm text-white/90">{sesion.nombre}</p>
          <p className="truncate text-xs text-white/40">{esAdmin ? "Administrador" : "Usuario"}</p>
          <div className="mt-2 flex gap-3">
            <Link href="/cuenta" className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white"><KeyRound size={13} /> Mi cuenta</Link>
            <form action={salir}>
              <button className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white"><LogOut size={13} /> Salir</button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-black/5 bg-[#f6f6f3]/90 px-4 py-3 backdrop-blur md:px-8">
          <Buscador />
          {sesion.permisos.has("altas") && (
            <Link href="/admin/alta" className="btn-primario ml-auto shrink-0 py-2"><UserPlus size={15} /> <span className="hidden sm:inline">Nuevo cliente / servicio</span></Link>
          )}
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
        <AvisoRecordatorios />
      </div>
    </div>
  );
}
