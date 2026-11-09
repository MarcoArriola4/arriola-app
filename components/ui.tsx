import Link from "next/link";
import { Inbox } from "lucide-react";
import { ETAPAS } from "@/lib/catalogos";
import { diasRestantes, esperandoImpi, nivelUrgencia, siguientePlazo } from "@/lib/plazos";

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-b border-linea pb-5">
      <div className="min-w-0">
        <h1 className="font-titulo text-[2rem] font-semibold leading-tight tracking-tight text-carbon">{titulo}</h1>
        {subtitulo && <p className="mt-1 max-w-2xl text-sm text-neutral-500">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// Estatus de la marca: color + punto (no depende solo del color: siempre lleva el texto)
const estiloEtapa: Record<string, { cls: string; punto: string }> = {
  POR_PRESENTAR: { cls: "bg-neutral-100 text-neutral-700 ring-neutral-200", punto: "bg-neutral-400" },
  EN_TRAMITE: { cls: "bg-sky-50 text-sky-800 ring-sky-200", punto: "bg-sky-500" },
  CON_OFICIO: { cls: "bg-amber-50 text-amber-800 ring-amber-200", punto: "bg-amber-500" },
  CONCEDIDA: { cls: "bg-marca-claro text-marca-oscuro ring-marca/30", punto: "bg-marca" },
  NEGATIVA: { cls: "bg-red-50 text-red-700 ring-red-200", punto: "bg-red-500" },
  CONFIRMA_ACTO: { cls: "bg-red-50 text-red-700 ring-red-200", punto: "bg-red-500" },
  EN_JUICIO: { cls: "bg-violet-50 text-violet-800 ring-violet-200", punto: "bg-violet-500" },
  ABANDONADA: { cls: "bg-neutral-100 text-neutral-500 ring-neutral-200", punto: "bg-neutral-300" },
};

export function Etapa({ etapa, desistio }: { etapa: string; desistio?: boolean | Date | null }) {
  if (desistio) return <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">Abandonada (ya no es nuestro cliente)</span>;
  const e = estiloEtapa[etapa] ?? { cls: "bg-neutral-100 text-neutral-700 ring-neutral-200", punto: "bg-neutral-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${e.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${e.punto}`} aria-hidden />
      {ETAPAS[etapa] ?? etapa}
    </span>
  );
}

const estiloUrgencia = {
  vencido: "bg-red-600 text-white",
  urgente: "bg-red-50 text-red-700",
  atencion: "bg-amber-50 text-amber-700",
  ok: "bg-marca-claro text-marca-oscuro",
};

export function Plazo({ fecha }: { fecha: Date }) {
  const d = diasRestantes(fecha);
  const n = nivelUrgencia(d);
  const txt = d < 0 ? `Venció hace ${-d} d` : d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : `${d} días`;
  return <span className={`cifra inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${estiloUrgencia[n]}`}>{txt}</span>;
}

/** Plazo de un oficio; en negativas indica si corre la revisión o la nulidad. */
export function PlazoOficio({ n }: { n: { tipo: string; fechaNotificacion: Date | string; fechaLimite: Date | string; fechaLimiteRevision?: Date | string | null; pendienteNotificar?: boolean } }) {
  if (n.pendienteNotificar) {
    return <span title="El IMPI emitió el oficio pero aún no lo notifica; el plazo todavía no corre" className="inline-block whitespace-nowrap rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Aún no notificado</span>;
  }
  if (esperandoImpi(n)) {
    return <span title="Los 5 días para alegatos ya pasaron; no es obligatorio contestar. Se espera la resolución del IMPI." className="inline-block whitespace-nowrap rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">En espera del IMPI</span>;
  }
  const p = siguientePlazo(n);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      {p.etiqueta && <span className="text-[11px] font-medium text-neutral-500">{p.etiqueta}</span>}
      <Plazo fecha={p.fecha} />
    </span>
  );
}

export function EstadoPago({ estado }: { estado: string }) {
  const s = estado === "PAGADO" ? "bg-marca-claro text-marca-oscuro" : estado === "PARCIAL" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  const p = estado === "PAGADO" ? "bg-marca" : estado === "PARCIAL" ? "bg-amber-500" : "bg-red-500";
  const t = estado === "PAGADO" ? "Pagado" : estado === "PARCIAL" ? "Parcial" : "Pendiente";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${p}`} aria-hidden />
      {t}
    </span>
  );
}

/** Origen de la venta (columna A del Excel). Discreto a propósito. */
export function Origen({ origen }: { origen?: string | null }) {
  if (!origen) return null;
  return <span title="Origen de la venta" className="text-[11px] text-neutral-400">· {origen}</span>;
}

export function Metrica({ label, valor, nota, tono }: { label: string; valor: React.ReactNode; nota?: string; tono?: "rojo" | "ambar" | "verde" }) {
  const c = tono === "rojo" ? "text-red-600" : tono === "ambar" ? "text-amber-600" : tono === "verde" ? "text-marca-oscuro" : "text-carbon";
  const barra = tono === "rojo" ? "bg-red-500" : tono === "ambar" ? "bg-amber-400" : tono === "verde" ? "bg-marca" : "bg-neutral-200";
  return (
    <div className="card relative overflow-hidden px-4 py-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${barra}`} aria-hidden />
      <p className="rotulo">{label}</p>
      <p className={`cifra mt-1.5 text-2xl font-semibold tracking-tight ${c}`}>{valor}</p>
      {nota && <p className="mt-1 text-xs leading-snug text-neutral-500">{nota}</p>}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-400" aria-hidden>
        <Inbox size={18} strokeWidth={1.8} />
      </span>
      <p className="text-sm text-neutral-500">{children}</p>
    </div>
  );
}

export function VistaClientesMarcas({ activa }: { activa: "clientes" | "marcas" }) {
  const c = (on: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium transition ${on ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500 hover:text-carbon"}`;
  return (
    <div className="inline-flex rounded-lg bg-black/[0.05] p-1">
      <Link href="/clientes" className={c(activa === "clientes")}>Por cliente</Link>
      <Link href="/expedientes" className={c(activa === "marcas")}>Por marca</Link>
    </div>
  );
}

const mxnCorto = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** Pago en 2 partes: "$1,600 ✓ + $1,600 pendiente". */
export function Parcialidades({ s }: { s: { parcialidad1?: number | null; parcialidad1Pagada?: boolean | null; parcialidad2?: number | null; parcialidad2Pagada?: boolean | null } }) {
  if (s.parcialidad2 == null) return null;
  const chip = (monto: number | null | undefined, ok: boolean | null | undefined, n: number) => (
    <span
      title={`${n}er pago ${ok ? "pagado" : "pendiente"}`}
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${ok ? "bg-marca-claro text-marca-oscuro" : "bg-red-50 text-red-700"}`}
    >
      {mxnCorto.format(monto ?? 0)} {ok ? "✓" : "pendiente"}
    </span>
  );
  return (
    <span className="mt-0.5 flex flex-wrap items-center justify-end gap-1">
      {chip(s.parcialidad1, s.parcialidad1Pagada, 1)}
      <span className="text-[11px] text-neutral-400">+</span>
      {chip(s.parcialidad2, s.parcialidad2Pagada, 2)}
    </span>
  );
}
