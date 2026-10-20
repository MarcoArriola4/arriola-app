"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Pencil, Search, Users } from "lucide-react";
import { cambiarEstadoTrabajo, cambiarNotaEstado, cambiarVendedor, marcarPagadoCompleto, marcarParcialidad, renombrarVendedor } from "@/app/actions";
import { ESTADOS_TRABAJO, nombrePropio, personasVenta } from "@/lib/catalogos";

export type FilaContratacion = {
  numero: number; // consecutivo: #1 = la primera contratación del mes (o de la historia)
  id: string;
  fecha: string | null;
  clienteId: string;
  cliente: string;
  telefono: string | null;
  expedienteId: string;
  denominacion: string;
  numeroExpediente: string | null;
  tipoExpediente: string;
  etapa: string;
  servicio: string;
  vendio: string | null;
  costo: number | null;
  pagado: number;
  saldo: number;
  estadoPago: string;
  parcialidad1: number | null;
  parcialidad1Pagada: boolean | null;
  parcialidad2: number | null;
  parcialidad2Pagada: boolean | null;
  banco: string | null;
  estadoTrabajo: string | null;
  avance: string | null;
  pendientes: { tipo: string; texto: string }[];
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const fechaCorta = (s: string | null, conAnio: boolean) =>
  s ? new Date(s).toLocaleDateString("es-MX", { day: "2-digit", month: "short", ...(conAnio && { year: "2-digit" }), timeZone: "UTC" }) : "—";

const ACCION: Record<string, string> = {
  trabajar: "bg-violet-600 text-white",
  presentar: "bg-fuchsia-600 text-white",
  sistema: "bg-yellow-300 text-yellow-950",
  problema: "bg-red-600 text-white",
  cobrar: "bg-amber-400 text-amber-950",
  oficio: "bg-carbon text-white",
};

const FILTROS_PAGO = [
  { id: "", txt: "Todos" },
  { id: "debe", txt: "Deben" },
  { id: "PAGADO", txt: "Pagado completo" },
  { id: "PARCIAL", txt: "Pago parcial" },
  { id: "PENDIENTE", txt: "Sin pagar" },
];

const POR_PAGINA = 300;
const SIN_VENDEDOR = "SIN REGISTRAR";

export function HojaContrataciones({ filas, esAdmin, historial }: { filas: FilaContratacion[]; esAdmin: boolean; historial: boolean }) {
  const [q, setQ] = useState("");
  const [vendedor, setVendedor] = useState<string | null>(null);
  const [trabajo, setTrabajo] = useState<string | null>(null);
  const [pago, setPago] = useState("");
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [verVendedores, setVerVendedores] = useState(false);
  const [limite, setLimite] = useState(POR_PAGINA);

  // Vendedores normalizados: "Marco", "MARCO" y "MarCO" son la misma persona; una venta compartida cuenta para cada uno
  const ventasPorVendedor = useMemo(() => {
    const m = new Map<string, { nombres: Map<string, number>; n: number; vendido: number; cobrado: number; debe: number }>();
    for (const f of filas) {
      const personas = f.vendio ? personasVenta(f.vendio) : [SIN_VENDEDOR];
      for (const p of personas) {
        const v = m.get(p) ?? { nombres: new Map(), n: 0, vendido: 0, cobrado: 0, debe: 0 };
        v.n++;
        v.vendido += f.costo ?? 0;
        v.cobrado += f.pagado;
        v.debe += f.saldo;
        m.set(p, v);
      }
    }
    return [...m].map(([clave, v]) => ({ clave, nombre: clave === SIN_VENDEDOR ? "Sin registrar" : nombrePropio(clave), ...v })).sort((a, b) => b.n - a.n);
  }, [filas]);

  const sugerencias = useMemo(() => ventasPorVendedor.filter((v) => v.clave !== SIN_VENDEDOR).map((v) => v.nombre), [ventasPorVendedor]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return filas.filter((f) => {
      if (vendedor && !(f.vendio ? personasVenta(f.vendio) : [SIN_VENDEDOR]).includes(vendedor)) return false;
      if (trabajo && (f.estadoTrabajo ?? "SIN") !== trabajo) return false;
      if (pago === "debe" ? f.saldo <= 0 : pago && f.estadoPago !== pago) return false;
      if (soloPendientes && f.pendientes.length === 0) return false;
      return !t || `${f.cliente} ${f.denominacion} ${f.numeroExpediente ?? ""} ${f.avance ?? ""}`.toLowerCase().includes(t);
    });
  }, [filas, q, vendedor, trabajo, pago, soloPendientes]);

  const tot = useMemo(
    () => ({
      n: visibles.length,
      vendido: visibles.reduce((a, f) => a + (f.costo ?? 0), 0),
      cobrado: visibles.reduce((a, f) => a + f.pagado, 0),
      porCobrar: visibles.reduce((a, f) => a + f.saldo, 0),
      deudores: visibles.filter((f) => f.saldo > 0).length,
      porTrabajar: visibles.filter((f) => ["PENDIENTE", "PRESENTAR", "PAGAR_SISTEMA"].includes(f.estadoTrabajo ?? "")).length,
      pagoCompleto: visibles.filter((f) => f.estadoPago === "PAGADO").length,
    }),
    [visibles]
  );

  const conteoTrabajo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of filas) c[f.estadoTrabajo ?? "SIN"] = (c[f.estadoTrabajo ?? "SIN"] ?? 0) + 1;
    return c;
  }, [filas]);

  return (
    <>
      <datalist id="vendedores">{sugerencias.map((s) => <option key={s} value={s} />)}</datalist>

      {/* Resumen */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tarjeta label="Contrataciones" valor={tot.n.toLocaleString("es-MX")} />
        <Tarjeta label="Vendido" valor={mxn.format(tot.vendido)} />
        <Tarjeta label="Cobrado" valor={mxn.format(tot.cobrado)} nota={`${tot.pagoCompleto} pagados completos`} tono="text-marca-oscuro" />
        <button onClick={() => setPago(pago === "debe" ? "" : "debe")} className="text-left">
          <Tarjeta label="Por cobrar" valor={mxn.format(tot.porCobrar)} nota={`${tot.deudores} deben · clic para verlos`} tono={tot.porCobrar ? "text-red-600" : ""} activo={pago === "debe"} />
        </button>
        <Tarjeta label="Por trabajar / presentar / pagar" valor={tot.porTrabajar} tono={tot.porTrabajar ? "text-violet-700" : ""} />
      </div>

      {/* Ventas por vendedor */}
      <section className="card mb-4">
        <button onClick={() => setVerVendedores(!verVendedores)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold"><Users size={15} /> Ventas por vendedor {historial ? "(histórico)" : "(este mes)"}</span>
          <span className="text-xs text-neutral-500">{verVendedores ? "Ocultar" : `${ventasPorVendedor.length} vendedores · ver detalle`}</span>
        </button>
        {verVendedores && (
          <div className="overflow-x-auto border-t border-black/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr><th className="px-4 py-2">Vendedor</th><th className="px-4 py-2 text-right">Ventas</th><th className="px-4 py-2 text-right">Vendido</th><th className="px-4 py-2 text-right">Cobrado</th><th className="px-4 py-2 text-right">Le deben</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {ventasPorVendedor.map((v) => (
                  <tr key={v.clave} className="hover:bg-neutral-50">
                    <td className="px-4 py-2">
                      <button onClick={() => setVendedor(vendedor === v.clave ? null : v.clave)} className={`font-medium hover:underline ${vendedor === v.clave ? "text-marca-oscuro" : ""}`}>{v.nombre}</button>
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">{v.n}</td>
                    <td className="px-4 py-2 text-right">{mxn.format(v.vendido)}</td>
                    <td className="px-4 py-2 text-right text-marca-oscuro">{mxn.format(v.cobrado)}</td>
                    <td className={`px-4 py-2 text-right ${v.debe ? "text-red-600" : "text-neutral-400"}`}>{mxn.format(v.debe)}</td>
                    <td className="px-4 py-2 text-right">{esAdmin && v.clave !== SIN_VENDEDOR && <Renombrar clave={v.clave} nombre={v.nombre} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[11px] text-neutral-400">Mayúsculas, minúsculas y acentos no importan: “MARCO”, “Marco” y “márco” cuentan como la misma persona. Una venta compartida (“Gabriel - Tanya”) cuenta para cada uno.</p>
          </div>
        )}
      </section>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar cliente, marca, expediente o nota" className="input pl-9" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} className="accent-violet-600" />
          Solo con algo pendiente
        </label>
        {(vendedor || trabajo || pago || q || soloPendientes) && (
          <button onClick={() => { setVendedor(null); setTrabajo(null); setPago(""); setQ(""); setSoloPendientes(false); }} className="text-xs text-neutral-500 underline-offset-2 hover:underline">Quitar filtros</button>
        )}
      </div>
      <Grupo titulo="Trabajo">
        <Chip activo={!trabajo} onClick={() => setTrabajo(null)}>Todos</Chip>
        {Object.entries(ESTADOS_TRABAJO).map(([k, v]) => (
          <Chip key={k} activo={trabajo === k} onClick={() => setTrabajo(trabajo === k ? null : k)} color={v.cls}>{v.txt} <span className="opacity-60">{conteoTrabajo[k] ?? 0}</span></Chip>
        ))}
        <Chip activo={trabajo === "SIN"} onClick={() => setTrabajo(trabajo === "SIN" ? null : "SIN")}>Sin registrar <span className="opacity-60">{conteoTrabajo.SIN ?? 0}</span></Chip>
      </Grupo>
      <Grupo titulo="Pago">
        {FILTROS_PAGO.map((p) => <Chip key={p.id} activo={pago === p.id} onClick={() => setPago(pago === p.id ? "" : p.id)}>{p.txt}</Chip>)}
        {pago === "debe" && <span className="text-xs font-medium text-red-600">{tot.deudores} deben {mxn.format(tot.porCobrar)}</span>}
      </Grupo>
      <Grupo titulo="Vendió">
        <Chip activo={!vendedor} onClick={() => setVendedor(null)}>Todos</Chip>
        {ventasPorVendedor.slice(0, historial ? 12 : 30).map((v) => (
          <Chip key={v.clave} activo={vendedor === v.clave} onClick={() => setVendedor(vendedor === v.clave ? null : v.clave)}>{v.nombre} <span className="opacity-60">{v.n}</span></Chip>
        ))}
      </Grupo>

      {/* Hoja */}
      <div className="card mt-3 overflow-hidden">
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[1250px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-carbon text-left text-xs text-white/80">
              <tr>
                {["#", "Fecha", "Cliente", "Marca / expediente", "Servicio", "Vendió", "Costo", "Pago", "Trabajo y estatus", "¿Qué hacer?"].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-medium ${i === 2 ? "sticky left-0 z-20 bg-carbon" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, limite).map((f) => <Fila key={f.id} f={f} n={f.numero} esAdmin={esAdmin} conAnio={historial} />)}
            </tbody>
            {visibles.length > 0 && (
              <tfoot className="sticky bottom-0 bg-neutral-100 text-xs font-semibold">
                <tr>
                  <td className="px-3 py-2.5" colSpan={6}>{tot.n.toLocaleString("es-MX")} contrataciones</td>
                  <td className="px-3 py-2.5 text-right">{mxn.format(tot.vendido)}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-marca-oscuro">{mxn.format(tot.cobrado)}</span>
                    {tot.porCobrar > 0 && <span className="ml-2 text-red-600">deben {mxn.format(tot.porCobrar)}</span>}
                  </td>
                  <td className="px-3 py-2.5" colSpan={2}>{tot.porTrabajar} por trabajar / presentar / pagar en sistema</td>
                </tr>
              </tfoot>
            )}
          </table>
          {visibles.length === 0 && <p className="px-4 py-10 text-center text-sm text-neutral-400">No hay contrataciones con esos filtros.</p>}
        </div>
        {visibles.length > limite && (
          <button onClick={() => setLimite(limite + POR_PAGINA)} className="w-full border-t border-black/5 bg-neutral-50 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            Mostrar {Math.min(POR_PAGINA, visibles.length - limite)} más · {visibles.length - limite} restantes
          </button>
        )}
      </div>
    </>
  );
}

function Fila({ f, n, esAdmin, conAnio }: { f: FilaContratacion; n: number; esAdmin: boolean; conAnio: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const celda = "border-b border-black/[0.06] px-3 py-2 align-top";
  const fondo = n % 2 === 0 ? "bg-neutral-50/70" : "bg-white";
  return (
    <tr className={`${fondo} transition hover:bg-marca-claro/40 ${pendiente ? "opacity-50" : ""}`}>
      <td className={`${celda} whitespace-nowrap text-xs font-semibold text-neutral-500`}>#{n}</td>
      <td className={`${celda} whitespace-nowrap text-neutral-600`}>{fechaCorta(f.fecha, conAnio)}</td>
      <td className={`${celda} sticky left-0 z-[5] max-w-[220px] ${fondo}`}>
        <Link href={`/clientes/${f.clienteId}?marca=${f.expedienteId}`} className="font-medium hover:underline">{f.cliente}</Link>
        {f.telefono && <span className="block text-[11px] text-neutral-400">{f.telefono}</span>}
      </td>
      <td className={`${celda} max-w-[220px]`}>
        <Link href={`/clientes/${f.clienteId}?marca=${f.expedienteId}`} className="font-medium hover:underline">{f.denominacion}</Link>
        <span className="block text-[11px] text-neutral-400">{f.tipoExpediente} · {f.numeroExpediente ?? "s/n"}</span>
      </td>
      <td className={`${celda} whitespace-nowrap`}>{f.servicio}</td>
      <td className={`${celda} min-w-[130px]`}>
        {esAdmin ? (
          <TextoEditable valor={f.vendio ?? ""} lista="vendedores" placeholder="¿Quién vendió?" alGuardar={(v) => iniciar(() => cambiarVendedor(f.id, v))} />
        ) : f.vendio ? (
          <span className="whitespace-nowrap rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-700">{f.vendio}</span>
        ) : (
          <span className="text-neutral-300">—</span>
        )}
      </td>
      <td className={`${celda} whitespace-nowrap text-right`}>
        {f.costo ? mxn.format(f.costo) : "—"}
        {f.parcialidad2 != null && <span className="block text-[11px] text-neutral-400">en 2 pagos</span>}
      </td>
      <td className={`${celda} min-w-[190px]`}>
        {f.parcialidad2 != null ? (
          <div className="flex flex-col gap-1">
            <Parcialidad monto={f.parcialidad1} ok={f.parcialidad1Pagada} n={1} editable={esAdmin} alCambiar={(v) => iniciar(() => marcarParcialidad(f.id, 1, v))} />
            <Parcialidad monto={f.parcialidad2} ok={f.parcialidad2Pagada} n={2} editable={esAdmin} alCambiar={(v) => iniciar(() => marcarParcialidad(f.id, 2, v))} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <EstadoPagoChip estado={f.estadoPago} />
            {esAdmin && f.estadoPago !== "PAGADO" && (f.costo ?? 0) > 0 && (
              <button onClick={() => iniciar(() => marcarPagadoCompleto(f.id))} className="rounded border border-black/10 px-1.5 py-0.5 text-[11px] text-neutral-600 hover:bg-white">Ya pagó</button>
            )}
          </div>
        )}
        {f.saldo > 0 && <span className="mt-0.5 block text-[11px] font-medium text-red-600">Debe {mxn.format(f.saldo)}</span>}
        {f.banco && <span className="block text-[11px] text-neutral-400">{f.banco}</span>}
      </td>
      <td className={`${celda} min-w-[200px]`}>
        {esAdmin ? (
          <select
            value={f.estadoTrabajo ?? ""}
            onChange={(e) => iniciar(() => cambiarEstadoTrabajo(f.id, e.target.value || null))}
            className={`w-full cursor-pointer rounded-md border-0 py-1 pl-2 pr-7 text-xs font-semibold ring-1 ring-black/10 ${f.estadoTrabajo ? ESTADOS_TRABAJO[f.estadoTrabajo]?.cls : "bg-white text-neutral-500"}`}
          >
            <option value="">Sin registrar</option>
            {Object.entries(ESTADOS_TRABAJO).map(([k, v]) => <option key={k} value={k}>{v.txt}</option>)}
          </select>
        ) : f.estadoTrabajo ? (
          <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${ESTADOS_TRABAJO[f.estadoTrabajo]?.cls}`}>{ESTADOS_TRABAJO[f.estadoTrabajo]?.txt}</span>
        ) : (
          <span className="text-xs text-neutral-300">Sin registrar</span>
        )}
        <div className="mt-1">
          {esAdmin ? (
            <TextoEditable valor={f.avance ?? ""} placeholder="Escribir estatus…" chico alGuardar={(v) => iniciar(() => cambiarNotaEstado(f.id, v))} />
          ) : (
            f.avance && <span className="block max-w-[220px] truncate text-[11px] text-neutral-500" title={f.avance}>{f.avance}</span>
          )}
        </div>
      </td>
      <td className={`${celda} min-w-[170px]`}>
        {f.pendientes.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-marca-oscuro"><Check size={13} /> Nada pendiente</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {f.pendientes.map((p) => <span key={p.texto} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ACCION[p.tipo] ?? "bg-neutral-200"}`}>{p.texto}</span>)}
          </div>
        )}
      </td>
    </tr>
  );
}

/** Texto que se edita en la misma celda: clic para escribir, Enter o salir para guardar. */
function TextoEditable({ valor, placeholder, alGuardar, lista, chico }: { valor: string; placeholder: string; alGuardar: (v: string) => void; lista?: string; chico?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor);
  const guardar = () => {
    setEditando(false);
    if (texto.trim() !== valor.trim()) alGuardar(texto);
  };
  if (editando) {
    return (
      <input
        autoFocus
        list={lista}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardar}
        onKeyDown={(e) => { if (e.key === "Enter") guardar(); if (e.key === "Escape") { setTexto(valor); setEditando(false); } }}
        placeholder={placeholder}
        className={`w-full rounded border border-marca bg-white px-1.5 py-0.5 outline-none ${chico ? "text-[11px]" : "text-xs"}`}
      />
    );
  }
  return (
    <button onClick={() => { setTexto(valor); setEditando(true); }} title="Clic para editar" className={`group flex w-full items-center gap-1 text-left ${chico ? "text-[11px]" : "text-xs"}`}>
      {valor ? (
        <span className={chico ? "line-clamp-2 text-neutral-600" : "whitespace-nowrap rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700"}>{valor}</span>
      ) : (
        <span className="text-neutral-300">{placeholder}</span>
      )}
      <Pencil size={11} className="shrink-0 text-neutral-300 opacity-0 group-hover:opacity-100" />
    </button>
  );
}

