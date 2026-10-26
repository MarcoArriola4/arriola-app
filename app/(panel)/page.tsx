import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { notificacionesActivas } from "@/lib/consultas";
import { diasRestantes, esNuevaDeImpi, esperandoImpi, estaVencida, siguientePlazo } from "@/lib/plazos";
import { TIPOS_OFICIO } from "@/lib/catalogos";
import { PlazoOficio } from "@/components/ui";

export const metadata = { title: "Inicio" };

// Qué hay que hacer con cada oficio, dicho en corto
const QUE_HACER: Record<string, { txt: string; cls: string }> = {
  RECIBIDA: { txt: "Avisar al cliente", cls: "bg-amber-50 text-amber-800" },
  AVISADO: { txt: "Dar seguimiento al pago", cls: "bg-sky-50 text-sky-800" },
  EN_TRABAJO: { txt: "Pagado · trabajar ya", cls: "bg-violet-50 text-violet-800" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema y presentar", cls: "bg-yellow-200 text-yellow-900" },
};

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [sesion, { error }] = await Promise.all([requerirSesion(), searchParams]);
  const [activas, recordatorios, cfg] = await Promise.all([
    notificacionesActivas(),
    db.recordatorio.findMany({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: new Date() } }, orderBy: { recordarEn: "asc" }, take: 3 }),
    db.configuracion.findUnique({ where: { id: "main" }, select: { diasSeguimientoPago: true } }),
  ]);

  const enPlazo = activas.filter((n) => !estaVencida(n) && !esperandoImpi(n));
  const vencidas = activas.filter((n) => estaVencida(n)).length;
  const dias = (n: (typeof activas)[number]) => (n.pendienteNotificar ? 9999 : diasRestantes(siguientePlazo(n).fecha));
  const seguimiento = cfg?.diasSeguimientoPago ?? 5;

  // Lo que requiere atención: por avisar, cobros sin respuesta hace días y lo ya pagado que vence esta semana
  const atencion = enPlazo
    .filter((n) =>
      n.estado === "RECIBIDA" ||
      (n.estado === "AVISADO" && (dias(n) <= 15 || (n.fechaAvisoCliente && -diasRestantes(n.fechaAvisoCliente) >= seguimiento))) ||
      ((n.estado === "EN_TRABAJO" || n.estado === "PAGAR_SISTEMA") && dias(n) <= 7)
    )
    .sort((a, b) => Number(esNuevaDeImpi(b)) - Number(esNuevaDeImpi(a)) || dias(a) - dias(b));

  const porAvisar = enPlazo.filter((n) => n.estado === "RECIBIDA").length;
  const esperandoPago = enPlazo.filter((n) => n.estado === "AVISADO").length;
  const semana = enPlazo.filter((n) => { const d = dias(n); return d >= 0 && d <= 7; }).length;

  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const visibles = atencion.slice(0, 6);
  const frase =
    atencion.length === 0
      ? "Todo está al día. No hay pendientes urgentes."
      : `${atencion.length} ${atencion.length === 1 ? "asunto requiere" : "asuntos requieren"} tu atención${semana ? `; ${semana} ${semana === 1 ? "vence" : "vencen"} esta semana` : ""}.`;

  return (
    <div className="mx-auto max-w-4xl pt-2">
      {error === "solo-admin" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">Esa sección es solo para administradores.</p>}
      {error === "sin-permiso" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">No tienes permiso para esa sección. Pídeselo al administrador.</p>}

      {/* Saludo y resumen en una frase */}
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400 first-letter:uppercase">{hoy}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-carbon">{saludo}, {sesion.nombre.split(" ")[0]}</h1>
        <p className="mt-1.5 text-[15px] text-neutral-500">{frase}</p>
      </header>

      {recordatorios.length > 0 && (
        <Link href="/notas" className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-50">
          <Bell size={16} className="shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate">{recordatorios.map((r) => r.texto).join(" · ")}</span>
          <ArrowRight size={15} className="shrink-0 opacity-60" />
        </Link>
      )}

      {/* Tres números clave */}
      <div className="mb-8 grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
        {[
          { t: "Por avisar al cliente", n: porAvisar, cls: "text-amber-600" },
          { t: "Esperando pago", n: esperandoPago, cls: "text-sky-700" },
          { t: "Vencen esta semana", n: semana, cls: "text-red-600" },
        ].map((i) => (
          <Link key={i.t} href="/notificaciones" className="px-5 py-5 transition hover:bg-neutral-50 sm:px-6">
            <p className={`text-4xl font-semibold tracking-tight ${i.n ? i.cls : "text-neutral-300"}`}>{i.n}</p>
            <p className="mt-1 text-xs text-neutral-500 sm:text-sm">{i.t}</p>
          </Link>
        ))}
      </div>

      {/* Prioridades */}
      <section>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">Prioridades</h2>
          <Link href="/notificaciones" className="text-sm text-neutral-500 hover:text-black">Ver tablero →</Link>
        </div>
        {visibles.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-black/[0.06] bg-white px-4 py-14 text-sm text-marca-oscuro"><CheckCircle2 size={18} /> Sin pendientes urgentes.</div>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
            {visibles.map((n, i) => {
              const q = n.estado === "AVISADO" && n.fechaAvisoCliente && -diasRestantes(n.fechaAvisoCliente) >= seguimiento
                ? { txt: `Sin pago hace ${-diasRestantes(n.fechaAvisoCliente)} días`, cls: QUE_HACER.AVISADO.cls }
                : QUE_HACER[n.estado];
              return (
                <li key={n.id} className={i ? "border-t border-black/[0.05]" : ""}>
                  <Link href={`/clientes/${n.expediente.clienteId}?marca=${n.expedienteId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 transition hover:bg-neutral-50">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="flex items-center gap-2 truncate text-[15px] font-semibold text-carbon">
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
        {(atencion.length > visibles.length || vencidas > 0) && (
          <p className="mt-3 flex flex-wrap justify-between gap-2 px-1 text-xs text-neutral-500">
            {atencion.length > visibles.length ? <Link href="/notificaciones" className="hover:text-black">+{atencion.length - visibles.length} más en el tablero</Link> : <span />}
            {vencidas > 0 && <Link href="/notificaciones?ver=vencidas" className="text-red-600 hover:underline">{vencidas} vencidas sin contestación registrada</Link>}
          </p>
        )}
      </section>
    </div>
  );
}
