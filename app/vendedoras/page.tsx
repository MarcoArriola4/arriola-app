import Image from "next/image";
import Link from "next/link";
import { BellRing, LogOut, PhoneCall } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CERRADOS, CONTACTOS_POR_DIA, diaMx, fmtMx, rangoDia, requerirVendedora } from "@/lib/vendedoras";
import { conteoOficial } from "@/lib/ventas-vendedoras";
import { salirVendedora } from "./actions";
import { AgregarContacto, Avisos, MisVentas, ReportarVenta, TarjetaLead, type LeadVista, type VentaPropia } from "./componentes";

export const metadata = { title: "Panel Vendedoras" };
export const dynamic = "force-dynamic";

const ABIERTOS = { notIn: CERRADOS };
const SERVICIO_TXT: Record<string, string> = { REGISTRO: "Registro", CONTESTACION: "Contestación", DDU: "Declaración de uso", RENOVACION: "Renovación", TITULO: "Título", OTRO: "Otro" };

// Filtro de estado del historial (información ordenada: quién contestó, por dónde y qué pasó)
const FILTROS: { id: string; txt: string; where: Prisma.LeadWhereInput }[] = [
  { id: "", txt: "Todos", where: {} },
  { id: "PENDIENTE", txt: "Por llamar", where: { estado: "PENDIENTE" } },
  { id: "NO_CONTESTO", txt: "No contestó · WhatsApp sin respuesta", where: { estado: "NO_CONTESTO" } },
  { id: "LLAMADA", txt: "Contestaron por llamada", where: { contestoPor: "LLAMADA" } },
  { id: "WHATSAPP", txt: "Respondieron WhatsApp", where: { contestoPor: "WHATSAPP" } },
  { id: "CONTESTO", txt: "Interesados", where: { estado: "CONTESTO" } },
  { id: "COTIZACION", txt: "Cotización enviada", where: { estado: "COTIZACION" } },
  { id: "VOLVER", txt: "Volver a contactar", where: { estado: "VOLVER" } },
  { id: "VENTA", txt: "Venta en revisión", where: { ventas: { some: { estado: { in: ["PENDIENTE", "APROBANDO"] } } } } },
  { id: "VENDIDO", txt: "Vendidos", where: { estado: "VENDIDO" } },
  { id: "NO_INTERESA", txt: "No le interesa", where: { estado: "NO_INTERESA" } },
  { id: "SIN_CONTACTO", txt: "Sin WhatsApp · no se pudo contactar", where: { estado: "SIN_CONTACTO" } },
];

type Params = { ver?: string; q?: string; estado?: string; desde?: string; hasta?: string; por?: string; mes?: string };