function Renombrar({ clave, nombre }: { clave: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(nombre);
  const [pendiente, iniciar] = useTransition();
  if (!abierto) return <button onClick={() => setAbierto(true)} className="text-xs text-neutral-500 hover:text-black">Renombrar</button>;
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} className="w-32 rounded border border-black/15 px-1.5 py-0.5 text-xs" />
      <button
        disabled={pendiente}
        onClick={() => iniciar(async () => { await renombrarVendedor(clave, texto); setAbierto(false); })}
        className="rounded bg-carbon px-2 py-0.5 text-xs text-white"
      >
        {pendiente ? "…" : "Guardar"}
      </button>
    </span>
  );
}

function Parcialidad({ monto, ok, n, editable, alCambiar }: { monto: number | null; ok: boolean | null; n: number; editable: boolean; alCambiar: (v: boolean) => void }) {
  const cls = ok ? "bg-marca-claro text-marca-oscuro" : "bg-red-50 text-red-700";
  const contenido = <>{n}º · {mxn.format(monto ?? 0)} · {ok ? "pagado ✓" : "pendiente"}</>;
  return editable ? (
    <button onClick={() => alCambiar(!ok)} title={ok ? "Marcar como pendiente" : "Marcar como pagado"} className={`rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${cls} hover:ring-1 hover:ring-black/20`}>{contenido}</button>
  ) : (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{contenido}</span>
  );
}

