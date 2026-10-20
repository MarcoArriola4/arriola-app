"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Mail, MessageCircle, Phone, Search, Undo2 } from "lucide-react";
import { avisarCliente, marcarContestada, marcarNoPago, marcarPagarSistema, regresarNotificacion, registrarPagoNotificacion } from "@/app/actions";
import { BANCOS, MEDIOS_DEFENSA, TIPOS_OFICIO, fmtFecha, mxn } from "@/lib/catalogos";
import { diasRestantes, siguientePlazo } from "@/lib/plazos";
import { PlazoOficio } from "@/components/ui";

export type Tarjeta = {
  id: string;
  estado: string;
  tipo: string;
  fechaNotificacion: string;
  fechaLimite: string;
  fechaLimiteRevision: string | null;
  pendienteNotificar: boolean;
  numeroOficio: string | null;
  nuevaImpi: boolean;
  fechaAvisoCliente: string | null;
  fechaPago: string | null;
  fechaContestacion: string | null;
  medioDefensa: string | null;
  montoCotizado: number | null;
  notas: string | null;
  expedienteId: string;
  denominacion: string;
  numeroExpediente: string | null;
  cliente: string;
  telefono: string | null;
  email: string | null;
};

const COLUMNAS = [
  { id: "RECIBIDA", titulo: "1 · Recibida", ayuda: "Avisa al cliente y cotiza" },
  { id: "AVISADO", titulo: "2 · Cliente avisado", ayuda: "Esperando su pago" },
  { id: "EN_TRABAJO", titulo: "3 · Pagado · por trabajar", ayuda: "Preparar la contestación" },
  { id: "PAGAR_SISTEMA", titulo: "4 · Pagar en sistema", ayuda: "Trabajado · falta pagar derechos y presentar" },
  { id: "CONTESTADA", titulo: "5 · Contestada", ayuda: "Últimos 30 días" },
];

const hoyISO = () => new Date().toLocaleDateString("en-CA");

function whatsapp(t: Tarjeta) {
  const tel = (t.telefono ?? "").split(/[/,]/)[0].replace(/\D/g, "");
  if (tel.length < 10) return null;
  const numero = tel.length === 10 ? `52${tel}` : tel;
  const nombre = t.cliente.split(/[/,]/)[0].trim();
  const exp = t.numeroExpediente ? ` (expediente ${t.numeroExpediente})` : "";
  const costo = t.montoCotizado ? ` El costo es de ${mxn.format(t.montoCotizado)}.` : "";
  if (t.tipo === "NEGATIVA") {
    const rev = t.fechaLimiteRevision;
    const texto = `Hola ${nombre}, le saluda Arriola Abogados. El IMPI emitió una negativa sobre su marca ${t.denominacion}${exp}. Podemos impugnarla con un recurso de revisión a más tardar el ${fmtFecha(rev)}, o con un juicio de nulidad a más tardar el ${fmtFecha(t.fechaLimite)}.${costo} ¿Desea que procedamos?`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }
  if (t.tipo === "CONFIRMA_ACTO") {
    const texto = `Hola ${nombre}, le saluda Arriola Abogados. El IMPI confirmó la negativa de su marca ${t.denominacion}${exp} en el recurso de revisión. Aún podemos presentar juicio de nulidad a más tardar el ${fmtFecha(t.fechaLimite)}.${costo} ¿Desea que procedamos?`;
    return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  }
  const msg = `Hola ${nombre}, le saluda Arriola Abogados. El IMPI emitió un oficio de ${TIPOS_OFICIO[t.tipo]?.toLowerCase()} sobre su marca ${t.denominacion}${t.numeroExpediente ? ` (expediente ${t.numeroExpediente})` : ""}. El plazo para contestarlo vence el ${fmtFecha(t.fechaLimite)}.${t.montoCotizado ? ` El costo de la contestación es de ${mxn.format(t.montoCotizado)}.` : ""} ¿Desea que procedamos?`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}

