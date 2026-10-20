"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { RefreshCw, Square, X } from "lucide-react";
import { actualizarUnaMarcanet, listaParaActualizar, registrarCorridaManual, type ResultadoUna } from "@/app/actions";

const ESPERA_CUOTA_S = 10 * 60 + 30; // MARCanet pide esperar 10 minutos al llegar a su límite

type Estado = "inactivo" | "corriendo" | "esperando" | "terminado";

/** Revisa en MARCanet todas las marcas, una por una, mientras la página esté abierta. */
export function ActualizarTodas() {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("inactivo");
  const [avance, setAvance] = useState({ i: 0, total: 0, nuevos: 0, contestados: 0, errores: 0 });
  const [espera, setEspera] = useState(0);
  const [nuevas, setNuevas] = useState<ResultadoUna["nuevasDetalle"]>([]);
  const detener = useRef(false);

  async function iniciar() {
    setAbierto(true);
    setEstado("corriendo");
    detener.current = false;
    setNuevas([]);
    const ids = await listaParaActualizar();
    const t = { i: 0, total: ids.length, nuevos: 0, contestados: 0, errores: 0 };
    setAvance({ ...t });

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
    }
    await registrarCorridaManual({
      total: t.total,
      consultados: t.i - t.errores,
      errores: t.errores,
      nuevos: t.nuevos,
      contestados: t.contestados,
      mensaje: detener.current ? `Detenida a mano en ${t.i}/${t.total}` : undefined,
    });
    setEstado("terminado");
  }

  const pct = avance.total ? Math.round((avance.i / avance.total) * 100) : 0;
  const ocupado = estado === "corriendo" || estado === "esperando";

  return (
    <>
      <button onClick={iniciar} disabled={ocupado} className="btn-primario">
        <RefreshCw size={15} className={ocupado ? "animate-spin" : ""} /> {ocupado ? "Actualizando…" : "Actualizar todas desde MARCanet"}
      </button>

      {abierto && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Actualización con MARCanet</p>
              <p className="text-xs text-neutral-500">
                {estado === "corriendo" && "Consultando marca por marca… deja esta página abierta."}
                {estado === "esperando" && `El IMPI pidió una pausa por su límite de consultas. Continúa en ${Math.floor(espera / 60)}:${String(espera % 60).padStart(2, "0")}.`}
                {estado === "terminado" && (detener.current ? "Detenida. La próxima vez continúa con las que falten." : "Terminado.")}
              </p>
            </div>
            {!ocupado && <button onClick={() => setAbierto(false)} className="text-neutral-400 hover:text-black" aria-label="Cerrar"><X size={16} /></button>}
          </div>

          <div className="mb-1 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div className={`h-full rounded-full transition-all ${estado === "esperando" ? "bg-amber-400" : "bg-marca"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mb-3 text-xs text-neutral-500">{avance.i.toLocaleString("es-MX")} de {avance.total.toLocaleString("es-MX")} marcas · {pct}%</p>

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
              <Link href="/notificaciones" className="btn text-xs">Ver notificaciones →</Link>
            )}
            <p className="self-center text-[11px] text-neutral-400">Primero las marcas con oficios en curso</p>
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