function EstadoPagoChip({ estado }: { estado: string }) {
  const m: Record<string, [string, string]> = {
    PAGADO: ["Pagado completo", "bg-marca-claro text-marca-oscuro"],
    PARCIAL: ["Pago parcial", "bg-amber-50 text-amber-800"],
    PENDIENTE: ["Sin pagar", "bg-red-50 text-red-700"],
  };
  const [t, c] = m[estado] ?? [estado, ""];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c}`}>{t}</span>;
}

function Tarjeta({ label, valor, nota, tono = "", activo }: { label: string; valor: React.ReactNode; nota?: string; tono?: string; activo?: boolean }) {
  return (
    <div className={`card h-full px-4 py-3 ${activo ? "ring-2 ring-red-300" : ""}`}>
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tracking-tight ${tono}`}>{valor}</p>
      {nota && <p className="text-[11px] text-neutral-400">{nota}</p>}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 w-14 shrink-0 text-xs font-medium text-neutral-500">{titulo}:</span>
      {children}
    </div>
  );
}

function Chip({ activo, onClick, children, color }: { activo: boolean; onClick: () => void; children: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${activo ? "bg-carbon text-white" : color ? `${color} ring-1 ring-black/5 hover:ring-black/25` : "bg-white text-neutral-700 ring-1 ring-black/10 hover:ring-black/25"}`}
    >
      {children}
    </button>
  );
}

