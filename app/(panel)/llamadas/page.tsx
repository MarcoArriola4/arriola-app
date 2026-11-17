import Link from "next/link";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { Encabezado, Vacio } from "@/components/ui";
import { CONTACTOS_POR_DIA, RESULTADOS, diaMx, estadoLead, fmtMx, rangoDia } from "@/lib/vendedoras";
import { Accesos, ActualizarSolo, AsignarContactos, QuitarContacto } from "./componentes";

export const metadata = { title: "Panel Vendedoras" };
export const dynamic = "force-dynamic";

const hora = (d: Date) => d.toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

export default async function ReporteLlamadas({ searchParams }: { searchParams: Promise<{ dia?: string; v?: string }> }) {
  await requerirAdmin();
  const sp = await searchParams;
  const hoy = diaMx();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia! : hoy;
  const { inicio, fin } = rangoDia(dia);
  const ahora = new Date();

  const vendedoras = await db.vendedora.findMany({ orderBy: [{ activa: "desc" }, { nombre: "asc" }], include: { _count: { select: { leads: true } } } });
  const filtro = vendedoras.find((x) => x.id === sp.v)?.id;
  const deQuien = filtro ? { vendedoraId: filtro } : {};

  const [asignados, llamadas, recordatoriosDia, proximos, sinLlamar] = await Promise.all([
    db.lead.findMany({ where: { ...deQuien, asignadoEl: { gte: inicio, lt: fin } }, select: { id: true, vendedoraId: true, estado: true } }),
    db.llamada.findMany({ where: { ...deQuien, fecha: { gte: inicio, lt: fin } }, include: { lead: { select: { nombre: true, telefono: true } } }, orderBy: { fecha: "desc" } }),
    // Recordatorios que vencían ese día (de llamadas anteriores) y si se cumplieron
    db.llamada.findMany({ where: { ...deQuien, volverLlamar: { gte: inicio, lt: fin } }, include: { lead: { select: { nombre: true, llamadas: { select: { fecha: true }, orderBy: { fecha: "desc" }, take: 1 } } } }, orderBy: { volverLlamar: "asc" } }),
    db.lead.findMany({ where: { ...deQuien, volverLlamar: { gte: fin }, estado: { notIn: ["VENDIDO", "NO_INTERESA"] } }, include: { vendedora: { select: { nombre: true } } }, orderBy: { volverLlamar: "asc" }, take: 60 }),
    db.lead.findMany({ where: { ...deQuien, asignadoEl: { gte: inicio, lt: fin }, estado: "PENDIENTE" }, include: { vendedora: { select: { nombre: true } } }, orderBy: { creado: "asc" } }),
  ]);

  const nombreDe = new Map(vendedoras.map((x) => [x.id, x.nombre]));
  const resumen = vendedoras
    .filter((x) => x.activa || asignados.some((a) => a.vendedoraId === x.id) || llamadas.some((l) => l.vendedoraId === x.id))
    .filter((x) => !filtro || x.id === filtro)
    .map((x) => {
      const ll = llamadas.filter((l) => l.vendedoraId === x.id);
      const asig = asignados.filter((a) => a.vendedoraId === x.id);
      const llamados = new Set(ll.map((l) => l.leadId)).size;
      return {
        id: x.id, nombre: x.nombre, activa: x.activa, asignados: asig.length, llamadas: ll.length, llamados,
        contestaron: ll.filter((l) => l.contesto).length, noContesto: ll.filter((l) => !l.contesto).length,
        cotizaciones: ll.filter((l) => l.cotizacion).length, volver: ll.filter((l) => l.volverLlamar).length,
        vendidos: ll.filter((l) => l.resultado === "VENDIDO").length, noInteresa: ll.filter((l) => l.resultado === "NO_INTERESA").length,
        ultima: ll[0]?.fecha ?? null,
      };
    });
  const total = (k: keyof (typeof resumen)[number]) => resumen.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const cumplido = (r: (typeof recordatoriosDia)[number]) => (r.lead.llamadas[0]?.fecha ?? new Date(0)) > r.fecha;
  const url = (p: Record<string, string | undefined>) => `/llamadas?${new URLSearchParams(Object.entries({ dia, v: filtro, ...p }).filter(([, v]) => v) as [string, string][])}`;
  const diaTxt = new Date(`${dia}T12:00:00-06:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <Encabezado titulo="Panel Vendedoras" subtitulo={`Reporte de llamadas del ${diaTxt}${dia === hoy ? " · se actualiza solo" : ""}. Las vendedoras entran en /vendedoras con su nombre y contraseña.`}>
        <form className="flex flex-wrap items-center gap-2">
          <input type="date" name="dia" defaultValue={dia} max={hoy} className="input min-h-10 w-auto" aria-label="Día del reporte" />
          <select name="v" defaultValue={filtro ?? ""} className="input min-h-10 w-auto" aria-label="Vendedora">
            <option value="">Todas</option>
            {vendedoras.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </select>
          <button className="btn min-h-10">Ver</button>
        </form>
        <a href="/vendedoras/login" target="_blank" rel="noreferrer" className="btn min-h-10">Abrir Panel Vendedoras ↗</a>
      </Encabezado>
      {dia === hoy && <ActualizarSolo />}

      {/* Totales del día */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {[
          { t: "Contactos asignados", n: total("asignados") },
          { t: "Llamadas hechas", n: total("llamadas") },
          { t: "Contestaron", n: total("contestaron") },
          { t: "No contestaron", n: total("noContesto") },
          { t: "Cotizaciones enviadas", n: total("cotizaciones") },
          { t: "Por volver a llamar", n: total("volver") },
          { t: "Vendidos", n: total("vendidos") },
        ].map((x) => (
          <div key={x.t} className="card px-4 py-3">
            <p className="rotulo">{x.t}</p>
            <p className="cifra mt-1 text-2xl font-semibold">{x.n}</p>
          </div>
        ))}
      </div>

      {/* Por vendedora */}
      <section className="card mb-6 overflow-x-auto">
        <h2 className="border-b border-linea px-4 py-3 text-sm font-semibold">Por vendedora</h2>
        {resumen.length === 0 ? <Vacio>Aún no hay vendedoras. Dales acceso abajo.</Vacio> : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-linea"><tr><th className="th">Vendedora</th><th className="th">Avance</th><th className="th text-right">Llamadas</th><th className="th text-right">Contestaron</th><th className="th text-right">Cotizaciones</th><th className="th text-right">Volver a llamar</th><th className="th text-right">Vendidos</th><th className="th text-right">No le interesa</th><th className="th">Última llamada</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {resumen.map((r) => {
                const meta = Math.max(r.asignados, CONTACTOS_POR_DIA);
                const pct = Math.min(100, Math.round((r.llamados / meta) * 100));
                return (
                  <tr key={r.id}>
                    <td className="td"><Link href={url({ v: r.id })} className="font-medium hover:underline">{r.nombre}</Link>{!r.activa && <span className="ml-1 text-[11px] text-neutral-400">(sin acceso)</span>}</td>
                    <td className="td min-w-[180px]">
                      <p className="cifra text-xs text-neutral-600">{r.llamados} de {r.asignados || CONTACTOS_POR_DIA} contactos · {pct}%</p>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]"><div className={`h-full rounded-full ${pct >= 100 ? "bg-marca" : pct >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} /></div>
                    </td>
                    <td className="td cifra text-right font-semibold">{r.llamadas}</td>
                    <td className="td cifra text-right">{r.contestaron}</td>
                    <td className="td cifra text-right">{r.cotizaciones}</td>
                    <td className="td cifra text-right">{r.volver}</td>
                    <td className="td cifra text-right text-marca-oscuro">{r.vendidos}</td>
                    <td className="td cifra text-right text-neutral-500">{r.noInteresa}</td>
                    <td className="td whitespace-nowrap text-xs text-neutral-500">{r.ultima ? hora(r.ultima) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Actividad en tiempo real */}
        <section className="card">
          <h2 className="border-b border-linea px-4 py-3 text-sm font-semibold">Llamadas del día ({llamadas.length})</h2>
          {llamadas.length === 0 ? <Vacio>Todavía no hay llamadas registradas este día.</Vacio> : (
            <ul className="max-h-[520px] divide-y divide-black/5 overflow-y-auto">
              {llamadas.map((l) => {
                const r = estadoLead(l.resultado);
                return (
                  <li key={l.id} className="px-4 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="cifra text-xs text-neutral-400">{hora(l.fecha)}</span>
                      <span className="font-medium">{l.lead.nombre}</span>
                      <span className="text-xs text-neutral-500">· {nombreDe.get(l.vendedoraId)}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${r.cls}`}>{r.txt}</span>
                    </div>
                    {l.comentario && <p className="mt-0.5 text-xs text-neutral-600">“{l.comentario}”</p>}
                    <p className="text-[11px] text-neutral-400">
                      {l.cotizacion && "Cotización enviada · "}
                      {l.volverLlamar && `Volver a llamar: ${fmtMx(l.volverLlamar)}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {/* Recordatorios del día: ¿sí los hicieron? */}
          <section className="card">
            <h2 className="border-b border-linea px-4 py-3 text-sm font-semibold">
              Recordatorios de este día ({recordatoriosDia.length})
              {recordatoriosDia.length > 0 && <span className="ml-2 font-normal text-neutral-500">· {recordatoriosDia.filter(cumplido).length} hechos</span>}
            </h2>
            {recordatoriosDia.length === 0 ? <Vacio>No había llamadas agendadas para este día.</Vacio> : (
              <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto">
                {recordatoriosDia.map((r) => {
                  const hecho = cumplido(r);
                  const atrasado = !hecho && r.volverLlamar! < ahora;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 px-4 py-2 text-sm">
                      <span className="cifra text-xs text-neutral-400">{hora(r.volverLlamar!)}</span>
                      <span className="font-medium">{r.lead.nombre}</span>
                      <span className="text-xs text-neutral-500">· {nombreDe.get(r.vendedoraId)}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${hecho ? "bg-marca-claro text-marca-oscuro" : atrasado ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                        {hecho ? "Sí lo hizo" : atrasado ? "No lo ha hecho" : "Pendiente"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Próximos recordatorios */}
          <section className="card">
            <h2 className="border-b border-linea px-4 py-3 text-sm font-semibold">Próximas llamadas agendadas ({proximos.length})</h2>
            {proximos.length === 0 ? <Vacio>Sin llamadas agendadas a futuro.</Vacio> : (
              <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto">
                {proximos.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-x-2 px-4 py-2 text-sm">
                    <span className="text-xs text-neutral-500">{fmtMx(l.volverLlamar!)}</span>
                    <span className="font-medium">{l.nombre}</span>
                    <span className="text-xs text-neutral-500">· {l.vendedora.nombre}</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${RESULTADOS[l.estado]?.cls ?? ""}`}>{RESULTADOS[l.estado]?.txt ?? "Por llamar"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Asignados sin llamar */}
      <section className="card mb-6">
        <h2 className="border-b border-linea px-4 py-3 text-sm font-semibold">Asignados este día y todavía sin llamar ({sinLlamar.length})</h2>
        {sinLlamar.length === 0 ? <Vacio>Todos los contactos asignados ya se llamaron.</Vacio> : (
          <ul className="max-h-80 divide-y divide-black/5 overflow-y-auto">
            {sinLlamar.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-2 px-4 py-2 text-sm">
                <span className="font-medium">{l.nombre}</span>
                <span className="text-xs text-neutral-500">{l.telefono} · {l.vendedora.nombre}</span>
                <span className="ml-auto"><QuitarContacto id={l.id} nombre={l.nombre} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <AsignarContactos vendedoras={vendedoras.filter((x) => x.activa).map((x) => ({ id: x.id, nombre: x.nombre }))} hoy={hoy} />
        <Accesos vendedoras={vendedoras.map((x) => ({ id: x.id, nombre: x.nombre, activa: x.activa, contactos: x._count.leads }))} />
      </div>
    </>
  );
}
