"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Award, Check, MessageCircle } from "lucide-react";
import { guardarNotaTitulo, marcarTituloNotificado, quitarTituloVendido, venderTitulo } from "@/app/actions";
import { BANCOS, PRECIO_TITULO, fmtFecha } from "@/lib/catalogos";

export type FilaConcesion = {
  id: string;
  clienteId: string;
  denominacion: string;
  numeroExpediente: string | null;
  numeroRegistro: string | null;
  fechaConcesion: string;
  notificado: string | null;
  vendido: string | null;
  nota: string | null;
  cliente: string;
  telefono: string | null;
};

const FILTROS = [
  { id: "notificar", txt: "Por notificar" },
  { id: "vender", txt: "Notificadas sin vender" },
  { id: "vendidas", txt: "Vendidas" },
  { id: "todas", txt: "Todas" },
] as const;

/** Marcas que se acaban de conceder (últimos 90 días): avisar al cliente y venderle el título de concesión. */
export function ConcesionesRecientes({ filas, vendedores, cobros }: { filas: FilaConcesion[]; vendedores: string[]; cobros: boolean }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("notificar");
  const cuenta = useMemo(
    () => ({
      notificar: filas.filter((f) => !f.notificado && !f.vendido).length,
      vender: filas.filter((f) => f.notificado && !f.vendido).length,
      vendidas: filas.filter((f) => f.vendido).length,
      todas: filas.length,
    }),
    [filas]
  );
  const visibles = filas.filter((f) =>
    filtro === "notificar" ? !f.notificado && !f.vendido : filtro === "vender" ? f.notificado && !f.vendido : filtro === "vendidas" ? !!f.vendido : true
  );

  return (
    <details open={cuenta.notificar > 0} className="card mb-6 overflow-hidden">
      <summary className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-marca-claro text-marca-oscuro" aria-hidden><Award size={17} /></span>
        <span className="text-sm font-semibold">Marcas concedidas · últimos 90 días ({filas.length})</span>
        {cuenta.notificar > 0 && <span className="rounded-full bg-marca px-2 py-0.5 text-xs font-semibold text-carbon">{cuenta.notificar} por notificar</span>}
        <span className="ml-auto text-xs text-neutral-500">Avisa al cliente y ofrécele su título de concesión ({`$${PRECIO_TITULO}`})</span>
      </summary>
      <div className="border-t border-linea px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button key={f.id} onClick={() => setFiltro(f.id)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${filtro === f.id ? "bg-carbon text-white ring-carbon" : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}>
              {f.txt} <span className="opacity-60">{cuenta[f.id]}</span>
            </button>
          ))}
        </div>
        {visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Nada en este grupo.</p>
        ) : (
          <ul className="divide-y divide-black/5 overflow-hidden rounded-xl border border-linea">
            {visibles.map((f) => <Fila key={f.id} f={f} vendedores={vendedores} cobros={cobros} />)}
          </ul>
        )}
      </div>
    </details>
  );
}