export default async function PanelVendedoras({ searchParams }: { searchParams: Promise<Params> }) {
  const v = await requerirVendedora();
  const sp = await searchParams;
  const ver = sp.ver === "todos" || sp.ver === "contestaron" ? "historial" : (sp.ver ?? "hoy");
  const ahora = new Date();
  const { inicio, fin } = rangoDia(diaMx(ahora));
  const mias = { vendedoraId: v.id };

  const [asignadosHoy, llamadasHoy, vencidos, proximos, atrasados, ventasEnRevision] = await Promise.all([
    db.lead.findMany({ where: { ...mias, asignadoEl: { gte: inicio, lt: fin } }, orderBy: { creado: "asc" } }),
    db.llamada.findMany({ where: { ...mias, fecha: { gte: inicio, lt: fin } }, select: { contesto: true, cotizacion: true, leadId: true, canal: true } }),
    db.lead.findMany({ where: { ...mias, estado: ABIERTOS, volverLlamar: { lte: ahora } }, orderBy: { volverLlamar: "asc" } }),
    db.lead.findMany({ where: { ...mias, estado: ABIERTOS, volverLlamar: { gt: ahora } }, orderBy: { volverLlamar: "asc" } }),
    db.lead.findMany({ where: { ...mias, estado: "PENDIENTE", asignadoEl: { lt: inicio } }, orderBy: { asignadoEl: "asc" } }),
    db.ventaVendedora.count({ where: { ...mias, estado: { in: ["PENDIENTE", "APROBANDO"] } } }),
  ]);

  type L = (typeof asignadosHoy)[number];
  let lista: { titulo: string; ayuda?: string; leads: L[] }[] = [];
  let conteos: Map<string, number> | null = null;
  let ventasVista: { mes: string; nombreMes: string; anterior: string; siguiente: string; oficial: Awaited<ReturnType<typeof conteoOficial>>; revision: VentaPropia[]; aprobadas: VentaPropia[] } | null = null;

  if (ver === "hoy") {
    lista = [
      { titulo: "Volver a contactar · ya es hora", ayuda: "Recordatorios cuya fecha ya llegó", leads: vencidos },
      { titulo: "Contactos de hoy por llamar", leads: asignadosHoy.filter((l) => l.estado === "PENDIENTE") },
      { titulo: "Pendientes de días anteriores", ayuda: "Asignados antes y todavía sin llamar", leads: atrasados },
      { titulo: "Ya trabajados hoy", leads: asignadosHoy.filter((l) => l.estado !== "PENDIENTE" && !vencidos.some((x) => x.id === l.id)) },
    ];
  } else if (ver === "recordatorios") {
    lista = [{ titulo: "Próximos recordatorios", ayuda: "Ordenados por fecha", leads: proximos }];
  } else if (ver === "seguimiento") {
    const [seguimiento, esperando] = await Promise.all([
      db.lead.findMany({ where: { ...mias, estado: { in: ["CONTESTO", "COTIZACION", "VOLVER"] } }, orderBy: { ultimaLlamada: "desc" } }),
      db.lead.findMany({ where: { ...mias, estado: "NO_CONTESTO", canal: "WHATSAPP" }, orderBy: { ultimaLlamada: "desc" }, take: 200 }),
    ]);
    lista = [
      { titulo: "En seguimiento", ayuda: "Interesados, con cotización o por volver a contactar", leads: seguimiento },
      { titulo: "WhatsApp enviado · esperando respuesta", ayuda: "Cuando te contesten, usa «Ya respondió el WhatsApp»", leads: esperando },
    ];
  } else if (ver === "historial") {
    // Historial completo con filtros: estado, búsqueda (nombre, expediente, teléfono, marca) y fechas
    const t = sp.q?.trim();
    const porContacto = sp.por === "contacto";
    const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);
    const desde = valida(sp.desde);
    const hasta = valida(sp.hasta);
    const rango = desde || hasta ? { ...(desde && { gte: rangoDia(desde).inicio }), ...(hasta && { lt: rangoDia(hasta).fin }) } : undefined;
    const base: Prisma.LeadWhereInput = {
      ...mias,
      ...(rango && (porContacto ? { llamadas: { some: { fecha: rango } } } : { asignadoEl: rango })),
      ...(t && { OR: [{ nombre: { contains: t, mode: "insensitive" } }, { telefono: { contains: t.replace(/\s/g, "") } }, { telefono: { contains: t } }, { expediente: { contains: t } }, { marca: { contains: t, mode: "insensitive" } }] }),
    };
    const filtro = FILTROS.find((f) => f.id === (sp.estado ?? "")) ?? FILTROS[0];
    const [leads, ...cuentas] = await Promise.all([
      db.lead.findMany({ where: { AND: [base, filtro.where] }, orderBy: porContacto ? [{ ultimaLlamada: { sort: "desc", nulls: "last" } }] : [{ asignadoEl: "desc" }, { creado: "asc" }], take: 300 }),
      ...FILTROS.map((f) => db.lead.count({ where: { AND: [base, f.where] } })),
    ]);
    conteos = new Map(FILTROS.map((f, i) => [f.id, cuentas[i]]));
    lista = [{ titulo: `${filtro.txt}${t ? ` · “${t}”` : ""}`, ayuda: leads.length === 300 ? "Se muestran los 300 más recientes; usa los filtros para acotar" : undefined, leads }];
  } else if (ver === "ventas") {
    // Mis ventas: conteo oficial (Contrataciones) del mes y las ventas que reportó
    const mesMx = diaMx(ahora).slice(0, 7);
    const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : mesMx;
    const [y, m] = mes.split("-").map(Number);
    const desde = new Date(Date.UTC(y, m - 1, 1));
    const hasta = new Date(Date.UTC(y, m, 1));
    const clave = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const nombreVentas = (await db.vendedora.findUnique({ where: { id: v.id }, select: { nombreVentas: true } }))?.nombreVentas ?? v.nombre.split(" ")[0];
    const [oficial, revision, aprobadas] = await Promise.all([
      conteoOficial(nombreVentas, desde, hasta),
      db.ventaVendedora.findMany({ where: { ...mias, estado: { in: ["PENDIENTE", "APROBANDO", "RECHAZADA"] } }, orderBy: { creado: "desc" } }),
      db.ventaVendedora.findMany({ where: { ...mias, estado: "APROBADA", fechaCobro: { gte: desde, lt: hasta } }, orderBy: { fechaCobro: "desc" } }),
    ]);
    const propia = (x: (typeof revision)[number]): VentaPropia => ({
      id: x.id, estado: x.estado, motivo: x.motivoRechazo, creado: x.creado.toISOString(), revisadoEl: x.revisadoEl?.toISOString() ?? null,
      datos: {
        clienteNombre: x.clienteNombre, telefono: x.telefono ?? "", email: x.email ?? "", servicio: x.servicio, denominacion: x.denominacion ?? "",
        numeroExpediente: x.numeroExpediente ?? "", pagado: String(x.pagado), debe: String(x.debe), fechaCobro: x.fechaCobro.toISOString().slice(0, 10), banco: x.banco ?? "", notas: x.notas ?? "",
      },
    });
    ventasVista = {
      mes, nombreMes: desde.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }),
      anterior: clave(new Date(Date.UTC(y, m - 2, 1))), siguiente: clave(hasta), oficial, revision: revision.map(propia), aprobadas: aprobadas.map(propia),
    };
  }

  // Registros (llamadas y WhatsApp) y venta reportada de los contactos que se muestran
  const ids = [...new Set(lista.flatMap((g) => g.leads.map((l) => l.id)))];
  const [registros, ventasLeads] = ids.length
    ? await Promise.all([
        db.llamada.findMany({ where: { ...mias, leadId: { in: ids } }, orderBy: { fecha: "desc" } }),
        db.ventaVendedora.findMany({ where: { ...mias, leadId: { in: ids } }, orderBy: { creado: "desc" }, select: { leadId: true, estado: true, motivoRechazo: true } }),
      ])
    : [[], []];
  const vista = (l: L): LeadVista => {
    const venta = ventasLeads.find((x) => x.leadId === l.id);
    return {
      id: l.id, nombre: l.nombre, telefono: l.telefono, email: l.email, nota: l.nota, estado: l.estado, cotizacion: l.cotizacion, comentario: l.comentario,
      marca: l.marca, expediente: l.expediente, estatus: l.estatus, observaciones: l.observaciones,
      volverLlamar: l.volverLlamar?.toISOString() ?? null, ultimaLlamada: l.ultimaLlamada?.toISOString() ?? null, intentos: l.intentos, asignadoEl: l.asignadoEl.toISOString(), propio: l.propio,
      canal: l.canal, contestoPor: l.contestoPor,
      registros: registros.filter((r) => r.leadId === l.id).map((r) => ({
        id: r.id, fecha: r.fecha.toISOString(), canal: r.canal, resultado: r.resultado, comentario: r.comentario, cotizacion: r.cotizacion,
        volverLlamar: r.volverLlamar?.toISOString() ?? null, editado: r.editado?.toISOString() ?? null,
      })),
      venta: venta ? { estado: venta.estado, motivo: venta.motivoRechazo } : null,
    };
  };

  const llamadas = llamadasHoy.filter((x) => x.canal !== "WHATSAPP").length;
  const whats = llamadasHoy.length - llamadas;
  const contestaron = llamadasHoy.filter((x) => x.contesto && x.canal !== "WHATSAPP").length;
  const respondieron = llamadasHoy.filter((x) => x.contesto && x.canal === "WHATSAPP").length;
  const cotizaciones = llamadasHoy.filter((x) => x.cotizacion).length;
  const llamadosHoy = new Set(llamadasHoy.map((x) => x.leadId)).size;
  const meta = Math.max(asignadosHoy.length, CONTACTOS_POR_DIA);
  const pct = Math.min(100, Math.round((llamadosHoy / meta) * 100));
  const tabs = [
    { id: "hoy", txt: "Hoy", n: vencidos.length + asignadosHoy.filter((l) => l.estado === "PENDIENTE").length + atrasados.length },
    { id: "recordatorios", txt: "Recordatorios", n: proximos.length },
    { id: "seguimiento", txt: "Seguimiento" },
    { id: "historial", txt: "Historial" },
    { id: "ventas", txt: "Mis ventas", n: ventasEnRevision },
  ];
  const urlHistorial = (p: Partial<Params>) => {
    const q = new URLSearchParams(Object.entries({ ver: "historial", q: sp.q, estado: sp.estado, desde: sp.desde, hasta: sp.hasta, por: sp.por, ...p }).filter(([, x]) => x) as [string, string][]);
    return `/vendedoras?${q}`;
  };
  const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

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
            <p className="text-sm font-semibold">Avance de hoy: {llamadosHoy} de {meta} contactos trabajados</p>
            <span className="cifra text-sm font-semibold text-marca-oscuro">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]"><div className="h-full rounded-full bg-marca transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { t: "Llamadas hechas", n: llamadas },
              { t: "Contestaron la llamada", n: contestaron },
              { t: "WhatsApp enviados", n: whats },
              { t: "Respondieron WhatsApp", n: respondieron },
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
            <span><b>{vencidos.length}</b> {vencidos.length === 1 ? "contacto espera" : "contactos esperan"} que los contactes ahora (recordatorio). El primero: {vencidos[0].nombre} · {fmtMx(vencidos[0].volverLlamar!)}</span>
          </Link>
        )}

        <Avisos proximos={proximos.slice(0, 50).map((l) => ({ id: l.id, nombre: l.nombre, cuando: l.volverLlamar!.toISOString() }))} />

        {/* Pestañas */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-black/[0.05] p-1" role="tablist">
            {tabs.map((t) => (
              <Link key={t.id} href={`/vendedoras?ver=${t.id}`} role="tab" aria-selected={ver === t.id} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${ver === t.id ? "bg-white text-carbon shadow-tarjeta" : "text-neutral-500 hover:text-carbon"}`}>
                {t.txt}{t.n != null && t.n > 0 && <span className="cifra ml-1 opacity-60">{t.n}</span>}
              </Link>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            {ver === "ventas" && <ReportarVenta />}
            <AgregarContacto />
          </div>
        </div>

        {/* Filtros del historial */}
        {ver === "historial" && conteos && (
          <section className="card mt-4 space-y-3 p-4">
            <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end" role="search">
              <input type="hidden" name="ver" value="historial" />
              {sp.estado && <input type="hidden" name="estado" value={sp.estado} />}
              <label className="block"><span className="label">Buscar</span><input name="q" defaultValue={sp.q} placeholder="Nombre, expediente o teléfono" className="input min-h-10" /></label>
              <label className="block">
                <span className="label">Fechas de</span>
                <select name="por" defaultValue={sp.por ?? "asignado"} className="input min-h-10">
                  <option value="asignado">Cuando se me asignó</option>
                  <option value="contacto">Cuando lo contacté</option>
                </select>
              </label>
              <label className="block"><span className="label">Desde</span><input type="date" name="desde" defaultValue={sp.desde} className="input min-h-10" /></label>
              <label className="block"><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={sp.hasta} className="input min-h-10" /></label>
              <div className="flex gap-2">
                <button className="btn-primario min-h-10">Filtrar</button>
                {(sp.q || sp.desde || sp.hasta || sp.estado) && <Link href="/vendedoras?ver=historial" className="btn min-h-10">Limpiar</Link>}
              </div>
            </form>
            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por estado">
              {FILTROS.map((f) => {
                const activo = (sp.estado ?? "") === f.id;
                return (
                  <Link key={f.id || "todos"} href={urlHistorial({ estado: f.id || undefined })} aria-current={activo ? "true" : undefined}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 transition ${activo ? "bg-carbon text-white ring-carbon" : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}>
                    {f.txt} <span className="cifra opacity-60">{conteos!.get(f.id) ?? 0}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Mis ventas */}
        {ventasVista && (
          <>
            <section className="card mt-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold first-letter:uppercase">Mis ventas de {ventasVista.nombreMes}</h2>
                <span className="ml-auto flex items-center gap-1">
                  <Link href={`/vendedoras?ver=ventas&mes=${ventasVista.anterior}`} className="btn min-h-9 px-2 text-xs">← Anterior</Link>
                  <Link href={`/vendedoras?ver=ventas&mes=${ventasVista.siguiente}`} className="btn min-h-9 px-2 text-xs">Siguiente →</Link>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { t: "Ventas (sin títulos)", n: ventasVista.oficial.ventas },
                  { t: "Títulos vendidos", n: ventasVista.oficial.titulos },
                  { t: `Ventas por títulos (cada ${ventasVista.oficial.regla})`, n: ventasVista.oficial.porTitulos },
                  { t: "Total de ventas", n: ventasVista.oficial.total, destacado: true },
                ].map((x) => (
                  <div key={x.t} className={`rounded-xl px-3 py-2.5 ${x.destacado ? "bg-marca-claro" : "bg-black/[0.03]"}`}>
                    <p className={`cifra text-2xl font-semibold ${x.destacado ? "text-marca-oscuro" : ""}`}>{x.n}</p>
                    <p className="text-xs text-neutral-500">{x.t}</p>
                  </div>
                ))}
              </div>
              {ventasVista.oficial.titulos % ventasVista.oficial.regla > 0 && (
                <p className="mt-2 text-xs text-neutral-500">Te faltan {ventasVista.oficial.regla - (ventasVista.oficial.titulos % ventasVista.oficial.regla)} títulos para sumar otra venta.</p>
              )}
              <p className="mt-2 text-[11px] text-neutral-400">Conteo oficial: lo que ya está en Contrataciones con tu nombre. Las ventas en revisión cuentan cuando el administrador las aprueba.</p>
            </section>

            <section className="mt-6">
              <h2 className="rotulo mb-2 px-1">En revisión y rechazadas · {ventasVista.revision.length}</h2>
              <MisVentas ventas={ventasVista.revision} />
            </section>
            <section className="mt-6">
              <h2 className="rotulo mb-2 px-1">Aprobadas que reportaste este mes · {ventasVista.aprobadas.length}</h2>
              <MisVentas ventas={ventasVista.aprobadas} />
            </section>
            <section className="mt-6">
              <h2 className="rotulo mb-2 px-1">En Contrataciones con tu nombre · {ventasVista.oficial.lista.length}</h2>
              {ventasVista.oficial.lista.length === 0 ? <p className="card px-4 py-6 text-center text-sm text-neutral-500">Nada este mes todavía.</p> : (
                <ul className="card divide-y divide-black/5">
                  {ventasVista.oficial.lista.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5 text-sm">
                      <span className="text-xs text-neutral-400">{s.fecha ? s.fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }) : "—"}</span>
                      <span className="font-medium">{s.cliente}</span>
                      <span className="text-xs text-neutral-500">{s.marca} · {SERVICIO_TXT[s.tipo] ?? s.tipo}</span>
                      <span className="cifra ml-auto text-xs text-neutral-600">{mxn(s.costo)}{s.costo - s.pagado > 0 && <span className="text-red-600"> · debe {mxn(s.costo - s.pagado)}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

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
