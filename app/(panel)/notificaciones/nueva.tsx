"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { buscarExpedientes, crearNotificacion, previsualizarPlazos } from "@/app/actions";
import { TIPOS_OFICIO, fmtFecha } from "@/lib/catalogos";

type Resultado = Awaited<ReturnType<typeof buscarExpedientes>>[number];

export function NuevaNotificacion({ abiertoInicial = false, expediente }: { abiertoInicial?: boolean; expediente?: { id: string; denominacion: string; numeroExpediente: string | null } }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn-primario">+ Registrar notificación</button>
      {abierto && <Modal cerrar={() => setAbierto(false)} expediente={expediente} />}
    </>
  );
}

function Modal({ cerrar, expediente }: { cerrar: () => void; expediente?: { id: string; denominacion: string; numeroExpediente: string | null } }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [elegido, setElegido] = useState<{ id: string; denominacion: string; numeroExpediente: string | null } | null>(expediente ?? null);
  const [tipo, setTipo] = useState("ANTERIORIDAD");
  const [fNotif, setFNotif] = useState(new Date().toLocaleDateString("en-CA"));
  const [fLimite, setFLimite] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (elegido || q.trim().length < 2) return setResultados([]);
    const h = setTimeout(() => buscarExpedientes(q).then(setResultados), 250);
    return () => clearTimeout(h);
  }, [q, elegido]);

  const [calculado, setCalculado] = useState<{ fechaLimite: string; fechaLimiteRevision: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    previsualizarPlazos(tipo, fNotif).then((r) => vivo && setCalculado(r));
    return () => { vivo = false; };
  }, [tipo, fNotif]);
  const limiteCalculado = calculado?.fechaLimite ?? null;

  async function guardar(f: FormData) {
    if (!elegido) return setError("Elige la marca a la que llegó el oficio.");
    setEnviando(true);
    try {
      await crearNotificacion(f);
      cerrar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-16" onClick={cerrar}>
      <form action={guardar} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva notificación del IMPI</h2>
          <button type="button" onClick={cerrar} className="text-neutral-400 hover:text-black" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <span className="label">Marca / expediente</span>
        {elegido ? (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-marca/40 bg-marca-claro px-3 py-2 text-sm">
            <span><b>{elegido.denominacion}</b> <span className="text-neutral-500">· {elegido.numeroExpediente ?? "s/n"}</span></span>
            {!expediente && <button type="button" onClick={() => { setElegido(null); setQ(""); }} className="text-xs text-neutral-500 hover:text-black">Cambiar</button>}
            <input type="hidden" name="expedienteId" value={elegido.id} />
          </div>
        ) : (
          <div className="relative mb-3">
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setError(""); }} placeholder="Escribe marca, cliente o número de expediente" className="input" />
            {resultados.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-black/10 bg-white shadow-lg">
                {resultados.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setElegido(r)} className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50">
                      <b>{r.denominacion}</b> <span className="text-neutral-500">· {r.numeroExpediente ?? "s/n"}</span>
                      <span className="block truncate text-xs text-neutral-400">{r.cliente.nombre}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label>
            <span className="label">Tipo de oficio</span>
            <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className="input">
              {Object.entries(TIPOS_OFICIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label>
            <span className="label">Fecha de notificación</span>
            <input type="date" name="fechaNotificacion" value={fNotif} onChange={(e) => setFNotif(e.target.value)} required className="input" />
          </label>
        </div>

        <label className="mb-3 block">
          <span className="label">
            Fecha límite{" "}
            {limiteCalculado && (
              <span className="font-normal text-neutral-400">
                {tipo === "NEGATIVA"
                  ? `(revisión: ${fmtFecha(calculado?.fechaLimiteRevision)} · nulidad: ${fmtFecha(limiteCalculado)})`
                  : `(calculada: ${fmtFecha(limiteCalculado)})`}
              </span>
            )}
          </span>
          <input type="date" name="fechaLimite" value={fLimite} onChange={(e) => setFLimite(e.target.value)} className="input" />
          <span className="mt-1 block text-[11px] text-neutral-400">Déjala vacía para usar la calculada: 4 meses para oficios · 5 días hábiles para requerimiento de pago y para alegatos (opcional) · negativa: 15 días naturales para revisión y hasta 30 naturales para nulidad · se confirma el acto: 15 días hábiles para nulidad.</span>
        </label>

        <label className="mb-4 block">
          <span className="label">Notas (opcional)</span>
          <textarea name="notas" rows={2} className="input" placeholder="Anterioridad con la marca XYZ, clase 35" />
        </label>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cerrar} className="btn">Cancelar</button>
          <button disabled={enviando} className="btn-primario">{enviando ? "Guardando…" : "Guardar notificación"}</button>
        </div>
      </form>
    </div>
  );
}
