"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Hourglass, PauseCircle, Play, RotateCcw, X } from "lucide-react";
import { asegurarTrabajador, detenerAuditoria, reactivarAuditoria } from "@/app/actions";
import type { ProgresoAuditoria } from "@/lib/marcanet/auditoria";
import { formatoTiempo } from "./actualizar-todas";

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

/** Reloj de la auditoría: en proceso (con tiempo restante y ✕ para detenerla), detenida, terminada o con error. Se actualiza solo. */
export function RelojAuditoria({ p }: { p: ProgresoAuditoria }) {
  const router = useRouter();
  const enCurso = p.estado === "PENDIENTE" || p.estado === "BUSCANDO";
  const [ahora, setAhora] = useState(() => Date.now());
  const [cambiando, iniciar] = useTransition();

  const detener = () => {
    if (!confirm("¿Detener la auditoría?\n\nLo que ya encontró queda guardado. Si la vuelves a activar antes de 12 horas, sigue desde donde se quedó; después de 12 horas empieza desde cero.")) return;
    iniciar(async () => { await detenerAuditoria(p.id); router.refresh(); });
  };
  const reactivar = (mensaje: string) => {
    if (!confirm(mensaje)) return;
    iniciar(async () => {
      const id = await reactivarAuditoria(p.id);
      if (id === p.id) router.refresh();
      else router.push(`/auditorias/${id}`);
    });
  };

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
        <p className="flex-1"><b className="font-semibold">Auditoría terminada</b> · {p.marcas} marcas encontradas · tardó {formatoTiempo(p.transcurridoSeg)}</p>
        <button disabled={cambiando} onClick={() => reactivar("¿Hacer esta auditoría otra vez?\n\nSe hace una nueva desde cero con los mismos nombres. Este reporte se conserva en las auditorías anteriores.")} className="btn shrink-0 print:hidden">
          <RotateCcw size={14} /> Hacer de nuevo
        </button>
      </div>
    );
  }
  if (p.estado === "ERROR") {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <AlertTriangle size={20} className="shrink-0" />
        <p className="min-w-[200px] flex-1"><b className="font-semibold">La auditoría no pudo terminar.</b> {p.texto}.</p>
        <button disabled={cambiando} onClick={() => reactivar("¿Volver a intentar la auditoría?\n\nEmpieza desde cero.")} className="btn shrink-0">
          <RotateCcw size={14} /> Intentar de nuevo
        </button>
      </div>
    );
  }
  if (p.estado === "DETENIDA") {
    const vigente = p.reanudarHasta != null && new Date(p.reanudarHasta).getTime() > ahora;
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
        <div className="flex flex-wrap items-center gap-3">
          <PauseCircle size={22} className="shrink-0 text-neutral-500" />
          <div className="min-w-[200px] flex-1">
            <p className="font-semibold">Auditoría detenida · {p.pct}%{p.marcas > 0 && ` · ${p.marcas} marcas encontradas`}</p>
            <p className="text-xs text-neutral-500">
              {vigente
                ? `Si la vuelves a activar antes del ${fechaHora(p.reanudarHasta!)}, sigue desde donde se quedó.`
                : "Pasaron más de 12 horas desde que se detuvo: al activarla empieza desde cero."}
            </p>
          </div>
          {vigente ? (
            <button disabled={cambiando} onClick={() => reactivar("¿Reanudar la auditoría?\n\nSigue desde donde se quedó.")} className="btn-primario shrink-0">
              <Play size={14} /> Reanudar
            </button>
          ) : (
            <button disabled={cambiando} onClick={() => reactivar("¿Activar la auditoría?\n\nPasaron más de 12 horas: empieza desde cero.")} className="btn-primario shrink-0">
              <RotateCcw size={14} /> Empezar de nuevo
            </button>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <div className="h-full rounded-full bg-neutral-400" style={{ width: `${p.pct}%` }} />
        </div>
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
        <button disabled={cambiando} onClick={detener} title="Detener la auditoría" aria-label="Detener la auditoría" className="grid size-9 shrink-0 place-items-center rounded-full border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 disabled:opacity-50">
          <X size={18} />
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-200">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${p.pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-amber-700">Corre sola en segundo plano: puedes cerrar la app. Con la ✕ la detienes. Lleva {formatoTiempo(p.transcurridoSeg + pasado)}.</p>
    </div>
  );
}
