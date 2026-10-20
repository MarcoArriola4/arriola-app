"use client";
import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { avisarCliente, fijarPasoOficio, marcarContestada, marcarNoPago, marcarPagarSistema, regresarNotificacion, registrarPagoNotificacion } from "@/app/actions";
import { BANCOS, MEDIOS_DEFENSA } from "@/lib/catalogos";
import { PASOS_OFICIO } from "@/lib/estado-oficio";
import { siguientePlazo } from "@/lib/plazos";

/** Datos mínimos de un oficio para moverlo de paso. */
export type OficioControl = {
  id: string;
  estado: string;
  tipo: string;
  denominacion: string;
  fechaLimite: string;
  fechaLimiteRevision: string | null;
  montoCotizado: number | null;
};

const hoyISO = () => new Date().toLocaleDateString("en-CA");
const PASOS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA", "CONTESTADA"];
const CORTO: Record<string, string> = { RECIBIDA: "Recibida", AVISADO: "Avisé", EN_TRABAJO: "Pagó", PAGAR_SISTEMA: "Pagar sistema", CONTESTADA: "Contestada" };

/**
 * Botones para avanzar un oficio (avisé / pagó / trabajado / presentado). Es el mismo control en el tablero,
 * la ficha de la marca y Reportes: lo que se cambia aquí se ve igual en toda la app.
 */
export function ControlOficio({ o, conPasos = false }: { o: OficioControl; conPasos?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const negativa = o.tipo === "NEGATIVA" || o.tipo === "CONFIRMA_ACTO";

  const enviar = (fn: (f: FormData) => Promise<void>) => async (f: FormData) => {
    setEnviando(true);
    try {
      await fn(f);
      setAbierto(false);
    } finally {
      setEnviando(false);
    }
  };

  const irA = (estado: string) => {
    if (estado === o.estado) return;
    if (!confirm(`¿Mover "${o.denominacion}" a "${PASOS_OFICIO[estado]}"?`)) return;
    iniciar(() => fijarPasoOficio(o.id, estado, hoyISO()));
  };

  return (
    <div>
      {conPasos && (
        <div className="mb-2 flex flex-wrap items-center gap-1" aria-label="Paso del oficio">
          {PASOS.map((p, i) => {
            const actual = o.estado === p;
            const hecho = PASOS.indexOf(o.estado) > i;
            return (
              <button
                key={p}
                type="button"
                disabled={pendiente}
                onClick={() => irA(p)}
                title={`Mover a: ${PASOS_OFICIO[p]}`}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition ${
                  actual
                    ? p === "PAGAR_SISTEMA" ? "bg-yellow-300 text-yellow-950 ring-yellow-400" : "bg-carbon text-white ring-carbon"
                    : hecho ? "bg-marca-claro text-marca-oscuro ring-marca/30" : "bg-white text-neutral-500 ring-black/10 hover:bg-neutral-50"
                }`}
              >
                {i + 1}. {CORTO[p]}
              </button>
            );
          })}
          {(o.estado === "NO_PAGO" || o.estado === "CERRADA") && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-200">{PASOS_OFICIO[o.estado]}</span>
          )}
          {pendiente && <span className="text-[11px] text-neutral-400">Guardando…</span>}
        </div>
      )}

      {abierto && (
        <div className="mt-2 rounded-lg bg-neutral-50 p-2.5">
          {(o.estado === "RECIBIDA" || o.estado === "NO_PAGO") && (
            <form action={enviar(avisarCliente)} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <Campo label="Costo de la contestación"><input name="monto" defaultValue={o.montoCotizado ?? (negativa ? "" : "3200")} inputMode="numeric" className="input py-1.5" placeholder="3200" /></Campo>
              <Campo label="Fecha en que se avisó"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto="Guardar aviso" cancelar={() => setAbierto(false)} />
            </form>
          )}
          {o.estado === "AVISADO" && (
            <form action={enviar(registrarPagoNotificacion)} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Monto pagado"><input name="monto" defaultValue={o.montoCotizado ?? ""} inputMode="numeric" className="input py-1.5" required /></Campo>
                <Campo label="Banco">
                  <select name="banco" className="input py-1.5" defaultValue="BBVA">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select>
                </Campo>
              </div>
              <Campo label="Fecha de pago"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto="Registrar pago" cancelar={() => setAbierto(false)} />
            </form>
          )}
          {(o.estado === "EN_TRABAJO" || o.estado === "PAGAR_SISTEMA") && (
            <form action={enviar(marcarContestada)} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              {o.tipo === "NEGATIVA" && (
                <Campo label="¿Qué se presentó?">
                  <select name="medioDefensa" defaultValue={siguientePlazo(o).etiqueta === "Recurso de revisión" ? "REVISION" : "NULIDAD"} className="input py-1.5">
                    {Object.entries(MEDIOS_DEFENSA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
              )}
              <Campo label="Fecha de presentación"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto={negativa ? "Marcar presentado" : "Marcar contestada"} cancelar={() => setAbierto(false)} />
            </form>
          )}
        </div>
      )}

      {!abierto && (
        <div className="flex flex-wrap items-center gap-1.5">
          {o.estado === "RECIBIDA" && <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Avisé al cliente</button>}
          {o.estado === "AVISADO" && (
            <>
              <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Ya pagó</button>
              <form action={enviar(marcarNoPago)} onSubmit={(e) => { if (!confirm(`¿Marcar que el cliente no pagó "${o.denominacion}"? Se archivará con riesgo de abandono.`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={o.id} />
                <button className="btn px-2.5 py-1 text-xs text-neutral-500">No pagó</button>
              </form>
            </>
          )}
          {o.estado === "EN_TRABAJO" && (
            <>
              <form action={enviar(marcarPagarSistema)}>
                <input type="hidden" name="id" value={o.id} />
                <button className="rounded-lg bg-yellow-300 px-2.5 py-1 text-xs font-semibold text-yellow-950 hover:bg-yellow-400">Trabajado · pagar en sistema</button>
              </form>
              <button onClick={() => setAbierto(true)} className="btn px-2.5 py-1 text-xs">{negativa ? "Ya presentado" : "Ya presentada"}</button>
            </>
          )}
          {o.estado === "PAGAR_SISTEMA" && <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Pagado en sistema y presentado</button>}
          {o.estado === "NO_PAGO" && (
            <>
              <span className="text-xs font-medium text-red-600">No pagó</span>
              <button onClick={() => setAbierto(true)} className="btn px-2.5 py-1 text-xs">Volví a avisar</button>
            </>
          )}
          {o.estado !== "RECIBIDA" && (
            <form action={enviar(regresarNotificacion)} className="ml-auto">
              <input type="hidden" name="id" value={o.id} />
              <button title={o.estado === "NO_PAGO" || o.estado === "CERRADA" ? "Reactivar" : "Regresar un paso"} className="flex items-center gap-1 rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                <Undo2 size={13} /> {(o.estado === "NO_PAGO" || o.estado === "CERRADA") && "Reactivar"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Botones({ enviando, texto, cancelar }: { enviando: boolean; texto: string; cancelar: () => void }) {
  return (
    <div className="flex gap-2 pt-1">
      <button disabled={enviando} className="btn-primario px-2.5 py-1 text-xs">{enviando ? "Guardando…" : texto}</button>
      <button type="button" onClick={cancelar} className="btn px-2.5 py-1 text-xs">Cancelar</button>
    </div>
  );
}
