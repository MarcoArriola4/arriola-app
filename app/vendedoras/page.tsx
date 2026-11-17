import Image from "next/image";
import Link from "next/link";
import { BellRing, LogOut, PhoneCall } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CONTACTOS_POR_DIA, diaMx, fmtMx, rangoDia, requerirVendedora } from "@/lib/vendedoras";
import { salirVendedora } from "./actions";
import { AgregarContacto, Avisos, TarjetaLead, type LeadVista } from "./componentes";

export const metadata = { title: "Panel Vendedoras" };
export const dynamic = "force-dynamic";

const ABIERTOS = { notIn: ["VENDIDO", "NO_INTERESA"] };

export default async function PanelVendedoras({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const v = await requerirVendedora();
  const { ver = "hoy", q } = await searchParams;
  const ahora = new Date();
  const { inicio, fin } = rangoDia(diaMx(ahora));
  const mias = { vendedoraId: v.id };

  const [asignadosHoy, llamadasHoy, vencidos, proximos, atrasados] = await Promise.all([
    db.lead.findMany({ where: { ...mias, asignadoEl: { gte: inicio, lt: fin } }, orderBy: { creado: "asc" } }),
    db.llamada.findMany({ where: { ...mias, fecha: { gte: inicio, lt: fin } }, select: { contesto: true, cotizacion: true, leadId: true } }),
    db.lead.findMany({ where: { ...mias, estado: ABIERTOS, volverLlamar: { lte: ahora } }, orderBy: { volverLlamar: "asc" } }),
    db.lead.findMany({ where: { ...mias, estado: ABIERTOS, volverLlamar: { gt: ahora } }, orderBy: { volverLlamar: "asc" } }),
    db.lead.findMany({ where: { ...mias, estado: "PENDIENTE", asignadoEl: { lt: inicio } }, orderBy: { asignadoEl: "asc" } }),
  ]);

  let lista: { titulo: string; ayuda?: string; leads: typeof asignadosHoy }[] = [];
  if (ver === "hoy") {
    lista = [
      { titulo: "Volver a llamar · ya es hora", ayuda: "Recordatorios cuya fecha ya llegó", leads: vencidos },
      { titulo: "Contactos de hoy por llamar", leads: asignadosHoy.filter((l) => l.estado === "PENDIENTE") },
      { titulo: "Pendientes de días anteriores", ayuda: "Asignados antes y todavía sin llamar", leads: atrasados },
      { titulo: "Ya llamados hoy", leads: asignadosHoy.filter((l) => l.estado !== "PENDIENTE" && !vencidos.some((x) => x.id === l.id)) },
    ];
  } else if (ver === "recordatorios") {
    lista = [{ titulo: "Próximos recordatorios", ayuda: "Ordenados por fecha", leads: proximos }];
  } else if (ver === "seguimiento") {
    const seguimiento = await db.lead.findMany({ where: { ...mias, estado: { in: ["CONTESTO", "COTIZACION", "VOLVER"] } }, orderBy: { ultimaLlamada: "desc" } });
    lista = [{ titulo: "En seguimiento", ayuda: "Interesados, con cotización o por volver a llamar", leads: seguimiento }];
  } else {
    const t = q?.trim();
    const where: Prisma.LeadWhereInput = { ...mias, ...(t && { OR: [{ nombre: { contains: t, mode: "insensitive" } }, { telefono: { contains: t } }, { comentario: { contains: t, mode: "insensitive" } }] }) };
    lista = [{ titulo: t ? `Resultados para “${t}”` : "Todos mis contactos", leads: await db.lead.findMany({ where, orderBy: { actualizado: "desc" }, take: 200 }) }];
  }

  const vista = (l: (typeof asignadosHoy)[number]): LeadVista => ({
    id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email, nota: l.nota, estado: l.estado, cotizacion: l.cotizacion, comentario: l.comentario,
    volverLlamar: l.volverLlamar?.toISOString() ?? null, ultimaLlamada: l.ultimaLlamada?.toISOString() ?? null, intentos: l.intentos, asignadoEl: l.asignadoEl.toISOString(), propio: l.propio,
  });

  const llamadas = llamadasHoy.length;
  const contestaron = llamadasHoy.filter((x) => x.contesto).length;
  const cotizaciones = llamadasHoy.filter((x) => x.cotizacion).length;
  const llamadosHoy = new Set(llamadasHoy.map((x) => x.leadId)).size;
  const meta = Math.max(asignadosHoy.length, CONTACTOS_POR_DIA);
  const pct = Math.min(100, Math.round((llamadosHoy / meta) * 100));
  const tabs = [
    { id: "hoy", txt: "Hoy", n: vencidos.length + asignadosHoy.filter((l) => l.estado === "PENDIENTE").length + atrasados.length },
    { id: "recordatorios", txt: "Recordatorios", n: proximos.length },
    { id: "seguimiento", txt: "Seguimiento" },
    { id: "todos", txt: "Todos" },
  ];

  return (
    <div className="min-h-screen bg-fondo">
      <header className="sticky top-0 z-30 bg-carbon text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-28" priority />
          <span className="hidden rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-marca sm:inline">Panel Vendedoras</span>
          <span className="ml-auto truncate text-sm text-white/80">{v.nombre}</span>
          <form action={salirVendedora}>
            <button className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-xs text-white/80 hover:bg-white/15"><LogOut size={14} aria-hidden /> Salir</button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="font-titulo text-3xl font-semibold tracking-tight text-carbon">Hola, {v.nombre.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-neutral-500 first-letter:uppercase">{ahora.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "long", day: "numeric", month: "long" })}</p>

        {/* Avance del día */}
        <section className="card mt-5 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold">Avance de hoy: {llamadosHoy} de {meta} contactos llamados</p>
            <span className="cifra text-sm font-semibold text-marca-oscuro">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-marca transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { t: "Llamadas hechas", n: llamadas },
              { t: "Contestaron", n: contestaron },
              { t: "Cotizaciones enviadas", n: cotizaciones },
              { t: "Recordatorios pendientes", n: vencidos.length + proximos.length },
            ].map((x) => (
              <div key={x.t} className="rounded-xl bg-black/[0.03] px-3 py-2.5">
                <p className="cifra text-2xl font-semibold">{x.n}</p>
                <p className="text-xs text-neutral-500">{x.t}</p>
              </div>
            ))}
          </div>
        </section>

        {vencidos.length > 0 && (
          <Link href="/vendedoras?ver=hoy" className="mt-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <BellRing size={18} className="shrink-0 text-amber-600" aria-hidden />
            <span><b>{vencidos.length}</b> {vencidos.length === 1 ? "contacto espera" : "contactos esperan"} tu llamada ahora (recordatorio). El primero: {vencidos[0].nombre} · {fmtMx(vencidos[0].volverLlamar!)}</span>
          </Link>
        )}

        <Avisos proximos={proximos.slice(0, 50).map((l) => ({ id: l.id, nombre: l.nombre, cuando: l.volverLlamar!.toISOString() }))} />

        {/* Pestañas */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-black/[0.05] p-1" role="tablist">
            {tabs.map((t) => (
              <Link key={t.id} href={`/vendedoras?ver=${t.id}`} role="tab" aria-selected={ver === t.id} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${ver === t.id ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500 hover:text-carbon"}`}>
                {t.txt}{t.n != null && t.n > 0 && <span className="cifra ml-1 opacity-60">{t.n}</span>}
              </Link>
            ))}
          </div>
          {ver === "todos" && (
            <form className="flex flex-1 gap-2" role="search">
              <input type="hidden" name="ver" value="todos" />
              <input name="q" defaultValue={q} placeholder="Buscar nombre, teléfono o comentario" aria-label="Buscar contactos" className="input min-h-10 max-w-xs" />
              <button className="btn min-h-10">Buscar</button>
            </form>
          )}
          <div className="ml-auto"><AgregarContacto /></div>
        </div>

        {lista.map((g) => (
          <section key={g.titulo} className="mt-6">
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2 className="rotulo">{g.titulo} <span className="text-neutral-400">· {g.leads.length}</span></h2>
              {g.ayuda && <span className="text-xs text-neutral-400">{g.ayuda}</span>}
            </div>
            {g.leads.length === 0 ? (
              <p className="card px-4 py-6 text-center text-sm text-neutral-500"><PhoneCall size={16} className="mx-auto mb-1 text-neutral-300" aria-hidden />Nada aquí por ahora.</p>
            ) : (
              <ul className="space-y-2">{g.leads.map((l) => <TarjetaLead key={l.id} l={vista(l)} />)}</ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