export function Tablero({ tarjetas, diasSeguimiento, modoLista }: { tarjetas: Tarjeta[]; diasSeguimiento: number; modoLista: boolean }) {
  const [q, setQ] = useState("");
  const [soloUrgentes, setSoloUrgentes] = useState(false);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tarjetas.filter(
      (x) =>
        (!t || `${x.denominacion} ${x.cliente} ${x.numeroExpediente ?? ""}`.toLowerCase().includes(t)) &&
        (!soloUrgentes || (x.estado !== "CONTESTADA" && !x.pendienteNotificar && diasRestantes(siguientePlazo(x).fecha) <= 7))
    );
  }, [tarjetas, q, soloUrgentes]);

  const filtros = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca, cliente o expediente" className="input pl-9" />
      </div>
      {!modoLista && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={soloUrgentes} onChange={(e) => setSoloUrgentes(e.target.checked)} className="accent-red-600" />
          Solo urgentes
        </label>
      )}
    </div>
  );

  if (modoLista) {
    return (
      <>
        {filtros}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtradas.map((t) => <TarjetaOficio key={t.id} t={t} diasSeguimiento={diasSeguimiento} />)}
        </div>
      </>
    );
  }

  return (
    <>
      {filtros}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNAS.map((c) => {
          // Orden: nuevas del IMPI primero, luego por el plazo más próximo; las aún no notificadas al final
          const items = filtradas
            .filter((t) => t.estado === c.id)
            .sort((a, b) =>
              Number(b.nuevaImpi) - Number(a.nuevaImpi) ||
              Number(a.pendienteNotificar) - Number(b.pendienteNotificar) ||
              siguientePlazo(a).fecha.getTime() - siguientePlazo(b).fecha.getTime()
            );
          return (
            <section key={c.id} className={`rounded-xl p-2 ${c.id === "PAGAR_SISTEMA" ? "bg-yellow-200/70" : "bg-neutral-200/50"}`}>
              <header className="flex items-baseline justify-between px-2 pb-2 pt-1">
                <div>
                  <h2 className="text-sm font-semibold">{c.titulo}</h2>
                  <p className="text-[11px] text-neutral-500">{c.ayuda}</p>
                </div>
                <span className="rounded-full bg-white px-2 text-xs font-medium text-neutral-600">{items.length}</span>
              </header>
              <div className="space-y-2">
                {items.map((t) => <TarjetaOficio key={t.id} t={t} diasSeguimiento={diasSeguimiento} />)}
                {items.length === 0 && <p className="py-6 text-center text-xs text-neutral-400">Sin oficios aquí</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function TarjetaOficio({ t, diasSeguimiento }: { t: Tarjeta; diasSeguimiento: number }) {
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const avisadoHace = t.fechaAvisoCliente ? -diasRestantes(new Date(t.fechaAvisoCliente)) : null;
  const wa = whatsapp(t);
  const tel = t.telefono?.split(/[/,]/)[0].replace(/\D/g, "");

  const enviar = (fn: (f: FormData) => Promise<void>) => async (f: FormData) => {
    setEnviando(true);
    try {
      await fn(f);
      setAbierto(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <article
      className={`rounded-lg border p-3 shadow-[0_1px_0_rgba(0,0,0,0.03)] ${
        t.nuevaImpi ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200" : "border-black/[0.06] bg-white"
      }`}
    >
      {t.nuevaImpi && (
        <p className="mb-1.5 inline-flex items-center gap-1 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Nueva · IMPI</p>
      )}
      <div className="flex items-start justify-between gap-2">
        <Link href={`/expedientes/${t.expedienteId}`} className="min-w-0 text-sm font-semibold leading-snug hover:underline">
          {t.denominacion}
        </Link>
        {t.estado === "CONTESTADA" ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-marca-claro px-2 py-0.5 text-xs font-medium text-marca-oscuro"><Check size={12} /> {fmtFecha(t.fechaContestacion)}</span>
        ) : (
          <span className="shrink-0"><PlazoOficio n={t} /></span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-neutral-600">{t.cliente}</p>
      <p className="mt-0.5 text-[11px] text-neutral-400">
        {TIPOS_OFICIO[t.tipo]} · Exp. {t.numeroExpediente ?? "s/n"} · notif. {fmtFecha(t.fechaNotificacion)}
      </p>
      {t.numeroOficio && (
        <p className="mt-0.5 text-[11px] text-marca-oscuro" title="Fecha y oficio verificados en MARCanet">✓ IMPI · oficio {t.numeroOficio}</p>
      )}

      {t.tipo === "NEGATIVA" && t.estado !== "CONTESTADA" && (
        <p className="mt-1.5 rounded bg-neutral-50 px-2 py-1 text-[11px] text-neutral-600">
          Revisión hasta <b className="font-medium">{fmtFecha(t.fechaLimiteRevision)}</b> · Nulidad hasta <b className="font-medium">{fmtFecha(t.fechaLimite)}</b>
        </p>
      )}
      {t.estado === "CONTESTADA" && t.medioDefensa && (
        <p className="mt-1.5 text-[11px] text-neutral-500">{MEDIOS_DEFENSA[t.medioDefensa]}</p>
      )}
      {t.estado === "AVISADO" && avisadoHace != null && (
        <p className={`mt-1.5 text-[11px] ${avisadoHace >= diasSeguimiento ? "font-medium text-amber-600" : "text-neutral-500"}`}>
          Avisado hace {avisadoHace} {avisadoHace === 1 ? "día" : "días"}
          {t.montoCotizado ? ` · cotizado ${mxn.format(t.montoCotizado)}` : ""}
          {avisadoHace >= diasSeguimiento && " · dar seguimiento"}
        </p>
      )}
      {t.estado === "EN_TRABAJO" && t.fechaPago && (
        <p className="mt-1.5 text-[11px] text-neutral-500">Pagó el {fmtFecha(t.fechaPago)}{t.montoCotizado ? ` · ${mxn.format(t.montoCotizado)}` : ""}</p>
      )}

      {(t.estado === "RECIBIDA" || t.estado === "AVISADO" || t.estado === "NO_PAGO") && (
        <div className="mt-2 flex gap-1.5">
          {wa && <a href={wa} target="_blank" rel="noreferrer" title="Avisar por WhatsApp" className="btn px-2 py-1 text-xs text-green-700"><MessageCircle size={13} /> WhatsApp</a>}
          {tel && tel.length >= 10 && <a href={`tel:${tel}`} title="Llamar" className="btn px-2 py-1 text-xs"><Phone size={13} /></a>}
          {t.email && <a href={`mailto:${t.email}?subject=${encodeURIComponent(`Oficio IMPI - ${t.denominacion}`)}`} title="Enviar correo" className="btn px-2 py-1 text-xs"><Mail size={13} /></a>}
        </div>
      )}

      {abierto && (
        <div className="mt-3 rounded-lg bg-neutral-50 p-2.5">
          {t.estado === "RECIBIDA" && (
            <form action={enviar(avisarCliente)} className="space-y-2">
              <input type="hidden" name="id" value={t.id} />
              <Campo label="Costo de la contestación"><input name="monto" defaultValue={t.tipo === "NEGATIVA" ? "" : "3200"} inputMode="numeric" className="input py-1.5" placeholder="3200" /></Campo>
              <Campo label="Fecha en que se avisó"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto="Guardar aviso" cancelar={() => setAbierto(false)} />
            </form>
          )}
          {t.estado === "AVISADO" && (
            <form action={enviar(registrarPagoNotificacion)} className="space-y-2">
              <input type="hidden" name="id" value={t.id} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Monto pagado"><input name="monto" defaultValue={t.montoCotizado ?? ""} inputMode="numeric" className="input py-1.5" required /></Campo>
                <Campo label="Banco">
                  <select name="banco" className="input py-1.5" defaultValue="BBVA">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select>
                </Campo>
              </div>
              <Campo label="Fecha de pago"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto="Registrar pago" cancelar={() => setAbierto(false)} />
            </form>
          )}
          {(t.estado === "EN_TRABAJO" || t.estado === "PAGAR_SISTEMA") && (
            <form action={enviar(marcarContestada)} className="space-y-2">
              <input type="hidden" name="id" value={t.id} />
              {t.tipo === "NEGATIVA" && (
                <Campo label="¿Qué se presentó?">
                  <select name="medioDefensa" defaultValue={siguientePlazo(t).etiqueta === "Recurso de revisión" ? "REVISION" : "NULIDAD"} className="input py-1.5">
                    {Object.entries(MEDIOS_DEFENSA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Campo>
              )}
              <Campo label="Fecha de presentación"><input type="date" name="fecha" defaultValue={hoyISO()} className="input py-1.5" /></Campo>
              <Botones enviando={enviando} texto={t.tipo === "NEGATIVA" || t.tipo === "CONFIRMA_ACTO" ? "Marcar presentado" : "Marcar contestada"} cancelar={() => setAbierto(false)} />
            </form>
          )}
        </div>
      )}

      {!abierto && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-black/5 pt-2.5">
          {t.estado === "RECIBIDA" && <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Avisé al cliente</button>}
          {t.estado === "AVISADO" && (
            <>
              <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Ya pagó</button>
              <form action={enviar(marcarNoPago)} onSubmit={(e) => { if (!confirm(`¿Marcar que el cliente no pagó "${t.denominacion}"? Se archivará con riesgo de abandono.`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn px-2.5 py-1 text-xs text-neutral-500">No pagó</button>
              </form>
            </>
          )}
          {t.estado === "EN_TRABAJO" && (
            <>
              <form action={enviar(marcarPagarSistema)}>
                <input type="hidden" name="id" value={t.id} />
                <button className="rounded-lg bg-yellow-300 px-2.5 py-1 text-xs font-semibold text-yellow-950 hover:bg-yellow-400">Trabajado · pagar en sistema</button>
              </form>
              <button onClick={() => setAbierto(true)} className="btn px-2.5 py-1 text-xs">
                {t.tipo === "NEGATIVA" || t.tipo === "CONFIRMA_ACTO" ? "Ya presentado" : "Ya presentada"}
              </button>
            </>
          )}
          {t.estado === "PAGAR_SISTEMA" && (
            <button onClick={() => setAbierto(true)} className="btn-primario px-2.5 py-1 text-xs">Pagado en sistema y presentado</button>
          )}
          {t.estado === "NO_PAGO" && <span className="text-xs font-medium text-red-600">Riesgo de abandono · no pagó</span>}
          {t.estado !== "RECIBIDA" && (
            <form action={enviar(regresarNotificacion)} className="ml-auto">
              <input type="hidden" name="id" value={t.id} />
              <button title={t.estado === "NO_PAGO" ? "Reactivar" : "Regresar un paso"} className="flex items-center gap-1 rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">
                <Undo2 size={13} /> {t.estado === "NO_PAGO" && "Reactivar"}
              </button>
            </form>
          )}
        </div>
      )}
    </article>
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