function Fila({ f, vendedores, cobros }: { f: FilaConcesion; vendedores: string[]; cobros: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [vendiendo, setVendiendo] = useState(false);
  const [nota, setNota] = useState(f.nota ?? "");
  const dias = Math.floor((Date.now() - new Date(f.fechaConcesion).getTime()) / 864e5);
  const tel = (f.telefono ?? "").split(/[/,]/)[0].replace(/\D/g, "");
  const nombre = f.cliente.split(/[/,]/)[0].trim();
  const wa =
    tel.length >= 10
      ? `https://wa.me/${tel.length === 10 ? `52${tel}` : tel}?text=${encodeURIComponent(
          `Hola ${nombre}, le saluda Arriola Abogados. ¡Felicidades! El IMPI concedió el registro de su marca ${f.denominacion}${f.numeroRegistro ? ` (registro ${f.numeroRegistro})` : ""}. Podemos tramitarle su título de concesión por $${PRECIO_TITULO}. ¿Desea que lo solicitemos?`
        )}`
      : null;

  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <Link href={`/clientes/${f.clienteId}?marca=${f.id}`} className="font-medium hover:underline">{f.denominacion}</Link>
          <p className="text-xs text-neutral-500">{f.cliente} · Exp. {f.numeroExpediente ?? "s/n"}{f.numeroRegistro && ` · Reg. ${f.numeroRegistro}`}</p>
          <p className="text-xs text-marca-oscuro">Concedida el {fmtFecha(f.fechaConcesion)} · hace {dias} {dias === 1 ? "día" : "días"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${f.notificado ? "bg-marca-claro text-marca-oscuro" : "bg-amber-50 text-amber-800"}`}>
            {f.notificado ? <><Check size={11} aria-hidden /> Notificado {fmtFecha(f.notificado)}</> : "Por notificar"}
          </span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${f.vendido ? "bg-marca-claro text-marca-oscuro" : "bg-neutral-100 text-neutral-600"}`}>
            {f.vendido ? <><Check size={11} aria-hidden /> Título vendido {fmtFecha(f.vendido)}</> : "Título sin vender"}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn min-h-8 px-2 py-1 text-xs text-green-700"><MessageCircle size={13} aria-hidden /> Avisar por WhatsApp</a>}
        <button disabled={pendiente} onClick={() => iniciar(() => marcarTituloNotificado(f.id, !f.notificado))} className="btn min-h-8 px-2 py-1 text-xs">
          {f.notificado ? "Quitar «notificado»" : "Ya le notifiqué"}
        </button>
        {f.vendido ? (
          <button disabled={pendiente} onClick={() => { if (confirm("¿Quitar «título vendido»? La venta registrada se queda en Contrataciones.")) iniciar(() => quitarTituloVendido(f.id)); }} className="btn min-h-8 px-2 py-1 text-xs text-neutral-500">Quitar «vendido»</button>
        ) : cobros ? (
          <button onClick={() => setVendiendo(!vendiendo)} className="btn-marca min-h-8 px-2.5 py-1 text-xs">Ya se vendió</button>
        ) : null}
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onBlur={() => { if (nota.trim() !== (f.nota ?? "")) iniciar(() => guardarNotaTitulo(f.id, nota)); }}
          placeholder="Nota (le interesa, llamar el lunes…)"
          aria-label={`Nota del título de ${f.denominacion}`}
          className="input min-h-8 min-w-0 flex-1 basis-48 py-1 text-xs"
        />
        {pendiente && <span className="text-[11px] text-neutral-400">Guardando…</span>}
      </div>

      {vendiendo && !f.vendido && (
        <form
          action={(fd) => iniciar(async () => { await venderTitulo(fd); setVendiendo(false); })}
          className="mt-2 grid gap-2 rounded-lg bg-neutral-50 p-2.5 sm:grid-cols-5"
        >
          <input type="hidden" name="expedienteId" value={f.id} />
          <label className="text-xs"><span className="label">Costo</span><input name="costo" defaultValue={PRECIO_TITULO} inputMode="numeric" className="input py-1.5" /></label>
          <label className="text-xs"><span className="label">Pagado</span><input name="pagado" defaultValue={PRECIO_TITULO} inputMode="numeric" className="input py-1.5" /></label>
          <label className="text-xs"><span className="label">Banco</span><select name="banco" defaultValue="BBVA" className="input py-1.5">{BANCOS.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label className="text-xs"><span className="label">Vendió</span><input name="vendedor" list="vendedoras-titulo" className="input py-1.5" placeholder="Nombre" /></label>
          <div className="flex items-end gap-1.5">
            <button disabled={pendiente} className="btn-primario min-h-8 flex-1 px-2.5 py-1 text-xs">{pendiente ? "Guardando…" : "Registrar venta"}</button>
            <button type="button" onClick={() => setVendiendo(false)} className="btn min-h-8 px-2 py-1 text-xs">Cancelar</button>
          </div>
          <datalist id="vendedoras-titulo">{vendedores.map((v) => <option key={v} value={v} />)}</datalist>
        </form>
      )}
    </li>
  );
}
