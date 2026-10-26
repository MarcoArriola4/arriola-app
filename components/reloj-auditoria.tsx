"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Hourglass } from "lucide-react";
import { asegurarTrabajador } from "@/app/actions";
import type { ProgresoAuditoria } from "@/lib/marcanet/auditoria";
import { formatoTiempo } from "./actualizar-todas";

/** Reloj de la auditoría: en proceso (con tiempo restante), terminada o con error. Se actualiza solo. */
export function RelojAuditoria({ p }: { p: ProgresoAuditoria }) {
  const router = useRouter();
  const enCurso = p.estado === "PENDIENTE" || p.estado === "BUSCANDO";
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!enCurso) return;
    void asegurarTrabajador().catch(() => {});
    const tic = setInterval(() => setAhora(Date.now()), 1000);
    const sondeo = setInterval(() => { router.refresh(); void asegurarTrabajador().catch(() => {}); }, 15000);
    return () => { clearInterval(tic); clearInterval(sondeo); };
  }, [enCurso, router]);

  const pasado = Math.max(0, (ahora - new Date(p.calculadoEn).getTime()) / 1000);
  const restante = p.restanteSeg == null ? null : Math.max(0, p.restanteSeg - pasado);

  if (p.estado === "LISTA") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-marca/30 bg-marca-claro px-4 py-3 text-sm text-marca-oscuro">
        <CheckCircle2 size={20} className="shrink-0" />
        <p><b className="font-semibold">Auditoría terminada</b> · {p.marcas} marcas encontradas · tardó {formatoTiempo(p.transcurridoSeg)}</p>
      </div>
    );
  }
  if (p.estado === "ERROR") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertTriangle size={20} className="shrink-0" />
        <p><b className="font-semibold">La auditoría no pudo terminar.</b> {p.texto}. Puedes pedirla de nuevo.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex flex-wrap items-center gap-3">
        <Hourglass size={22} className="animate-reloj shrink-0 text-amber-600" />
        <div className="min-w-[200px] flex-1">
          <p className="font-semibold">Auditoría en proceso · {p.pct}%</p>
          <p className="text-xs text-amber-800">{p.texto}{p.marcas > 0 && ` · ${p.marcas} marcas encontradas hasta ahora`}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-amber-700">Faltan aprox.</p>
          <p className="text-xl font-semibold tabular-nums">{restante == null ? "—" : formatoTiempo(restante)}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${p.pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-amber-700">Corre sola en segundo plano: puedes cerrar la app. Lleva {formatoTiempo(p.transcurridoSeg + pasado)}.</p>
    </div>
  );
}
