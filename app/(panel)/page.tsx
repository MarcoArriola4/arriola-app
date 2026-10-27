import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { ESTADOS_TRABAJO, TIPOS_SERVICIO, mxn } from "@/lib/catalogos";
import { diasRestantes, fechaLimiteDDU, siguientePlazo } from "@/lib/plazos";
import { vigenciaDe } from "@/lib/cumplimiento";
import { cargarInhabiles } from "@/lib/inhabiles";

export const metadata = { title: "Inicio" };

const PENDIENTES_TRABAJO = ["PENDIENTE", "VOBO", "PRESENTAR", "PAGAR_SISTEMA"];
const ACTIVAS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"];

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [sesion, { error }] = await Promise.all([requerirSesion(), searchParams]);
  const verPagos = sesion.permisos.has("ver_pagos");
  const ahora = new Date();
  const desde = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), 1));
  const hasta = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() + 1, 1));
  const desdeAnterior = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth() - 1, 1));
  const hace12m = new Date(Date.UTC(ahora.getFullYear() - 1, ahora.getMonth(), 1));

  const [recordatorios, delMes, delMesAnterior, deudas, trabajos, inhabiles] = await Promise.all([
    db.recordatorio.findMany({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: ahora } }, orderBy: { recordarEn: "asc" }, take: 3 }),
    db.servicio.findMany({ where: { fechaContratacion: { gte: desde, lt: hasta } }, select: { costo: true, pagado: true } }),
    db.servicio.count({ where: { fechaContratacion: { gte: desdeAnterior, lt: desde } } }),
    verPagos
      ? db.servicio.findMany({
          where: { costo: { gt: 0 }, estadoPago: { not: "PAGADO" }, fechaContratacion: { gte: hace12m } },
          select: { costo: true, pagado: true, expediente: { select: { clienteId: true, cliente: { select: { nombre: true } } } } },
        })
      : Promise.resolve([]),
    // Trabajos contratados que aún no se presentan
    db.servicio.findMany({
      where: { estadoTrabajo: { in: PENDIENTES_TRABAJO } },
      select: {
        id: true, tipo: true, estadoTrabajo: true, fechaContratacion: true, avance: true,
        notificacion: { select: { tipo: true, fechaLimite: true, fechaLimiteRevision: true, estado: true, pendienteNotificar: true } },
        expediente: {
          select: {
            id: true, denominacion: true, clienteId: true, fechaConcesion: true, desistio: true,
            cliente: { select: { nombre: true } },
            notificaciones: { where: { estado: { in: ACTIVAS } }, select: { tipo: true, fechaLimite: true, fechaLimiteRevision: true, estado: true, pendienteNotificar: true }, orderBy: { fechaNotificacion: "desc" }, take: 1 },
          },
        },
      },
    }),
    cargarInhabiles(),
  ]);

  // Ventas del mes
  const vendido = delMes.reduce((a, s) => a + (s.costo ?? 0), 0);
  const cobrado = delMes.reduce((a, s) => a + s.pagado, 0);

  // Quién debe (últimos 12 meses)
  const porCliente = new Map<string, { nombre: string; debe: number }>();
  for (const s of deudas) {
    const saldo = Math.max(0, (s.costo ?? 0) - s.pagado);
    if (!saldo) continue;
    const c = porCliente.get(s.expediente.clienteId) ?? { nombre: s.expediente.cliente.nombre, debe: 0 };
    c.debe += saldo;
    porCliente.set(s.expediente.clienteId, c);
  }
  const deudores = [...porCliente.entries()].sort((a, b) => b[1].debe - a[1].debe);
  const totalDeuda = deudores.reduce((a, [, c]) => a + c.debe, 0);

  // Trabajos por presentar: con fecha límite (contestaciones, DDU, renovaciones) o con días desde que se contrató
  const lista = trabajos
    .filter((s) => !s.expediente.desistio)
    .map((s) => {
      const oficio = s.notificacion && ACTIVAS.includes(s.notificacion.estado) ? s.notificacion : s.tipo === "CONTESTACION" ? s.expediente.notificaciones[0] ?? null : null;
      let limite: Date | null = null;
      if (oficio && !oficio.pendienteNotificar) limite = siguientePlazo(oficio).fecha;
      else if (s.tipo === "DDU" && s.expediente.fechaConcesion) limite = fechaLimiteDDU(s.expediente.fechaConcesion, inhabiles);
      else if (s.tipo === "RENOVACION" && s.expediente.fechaConcesion) limite = vigenciaDe(s.expediente.fechaConcesion);
      const dias = limite ? diasRestantes(limite) : null;
      const desdeContrato = s.fechaContratacion ? -diasRestantes(s.fechaContratacion) : null;
      return { ...s, limite, dias, desdeContrato };
    })
    // Fuera lo viejo del Excel que nunca se actualizó: con fecha límite vencida hace más de 30 días o contratado hace más de un año
    .filter((s) => (s.dias != null ? s.dias >= -30 : s.desdeContrato != null && s.desdeContrato <= 365))
    .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999) || (b.desdeContrato ?? 0) - (a.desdeContrato ?? 0));
  const venceProximo = lista.filter((s) => s.dias != null && s.dias <= 15).length;

  const h = ahora.getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const hoy = ahora.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const nombreMes = desde.toLocaleDateString("es-MX", { month: "long", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-5xl pt-2">
      {error === "solo-admin" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">Esa sección es solo para administradores.</p>}
      {error === "sin-permiso" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">No tienes permiso para esa sección. Pídeselo al administrador.</p>}

      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400 first-letter:uppercase">{hoy}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-carbon">{saludo}, {sesion.nombre.split(" ")[0]}</h1>
        <p className="mt-1.5 text-[15px] text-neutral-500">
          {venceProximo
            ? `${venceProximo} ${venceProximo === 1 ? "trabajo contratado vence" : "trabajos contratados vencen"} en los próximos 15 días.`
            : lista.length
              ? `${lista.length} trabajos contratados por presentar; ninguno vence en los próximos 15 días.`
              : "No hay trabajos contratados pendientes de presentar."}
        </p>
      </header>

      {recordatorios.length > 0 && (
        <Link href="/notas" className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-50">
          <Bell size={16} className="shrink-0 text-amber-600" />
          <span className="min-w-0 flex-1 truncate">{recordatorios.map((r) => r.texto).join(" · ")}</span>
          <ArrowRight size={15} className="shrink-0 opacity-60" />
        </Link>
      )}

      {/* Resumen del mes */}
      <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500 first-letter:uppercase">Resumen de {nombreMes}</h2>
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Link href="/contrataciones" className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4 transition hover:border-black/15">
          <p className="text-xs text-neutral-500">Ventas del mes</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{delMes.length}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {verPagos && <>{mxn.format(vendido)} vendido · </>}
            {delMes.length >= delMesAnterior ? "▲" : "▼"} {delMesAnterior} el mes pasado
          </p>
        </Link>
        {verPagos && (
          <Link href="/contrataciones" className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4 transition hover:border-black/15">
            <p className="text-xs text-neutral-500">Cobrado este mes</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-marca-oscuro">{mxn.format(cobrado)}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{vendido ? `${Math.round((cobrado / vendido) * 100)}% de lo vendido` : "Sin ventas aún"}</p>
          </Link>
        )}
        {verPagos && (
          <Link href="/pagos?estado=pendientes" className="rounded-2xl border border-black/[0.06] bg-white px-5 py-4 transition hover:border-black/15">
            <p className="text-xs text-neutral-500">Te deben (últimos 12 meses)</p>
            <p className={`mt-1 text-3xl font-semibold tracking-tight ${totalDeuda ? "text-red-600" : "text-neutral-300"}`}>{mxn.format(totalDeuda)}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{deudores.length} {deudores.length === 1 ? "cliente" : "clientes"} con saldo</p>
          </Link>
        )}
      </div>

      <div className={`grid gap-6 ${verPagos && deudores.length ? "lg:grid-cols-[minmax(0,1fr)_300px]" : ""}`}>
        {/* Trabajos contratados por presentar */}
        <section>
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">Contratado y sin presentar</h2>
            <Link href="/contrataciones?vista=todo" className="text-sm text-neutral-500 hover:text-black">Ver todo →</Link>
          </div>
          {lista.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-black/[0.06] bg-white px-4 py-12 text-sm text-marca-oscuro"><CheckCircle2 size={18} /> Todo lo contratado ya se presentó.</div>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {lista.slice(0, 8).map((s, i) => {
                const urgente = s.dias != null && s.dias <= 7;
                const pronto = s.dias != null && s.dias <= 30;
                return (
                  <li key={s.id} className={i ? "border-t border-black/[0.05]" : ""}>
                    <Link href={`/clientes/${s.expediente.clienteId}?marca=${s.expediente.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-neutral-50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{s.expediente.denominacion}</p>
                        <p className="truncate text-xs text-neutral-500">{s.expediente.cliente.nombre} · {TIPOS_SERVICIO[s.tipo] ?? s.tipo}</p>
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADOS_TRABAJO[s.estadoTrabajo!]?.cls ?? ""}`}>{ESTADOS_TRABAJO[s.estadoTrabajo!]?.txt}</span>
                      <span className={`text-right text-xs font-medium ${urgente ? "text-red-600" : pronto ? "text-amber-700" : "text-neutral-500"}`}>
                        {s.dias != null
                          ? s.dias < 0 ? `Venció hace ${-s.dias} días` : s.dias === 0 ? "Vence hoy" : `Vence en ${s.dias} días`
                          : s.desdeContrato != null ? `Contratado hace ${s.desdeContrato} días` : "—"}
                      </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {lista.length > 8 && <p className="mt-2 px-1 text-xs text-neutral-500">+{lista.length - 8} trabajos más por presentar</p>}
        </section>

        {/* Quién debe */}
        {verPagos && deudores.length > 0 && (
          <section>
            <h2 className="mb-3 px-1 text-sm font-semibold uppercase tracking-[0.12em] text-neutral-500">Quién debe</h2>
            <ul className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white">
              {deudores.slice(0, 6).map(([id, c], i) => (
                <li key={id} className={i ? "border-t border-black/[0.05]" : ""}>
                  <Link href={`/clientes/${id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-neutral-50">
                    <span className="min-w-0 truncate">{c.nombre}</span>
                    <span className="shrink-0 font-semibold text-red-600">{mxn.format(c.debe)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {deudores.length > 6 && <p className="mt-2 px-1 text-xs text-neutral-500">+{deudores.length - 6} clientes más</p>}
          </section>
        )}
      </div>
    </div>
  );
}
