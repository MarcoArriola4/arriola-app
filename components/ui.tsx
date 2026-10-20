import Link from "next/link";
import { ETAPAS } from "@/lib/catalogos";
import { diasRestantes, nivelUrgencia, siguientePlazo } from "@/lib/plazos";

export function Encabezado({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-neutral-500">{subtitulo}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const estiloEtapa: Record<string, string> = {
  POR_PRESENTAR: "bg-neutral-100 text-neutral-600",
  EN_TRAMITE: "bg-sky-50 text-sky-700",
  CON_OFICIO: "bg-amber-50 text-amber-700",
  CONCEDIDA: "bg-marca-claro text-marca-oscuro",
  NEGATIVA: "bg-red-50 text-red-700",
  EN_JUICIO: "bg-violet-50 text-violet-700",
  ABANDONADA: "bg-neutral-100 text-neutral-500",
};

export function Etapa({ etapa, desistio }: { etapa: string; desistio?: boolean | Date | null }) {
  if (desistio) return <span className="inline-block whitespace-nowrap rounded-md bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Abandonada (ya no es nuestro cliente)</span>;
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${estiloEtapa[etapa] ?? ""}`}>{ETAPAS[etapa] ?? etapa}</span>;
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
  return <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${estiloUrgencia[n]}`}>{txt}</span>;
}

/** Plazo de un oficio; en negativas indica si corre la revisión o la nulidad. */
export function PlazoOficio({ n }: { n: { tipo: string; fechaNotificacion: Date | string; fechaLimite: Date | string; fechaLimiteRevision?: Date | string | null; pendienteNotificar?: boolean } }) {
  if (n.pendienteNotificar) {
    return <span title="El IMPI emitió el oficio pero aún no lo notifica; el plazo todavía no corre" className="inline-block whitespace-nowrap rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Aún no notificado</span>;
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
  const s = estado === "PAGADO" ? "text-marca-oscuro" : estado === "PARCIAL" ? "text-amber-700" : "text-red-600";
  const t = estado === "PAGADO" ? "Pagado" : estado === "PARCIAL" ? "Parcial" : "Pendiente";
  return <span className={`text-xs font-medium ${s}`}>● {t}</span>;
}

/** Origen de la venta (columna A del Excel). Discreto a propósito. */
export function Origen({ origen }: { origen?: string | null }) {
  if (!origen) return null;
  return <span title="Origen de la venta" className="text-[11px] text-neutral-400">· {origen}</span>;
}

export function Metrica({ label, valor, nota, tono }: { label: string; valor: React.ReactNode; nota?: string; tono?: "rojo" | "ambar" | "verde" }) {
  const c = tono === "rojo" ? "text-red-600" : tono === "ambar" ? "text-amber-600" : tono === "verde" ? "text-marca-oscuro" : "";
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${c}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-400">{nota}</p>}
    </div>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-neutral-400">{children}</p>;
}

export function VistaClientesMarcas({ activa }: { activa: "clientes" | "marcas" }) {
  const c = (on: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium ${on ? "bg-white shadow-sm" : "text-neutral-500 hover:text-black"}`;
  return (
    <div className="inline-flex rounded-lg bg-neutral-200/70 p-1">
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
