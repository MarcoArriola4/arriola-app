"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Hourglass, Play, RefreshCw, Square, X } from "lucide-react";
import { actualizarUnaMarcanet, consultarEstadoBarrido, detenerBusqueda, listaParaActualizar, reanudarBusqueda, registrarCorridaManual, type ResultadoUna } from "@/app/actions";
import type { EstadoBarrido } from "@/lib/marcanet/estado";

const ESPERA_CUOTA_S = 10 * 60 + 30; // MARCanet pide esperar 10 minutos al llegar a su límite
const SEG_POR_MARCA_INICIAL = 28; // promedio real medido (incluye las pausas obligatorias de MARCanet)

type Estado = "inactivo" | "corriendo" | "esperando" | "terminado";

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

/**
 * Botón "Actualizar todas desde MARCanet".
 * - Si la búsqueda completa de cada 7 días está corriendo, muestra su avance con reloj de arena y tiempo restante.
 * - Si no, revisa todas las marcas una por una mientras la página esté abierta y termina en "Listo".
 */
export function ActualizarTodas({
  barrido: barridoInicial,
  modo = "todas",
  esAdmin = false,
  etiqueta,
}: {
  barrido?: EstadoBarrido;
  /** "activos" = solo las marcas con oficios en curso */
  modo?: "todas" | "activos";
  esAdmin?: boolean;
  etiqueta?: string;
}) {
  const [barrido, setBarrido] = useState(barridoInicial);
  const [continua, setContinua] = useState(0);
  const [cambiando, setCambiando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("inactivo");
  const [avance, setAvance] = useState({ i: 0, total: 0, nuevos: 0, contestados: 0, errores: 0 });
  const [restante, setRestante] = useState<number | null>(null);
  const [espera, setEspera] = useState(0);
  const [nuevas, setNuevas] = useState<ResultadoUna["nuevasDetalle"]>([]);
  const detener = useRef(false);

  // Búsqueda automática en curso: cuenta regresiva cada segundo y se actualiza con el servidor cada minuto
  useEffect(() => {
    if (!barrido?.activo || estado !== "inactivo") return;
    const base = barrido.restanteSeg ?? 0;
    const desde = new Date(barrido.calculadoEn).getTime();
    const tic = setInterval(() => setRestante(Math.max(0, base - (Date.now() - desde) / 1000)), 1000);
    const sondeo = setInterval(async () => setBarrido(await consultarEstadoBarrido()), 60000);
    return () => { clearInterval(tic); clearInterval(sondeo); };
  }, [barrido, estado]);

  // Cuenta regresiva de la búsqueda manual
  useEffect(() => {
    if (estado !== "corriendo" && estado !== "esperando") return;
    const tic = setInterval(() => setRestante((r) => (r == null ? r : Math.max(0, r - 1))), 1000);
    return () => clearInterval(tic);
  }, [estado]);

  async function iniciar() {
    setAbierto(true);
    setEstado("corriendo");
    detener.current = false;
    setNuevas([]);
    const inicio = new Date();
    const { ids, continua: sigue, yaRevisadas } = await listaParaActualizar(modo);
    setContinua(sigue ? yaRevisadas : 0);
    const t = { i: 0, total: ids.length, nuevos: 0, contestados: 0, errores: 0 };
    setAvance({ ...t });
    setRestante(ids.length * SEG_POR_MARCA_INICIAL);

    let fallasSeguidas = 0;
    while (t.i < ids.length && !detener.current) {
      let r: ResultadoUna;
      try {
        r = await actualizarUnaMarcanet(ids[t.i]);
        fallasSeguidas = 0;
      } catch {
        // Falla de conexión o tiempo agotado: se espera un poco y se reintenta la misma marca (máx. 3 veces)
        fallasSeguidas++;
        if (fallasSeguidas <= 3) {
          await new Promise((ok) => setTimeout(ok, 5000 * fallasSeguidas));
          continue;
        }
        fallasSeguidas = 0;
        r = { ok: false, nuevos: 0, contestados: 0, nuevasDetalle: [], mensaje: "Sin conexión" };
      }
      if (r.cuota) {
        // Se respeta la pausa que pide el IMPI y se reintenta la misma marca
        setEstado("esperando");
        for (let s = ESPERA_CUOTA_S; s > 0 && !detener.current; s--) {
          setEspera(s);
          await new Promise((ok) => setTimeout(ok, 1000));
        }
        setEstado("corriendo");
        continue;
      }
      t.i++;
      t.nuevos += r.nuevos;
      t.contestados += r.contestados;
      if (!r.ok) t.errores++;
      if (r.nuevasDetalle.length) setNuevas((n) => [...n, ...r.nuevasDetalle]);
      setAvance({ ...t });
      // Tiempo restante según la velocidad real de esta búsqueda
      const porMarca = t.i >= 5 ? (Date.now() - inicio.getTime()) / 1000 / t.i : SEG_POR_MARCA_INICIAL;
      setRestante((ids.length - t.i) * porMarca);
    }
    await registrarCorridaManual({
      total: t.total,
      consultados: t.i - t.errores,
      errores: t.errores,
      nuevos: t.nuevos,
      contestados: t.contestados,
      inicio: inicio.toISOString(),
      mensaje: detener.current ? `Detenida a mano en ${t.i}/${t.total}` : undefined,
      modo,
    });
    if (modo === "todas") setBarrido(await consultarEstadoBarrido());
    setRestante(0);
    setEstado("terminado");
  }

  const ocupado = estado === "corriendo" || estado === "esperando";

  const pausar = async () => {
    if (!confirm("¿Detener la búsqueda completa automática?\n\nSe detiene en unos segundos. Después puedes continuarla aquí desde donde se quedó (si no han pasado más de 30 horas) o reanudarla automática.")) return;
    setCambiando(true);
    setBarrido(await detenerBusqueda());
    setCambiando(false);
  };
  const reanudar = async () => {
    setCambiando(true);
    setBarrido(await reanudarBusqueda());
    setCambiando(false);
  };

  // ── Búsqueda automática detenida por el admin ──
  if (modo === "todas" && barrido?.pausada && estado === "inactivo") {
    const pct = barrido.total ? Math.round((barrido.revisadas / barrido.total) * 100) : 0;
    const horas = barrido.pausadaEn ? (Date.now() - new Date(barrido.pausadaEn).getTime()) / 3600000 : 99;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
        <Square size={18} className="shrink-0 text-neutral-500" />
        <div className="min-w-[200px]">
          <p className="font-semibold text-neutral-800">Búsqueda completa detenida · {pct}%</p>
          <p className="text-xs text-neutral-500">
            {barrido.revisadas.toLocaleString("es-MX")} de {barrido.total.toLocaleString("es-MX")} marcas revisadas
            {barrido.errores > 0 && <span className="text-red-600"> · {barrido.errores} con error</span>}
            {barrido.pausadaEn && ` · detenida ${new Date(barrido.pausadaEn).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}`}
          </p>
        </div>
        <button onClick={iniciar} className="btn-primario"><Play size={14} /> {horas <= 30 ? "Continuar aquí desde donde se quedó" : "Revisar todas aquí"}</button>
        {esAdmin && <button onClick={reanudar} disabled={cambiando} className="btn">Reanudar automática</button>}
      </div>
    );
  }

  // ── Búsqueda automática de cada 7 días en curso ──
  if (modo === "todas" && barrido?.activo && estado === "inactivo") {
    const pct = barrido.total ? Math.round((barrido.revisadas / barrido.total) * 100) : 0;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
        <Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />
        <div className="min-w-[200px]">
          <p className="font-semibold text-amber-900">Búsqueda completa en curso · {pct}%</p>
          <div className="my-1 h-1.5 overflow-hidden rounded-full bg-amber-200">
            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-amber-800">
            {barrido.revisadas.toLocaleString("es-MX")} de {barrido.total.toLocaleString("es-MX")} marcas · faltan aprox. <b>{formatoTiempo(restante ?? barrido.restanteSeg ?? 0)}</b>
            {barrido.errores > 0 && <span className="text-red-600"> · {barrido.errores} con error</span>}
          </p>
        </div>
        {esAdmin && (
          <button onClick={pausar} disabled={cambiando} title="Detener la búsqueda completa" aria-label="Detener la búsqueda completa" className="ml-1 rounded-full p-1.5 text-amber-700 hover:bg-amber-200 hover:text-black">
            <X size={18} />
          </button>
        )}
      </div>
    );
  }
  if (modo === "todas" && barridoInicial?.activo && barrido && !barrido.activo && !barrido.pausada && estado === "inactivo") {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl bg-marca-claro px-3 py-2 text-sm font-semibold text-marca-oscuro">
        <CheckCircle2 size={18} /> Listo · búsqueda completa terminada
      </span>
    );
  }

  const pct = avance.total ? Math.round((avance.i / avance.total) * 100) : 0;
  return (
    <>
      {estado === "terminado" ? (
        <button onClick={iniciar} className="inline-flex items-center gap-2 rounded-lg bg-marca px-3 py-1.5 text-sm font-semibold text-carbon">
          <CheckCircle2 size={16} /> Listo · actualizar de nuevo
        </button>
      ) : (
        <button onClick={iniciar} disabled={ocupado} className="btn-primario">
          {ocupado ? <Hourglass size={15} className="animate-reloj" /> : <RefreshCw size={15} />}
          {ocupado ? `Actualizando… ${restante != null ? formatoTiempo(restante) : ""}` : etiqueta ?? (modo === "activos" ? "Revisar ahora los oficios en curso" : "Actualizar todas desde MARCanet")}
        </button>
      )}
      {/* Resultado de la última búsqueda completa: cuándo terminó y si hubo errores o faltaron marcas */}
      {modo === "todas" && barrido?.termino && !barrido.activo && !barrido.pausada && estado === "inactivo" && (
        <p className="basis-full text-xs text-neutral-500">
          Última búsqueda completa: <b className="font-medium text-neutral-700">terminó el {new Date(barrido.termino).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</b>
          {" · "}{barrido.revisadas.toLocaleString("es-MX")} de {barrido.total.toLocaleString("es-MX")} revisadas
          {barrido.errores > 0 ? <span className="text-red-600"> · {barrido.errores} con error</span> : " · sin errores"}
          {barrido.faltaron > 0 && <span className="text-amber-700"> · {barrido.faltaron} sin revisar</span>}
          {barrido.proximo && ` · la próxima empieza el ${new Date(barrido.proximo).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}`}
        </p>
      )}

      {abierto && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {estado === "terminado" ? (
                <CheckCircle2 size={34} className="shrink-0 text-marca-oscuro" />
              ) : (
                <Hourglass size={34} className={`shrink-0 animate-reloj ${estado === "esperando" ? "text-amber-500" : "text-carbon"}`} />
              )}
              <div>
                <p className="text-base font-semibold">{estado === "terminado" ? (detener.current ? "Detenida" : "¡Listo!") : "Actualizando con MARCanet"}</p>
                <p className="text-xs text-neutral-500">
                  {estado === "corriendo" && (continua ? `Continúa donde se quedó (${continua.toLocaleString("es-MX")} ya revisadas). Deja esta página abierta.` : "Deja esta página abierta.")}
                  {estado === "esperando" && `Pausa obligatoria del IMPI · continúa en ${formatoTiempo(espera)}`}
                  {estado === "terminado" && (detener.current ? "La próxima vez continúa con las que falten." : `Se revisaron ${avance.i.toLocaleString("es-MX")} marcas.`)}
                </p>
              </div>
            </div>
            {!ocupado && <button onClick={() => setAbierto(false)} className="text-neutral-400 hover:text-black" aria-label="Cerrar"><X size={16} /></button>}
          </div>

          {ocupado && (
            <div className="mb-3 rounded-xl bg-carbon px-4 py-3 text-center text-white">
              <p className="text-[11px] uppercase tracking-wide text-white/60">Tiempo aproximado restante</p>
              <p className="text-3xl font-semibold tabular-nums text-marca">{formatoTiempo(restante ?? 0)}</p>
            </div>
          )}

          <div className="mb-1 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className={`h-full rounded-full transition-all ${estado === "esperando" ? "bg-amber-400" : "bg-marca"}`} style={{ width: `${estado === "terminado" ? 100 : pct}%` }} />
          </div>
          <p className="mb-3 text-xs text-neutral-500">{avance.i.toLocaleString("es-MX")} de {avance.total.toLocaleString("es-MX")} marcas · {estado === "terminado" ? 100 : pct}%</p>

          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Dato n={avance.nuevos} t="oficios nuevos" cls="text-violet-700" />
            <Dato n={avance.contestados} t="contestados" cls="text-marca-oscuro" />
            <Dato n={avance.errores} t="con error" cls={avance.errores ? "text-red-600" : ""} />
          </div>

          {nuevas.length > 0 && (
            <div className="mb-3 max-h-36 overflow-y-auto rounded-lg bg-violet-50 p-2">
              <p className="mb-1 text-[11px] font-semibold uppercase text-violet-700">Notificaciones nuevas</p>
              {nuevas.map((n) => (
                <Link key={n.expedienteId} href={`/clientes/${n.clienteId}?marca=${n.expedienteId}`} className="block truncate text-xs text-violet-900 hover:underline">• {n.denominacion}</Link>
              ))}
            </div>
          )}

          <div className="flex justify-between gap-2">
            {ocupado ? (
              <button onClick={() => { detener.current = true; }} className="btn text-xs"><Square size={12} /> Detener</button>
            ) : (
              <Link href="/reportes" className="btn text-xs">Ver reporte →</Link>
            )}
            <p className="self-center text-[11px] text-neutral-400">{modo === "activos" ? "Solo marcas con oficios en curso" : "Primero las marcas con oficios en curso"}</p>
          </div>
        </div>
      )}
    </>
  );
}

function Dato({ n, t, cls = "" }: { n: number; t: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 py-1.5">
      <p className={`text-lg font-semibold ${cls}`}>{n}</p>
      <p className="text-[10px] text-neutral-500">{t}</p>
    </div>
  );
}
