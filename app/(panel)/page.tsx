import Link from "next/link";
import { Bell, CheckCircle2, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { notificacionesActivas, vencimientos } from "@/lib/consultas";
import { DIA, diasRestantes, esNuevaDeImpi, esperandoImpi, estaVencida, siguientePlazo } from "@/lib/plazos";
import { TIPOS_OFICIO, mxn } from "@/lib/catalogos";
import { PlazoOficio } from "@/components/ui";

export const metadata = { title: "Inicio" };

// Qué hay que hacer con cada oficio, dicho en corto
const QUE_HACER: Record<string, { txt: string; cls: string }> = {
  RECIBIDA: { txt: "Avisar al cliente", cls: "bg-amber-50 text-amber-800" },
  AVISADO: { txt: "Dar seguimiento al pago", cls: "bg-sky-50 text-sky-800" },
  EN_TRABAJO: { txt: "Trabajar · vence pronto", cls: "bg-violet-50 text-violet-800" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema y presentar", cls: "bg-yellow-200 text-yellow-900" },
};

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [sesion, { error }] = await Promise.all([requerirSesion(), searchParams]);
  const hace7 = new Date(Date.now() - 7 * DIA);
  const [activas, recordatorios, cobrado, venc, cfg] = await Promise.all([
    notificacionesActivas(),
    db.recordatorio.findMany({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: new Date() } }, orderBy: { recordarEn: "asc" }, take: 3 }),
    sesion.permisos.has("ver_pagos") ? db.servicio.aggregate({ where: { fechaContratacion: { gte: hace7 } }, _sum: { pagado: true } }) : null,
    vencimientos({ desdeDias: 0, hastaDias: 30 }),
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

  const indicadores = [
    { t: "Por avisar", n: enPlazo.filter((n) => n.estado === "RECIBIDA").length, href: "/notificaciones", cls: "text-amber-700" },
    { t: "Esperando pago", n: enPlazo.filter((n) => n.estado === "AVISADO").length, href: "/notificaciones", cls: "text-sky-700" },
    { t: "Pagadas en trabajo", n: enPlazo.filter((n) => n.estado === "EN_TRABAJO" || n.estado === "PAGAR_SISTEMA").length, href: "/notificaciones", cls: "text-violet-700" },
    { t: "Vencen en 7 días", n: enPlazo.filter((n) => { const d = dias(n); return d >= 0 && d <= 7; }).length, href: "/notificaciones", cls: "text-red-600" },
  ];

  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const visibles = atencion.slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl">
      {error === "solo-admin" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">Esa sección es solo para administradores.</p>}
      {error === "sin-permiso" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">No tienes permiso para esa sección. Pídeselo al administrador.</p>}

      <p className="text-sm text-neutral-500 first-letter:uppercase">{hoy}</p>
      <h1 className="mb-6 text-3xl font-semibold tracking-tight">{saludo}, {sesion.nombre.split(" ")[0]}</h1>

      {/* Recordatorios del bloc personal que ya tocan */}
      {recordatorios.length > 0 && (
        <Link href="/notas" className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900 transition hover:bg-amber-100">
          <Bell size={18} className="shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate"><b className="font-semibold">Recordatorio:</b> {recordatorios.map((r) => r.texto).join(" · ")}</span>
          <ChevronRight size={16} className="shrink-0" />
        </Link>
      )}

      {/* 4 indicadores */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {indicadores.map((i) => (
          <Link key={i.t} href={i.href} className="card px-5 py-4 transition hover:border-black/20">
            <p className="text-xs text-neutral-500">{i.t}</p>
            <p className={`mt-1 text-3xl font-semibold tracking-tight ${i.n ? i.cls : "text-neutral-300"}`}>{i.n}</p>
          </Link>
        ))}
      </div>

      {/* Lo que requiere atención */}
      <section className="card mb-6 overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-black/5 px-5 py-4">
          <h2 className="text-base font-semibold">Lo que requiere tu atención</h2>
          {atencion.length > 0 && <span className="text-xs text-neutral-400">{atencion.length} {atencion.length === 1 ? "pendiente" : "pendientes"}</span>}
        </div>
        {visibles.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-marca-oscuro"><CheckCircle2 size={18} /> Todo al día. No hay nada urgente.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {visibles.map((n) => {
              const nueva = esNuevaDeImpi(n);
              const q = n.estado === "AVISADO" && n.fechaAvisoCliente && -diasRestantes(n.fechaAvisoCliente) >= seguimiento
                ? { txt: `Sin pago desde hace ${-diasRestantes(n.fechaAvisoCliente)} días`, cls: QUE_HACER.AVISADO.cls }
                : QUE_HACER[n.estado];
              return (
                <li key={n.id}>
                  <Link href={`/clientes/${n.expediente.clienteId}?marca=${n.expedienteId}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition hover:bg-neutral-50">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${nueva ? "bg-violet-500" : "bg-transparent"}`} title={nueva ? "Nueva del IMPI" : undefined} />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-semibold">{n.expediente.denominacion}</p>
                      <p className="truncate text-xs text-neutral-500">{n.expediente.cliente.nombre} · {TIPOS_OFICIO[n.tipo]}</p>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${q.cls}`}>{q.txt}</span>
                    <span className="w-40 text-right"><PlazoOficio n={n} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {(atencion.length > visibles.length || vencidas > 0) && (
          <div className="flex flex-wrap justify-between gap-2 border-t border-black/5 bg-neutral-50/60 px-5 py-3 text-sm">
            {atencion.length > visibles.length ? <Link href="/notificaciones" className="font-medium text-neutral-700 hover:underline">Ver las {atencion.length} en el tablero →</Link> : <span />}
            {vencidas > 0 && <Link href="/notificaciones?ver=vencidas" className="text-xs text-red-700 hover:underline">{vencidas} vencidas sin contestación registrada</Link>}
          </div>
        )}
      </section>

      {/* Resumen discreto */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 px-1 text-sm text-neutral-500">
        {cobrado && <span>Cobrado en 7 días: <b className="font-semibold text-marca-oscuro">{mxn.format(cobrado._sum.pagado ?? 0)}</b></span>}
        <Link href="/vencimientos?rango=30" className="hover:text-black">DDU y renovaciones en 30 días: <b className="font-semibold text-neutral-800">{venc.length}</b></Link>
        <Link href="/contrataciones" className="hover:text-black">Contrataciones del mes →</Link>
        <Link href="/reportes" className="hover:text-black">Reportes →</Link>
      </div>
    </div>
  );
}
