"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Hourglass, Play, RefreshCw, Square, X } from "lucide-react";
import { asegurarTrabajador, consultarEstadoBarrido, detenerBusqueda, reanudarBusqueda, solicitarBusqueda, solicitarRevisionActivos } from "@/app/actions";
import type { EstadoBarrido } from "@/lib/marcanet/estado";

/** "1 h 23 min", "4 min 05 s", "12 s" */
export function formatoTiempo(seg: number) {
  const s = Math.max(0, Math.round(seg));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(r).padStart(2, "0")} s`;
  return `${r} s`;
}

const fecha = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

/**
 * Botón y reloj de la revisión con MARCanet. Todo corre en la revisión automática (GitHub), no en este navegador:
 * al pedirla sigue sola hasta el final aunque cierres la app o cambies de pestaña, y la app no se traba mientras tanto.
 * - modo "todas": búsqueda completa (con tache para detenerla y opción de continuar donde se quedó).
 * - modo "activos": solo las marcas con oficios en curso.
 */
export function ActualizarTodas({
  barrido: inicial,
  modo = "todas",
  esAdmin = false,
}: {
  barrido?: EstadoBarrido;
  modo?: "todas" | "activos";
  esAdmin?: boolean;
}) {
  const [b, setB] = useState(inicial);
  const [cambiando, setCambiando] = useState(false);
  const [restante, setRestante] = useState<number | null>(null);

  const ocupadoActivos = !!b && (b.activos.solicitada || !!b.activos.enCurso);
  const vivo = !!b && (modo === "todas" ? b.activo || b.solicitada : ocupadoActivos);

  // Mientras algo corre: se consulta el avance cada 30 s y el tiempo restante baja cada segundo
  useEffect(() => {
    if (!vivo) return;
    const sondeo = setInterval(async () => {
      try { setB(await consultarEstadoBarrido()); void asegurarTrabajador(); } catch {}
    }, 30000);
    return () => clearInterval(sondeo);
  }, [vivo]);
  useEffect(() => {
    if (modo !== "todas" || !b?.activo || b.restanteSeg == null) return;
    const base = b.restanteSeg;
    const desde = new Date(b.calculadoEn).getTime();
    setRestante(base);
    const tic = setInterval(() => setRestante(Math.max(0, base - (Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(tic);
  }, [b, modo]);

  const ejecutar = async (fn: () => Promise<EstadoBarrido>) => {
    setCambiando(true);
    try { setB(await fn()); } finally { setCambiando(false); }
  };

  if (!b) return null;

  // ── Solo oficios en curso ──
  if (modo === "activos") {
    if (b.activos.enCurso) {
      const { revisadas, total } = b.activos.enCurso;
      const pct = total ? Math.round((revisadas / total) * 100) : 0;
      return (
        <Caja tono="ambar" icono={<Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />} titulo={`Revisando oficios en curso · ${pct}%`} pct={pct}>
          {revisadas} de {total} marcas · sigue aunque cierres la app
        </Caja>
      );
    }
    if (b.activos.solicitada) {
      return (
        <Caja tono="ambar" icono={<Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />} titulo="Revisión de oficios en curso solicitada">
          Empieza en unos minutos (máx. ~15) y corre sola hasta el final.
        </Caja>
      );
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <button onClick={() => ejecutar(solicitarRevisionActivos)} disabled={cambiando} className="btn">
          <RefreshCw size={15} /> Revisar ahora los oficios en curso
        </button>
        {b.activos.ultima && (
          <span className="text-[11px] text-neutral-500">
            Última: {fecha(b.activos.ultima.fin)} · {b.activos.ultima.consultados} de {b.activos.ultima.total} revisadas · {b.activos.ultima.nuevos} oficios nuevos · {b.activos.ultima.contestados} contestados
            {b.activos.ultima.errores > 0 && <span className="text-red-600"> · {b.activos.ultima.errores} con error</span>} · <Link href="/reportes" className="underline">ver reporte</Link>
          </span>
        )}
      </div>
    );
  }

  // ── Búsqueda completa ──
  const pct = b.total ? Math.round((b.revisadas / b.total) * 100) : 0;

  if (b.activo) {
    return (
      <Caja
        tono="ambar"
        icono={<Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />}
        titulo={`Búsqueda completa en curso · ${pct}%`}
        pct={pct}
        accion={
          esAdmin && (
            <button
              onClick={() => { if (confirm("¿Detener la búsqueda completa?\n\nSe detiene en unos segundos. Después puedes continuarla desde donde se quedó (si no pasan más de 30 horas).")) ejecutar(detenerBusqueda); }}
              disabled={cambiando}
              title="Detener la búsqueda completa"
              aria-label="Detener la búsqueda completa"
              className="ml-1 rounded-full p-1.5 text-amber-700 hover:bg-amber-200 hover:text-black"
            >
              <X size={18} />
            </button>
          )
        }
      >
        {b.revisadas.toLocaleString("es-MX")} de {b.total.toLocaleString("es-MX")} marcas · faltan aprox. <b>{formatoTiempo(restante ?? b.restanteSeg ?? 0)}</b>
        {b.errores > 0 && <span className="text-red-600"> · {b.errores} con error</span>} · sigue aunque cierres la app
      </Caja>
    );
  }

  if (b.solicitada) {
    return (
      <Caja tono="ambar" icono={<Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />} titulo="Búsqueda completa solicitada">
        {b.pausada ? "Continúa desde donde se quedó" : "Empieza"} en unos minutos (máx. ~15) y corre sola hasta el final, aunque cierres la app.
      </Caja>
    );
  }

  if (b.pausada) {
    const horas = b.pausadaEn ? (Date.now() - new Date(b.pausadaEn).getTime()) / 3600000 : 99;
    return (
      <Caja tono="gris" icono={<Square size={18} className="shrink-0 text-neutral-500" />} titulo={`Búsqueda completa detenida · ${pct}%`} pct={pct}
        accion={
          <button onClick={() => ejecutar(solicitarBusqueda)} disabled={cambiando} className="btn-primario ml-2">
            <Play size={14} /> {horas <= 30 ? "Continuar desde donde se quedó" : "Empezar de nuevo"}
          </button>
        }
      >
        {b.revisadas.toLocaleString("es-MX")} de {b.total.toLocaleString("es-MX")} marcas revisadas
        {b.errores > 0 && <span className="text-red-600"> · {b.errores} con error</span>}
        {b.pausadaEn && ` · detenida el ${fecha(b.pausadaEn)}`}
        {esAdmin && <button onClick={() => ejecutar(reanudarBusqueda)} disabled={cambiando} className="ml-2 underline">o dejar que siga sola</button>}
      </Caja>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {inicial?.activo || inicial?.solicitada ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-marca-claro px-3 py-1.5 text-sm font-semibold text-marca-oscuro"><CheckCircle2 size={16} /> Listo · búsqueda completa terminada</span>
        ) : null}
        <button onClick={() => { if (confirm("¿Empezar una búsqueda completa con MARCanet?\n\nCorre sola en segundo plano hasta el final (varias horas), aunque cierres la app.")) ejecutar(solicitarBusqueda); }} disabled={cambiando} className="btn-primario">
          <RefreshCw size={15} /> Actualizar todas desde MARCanet
        </button>
      </div>
      {b.termino && (
        <p className="text-xs text-neutral-500">
          Última búsqueda completa: <b className="font-medium text-neutral-700">terminó el {fecha(b.termino)}</b>
          {" · "}{b.revisadas.toLocaleString("es-MX")} de {b.total.toLocaleString("es-MX")} revisadas
          {b.errores > 0 ? <span className="text-red-600"> · {b.errores} con error</span> : " · sin errores"}
          {b.faltaron > 0 && <span className="text-amber-700"> · {b.faltaron} sin revisar</span>}
          {b.proximo && ` · la próxima empieza sola el ${new Date(b.proximo).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`}
          {" · "}<Link href="/reportes" className="underline">ver reporte</Link>
        </p>
      )}
    </div>
  );
}

function Caja({ tono, icono, titulo, pct, accion, children }: { tono: "ambar" | "gris"; icono: React.ReactNode; titulo: string; pct?: number; accion?: React.ReactNode; children: React.ReactNode }) {
  const c = tono === "ambar" ? { caja: "border-amber-200 bg-amber-50", t: "text-amber-900", s: "text-amber-800", barra: "bg-amber-200", lleno: "bg-amber-500" } : { caja: "border-neutral-300 bg-neutral-50", t: "text-neutral-800", s: "text-neutral-500", barra: "bg-neutral-200", lleno: "bg-neutral-500" };
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-sm ${c.caja}`}>
      {icono}
      <div className="min-w-[200px] flex-1">
        <p className={`font-semibold ${c.t}`}>{titulo}</p>
        {pct != null && (
          <div className={`my-1 h-1.5 overflow-hidden rounded-full ${c.barra}`}>
            <div className={`h-full rounded-full transition-all ${c.lleno}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className={`text-xs ${c.s}`}>{children}</p>
      </div>
      {accion}
    </div>
  );
}
