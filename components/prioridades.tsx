import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { notificacionesActivas } from "@/lib/consultas";
import { diasRestantes, esNuevaDeImpi, esperandoImpi, estaVencida, siguientePlazo } from "@/lib/plazos";
import { TIPOS_OFICIO } from "@/lib/catalogos";
import { PlazoOficio } from "@/components/ui";

// Qué hay que hacer con cada oficio, dicho en corto
const QUE_HACER: Record<string, { txt: string; cls: string }> = {
  RECIBIDA: { txt: "Avisar al cliente", cls: "bg-amber-50 text-amber-800" },
  AVISADO: { txt: "Dar seguimiento al pago", cls: "bg-sky-50 text-sky-800" },
  EN_TRABAJO: { txt: "Pagado · trabajar ya", cls: "bg-violet-50 text-violet-800" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema y presentar", cls: "bg-yellow-200 text-yellow-900" },
};

/** Prioridades de los oficios: tres números clave y lo más urgente (en Notificaciones, arriba del tablero). */
export async function Prioridades({ seguimiento }: { seguimiento: number }) {
  const activas = await notificacionesActivas();
  const enPlazo = activas.filter((n) => !estaVencida(n) && !esperandoImpi(n));
  const dias = (n: (typeof activas)[number]) => (n.pendienteNotificar ? 9999 : diasRestantes(siguientePlazo(n).fecha));
  const atencion = enPlazo
    .filter((n) =>
      n.estado === "RECIBIDA" ||
      (n.estado === "AVISADO" && (dias(n) <= 15 || (n.fechaAvisoCliente && -diasRestantes(n.fechaAvisoCliente) >= seguimiento))) ||
      ((n.estado === "EN_TRABAJO" || n.estado === "PAGAR_SISTEMA") && dias(n) <= 7)
    )
    .sort((a, b) => Number(esNuevaDeImpi(b)) - Number(esNuevaDeImpi(a)) || dias(a) - dias(b));
  const visibles = atencion.slice(0, 6);
  const indicadores = [
    { t: "Por avisar al cliente", n: enPlazo.filter((n) => n.estado === "RECIBIDA").length, cls: "text-amber-600" },
    { t: "Esperando pago", n: enPlazo.filter((n) => n.estado === "AVISADO").length, cls: "text-sky-700" },
    { t: "Vencen esta semana", n: enPlazo.filter((n) => { const d = dias(n); return d >= 0 && d <= 7; }).length, cls: "text-red-600" },
  ];

  return (
    <section className="mb-8 rounded-2xl border border-black/[0.06] bg-gradient-to-b from-white to-neutral-50/60 p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Prioridades de hoy</h2>
        <span className="text-xs text-neutral-500">{atencion.length ? `${atencion.length} por atender` : "Todo al día"}</span>
      </div>
      <div className="mb-4 grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.06] bg-white">
        {indicadores.map((i) => (
          <div key={i.t} className="px-4 py-3">
            <p className={`text-3xl font-semibold tracking-tight ${i.n ? i.cls : "text-neutral-300"}`}>{i.n}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{i.t}</p>
          </div>
        ))}
      </div>
      {visibles.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-marca-oscuro"><CheckCircle2 size={18} /> Sin pendientes urgentes.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-black/[0.06] bg-white">
          {visibles.map((n, i) => {
            const q = n.estado === "AVISADO" && n.fechaAvisoCliente && -diasRestantes(n.fechaAvisoCliente) >= seguimiento
              ? { txt: `Sin pago hace ${-diasRestantes(n.fechaAvisoCliente)} días`, cls: QUE_HACER.AVISADO.cls }
              : QUE_HACER[n.estado];
            return (
              <li key={n.id} className={i ? "border-t border-black/[0.05]" : ""}>
                <Link href={`#oficio-${n.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition hover:bg-neutral-50">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold">
                      {esNuevaDeImpi(n) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" title="Nueva del IMPI" />}
                      {n.expediente.denominacion}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{n.expediente.cliente.nombre} · {TIPOS_OFICIO[n.tipo]}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${q.cls}`}>{q.txt}</span>
                  <span className="w-36 text-right"><PlazoOficio n={n} /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {atencion.length > visibles.length && <p className="mt-2 px-1 text-xs text-neutral-500">+{atencion.length - visibles.length} más en el tablero de abajo</p>}
    </section>
  );
}
