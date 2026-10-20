import Link from "next/link";
import { db } from "@/lib/db";
import { ACTIVAS } from "@/lib/consultas";
import { TIPOS_OFICIO, fmtFecha, mxn } from "@/lib/catalogos";
import { estaVencida, siguientePlazo } from "@/lib/plazos";
import { Encabezado, PlazoOficio, Vacio } from "@/components/ui";

export const metadata = { title: "Reportes" };

const PASO: Record<string, { txt: string; cls: string }> = {
  RECIBIDA: { txt: "Falta avisar", cls: "bg-amber-50 text-amber-800" },
  AVISADO: { txt: "Esperando pago", cls: "bg-sky-50 text-sky-800" },
  EN_TRABAJO: { txt: "Pagado · por trabajar", cls: "bg-violet-50 text-violet-800" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema", cls: "bg-yellow-200 text-yellow-900" },
  CONTESTADA: { txt: "Contestada", cls: "bg-marca-claro text-marca-oscuro" },
  NO_PAGO: { txt: "No pagó · riesgo de abandono", cls: "bg-red-50 text-red-700" },
};
const MODO: Record<string, string> = { BARRIDO: "Búsqueda completa (cada 7 días)", NOCTURNO: "Revisión diaria", MANUAL: "Botón «Actualizar todas»" };
const COSTO_CONTESTACION = 3200;

export default async function Reportes({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const anteriores = vista === "anteriores";
  const tab = (activo: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium ${activo ? "bg-white shadow-sm" : "text-neutral-500 hover:text-black"}`;
  return (
    <>
      <Encabezado
        titulo="Reportes"
        subtitulo={anteriores ? "Oficios de meses anteriores que todavía están en plazo: aún se pueden trabajar y cobrar." : "Notificaciones nuevas que trajo cada búsqueda en MARCanet."}
      >
        <div className="inline-flex rounded-lg bg-neutral-200/70 p-1">
          <Link href="/reportes" className={tab(!anteriores)}>Nuevas por búsqueda</Link>
          <Link href="/reportes?vista=anteriores" className={tab(anteriores)}>Oficios anteriores por contestar</Link>
        </div>
      </Encabezado>
      {anteriores ? <OficiosAnteriores /> : <NuevasPorBusqueda />}
    </>
  );
}

async function NuevasPorBusqueda() {
  const corridas = await db.syncMarcanet.findMany({ where: { modo: { in: ["BARRIDO", "NOCTURNO", "MANUAL"] } }, orderBy: { inicio: "desc" }, take: 200 });

  // Los bloques de una misma búsqueda completa se agrupan en una sola
  const grupos: { clave: string; modo: string; inicio: Date; fin: Date | null; revisadas: number; nuevos: number; contestados: number; enCurso: boolean }[] = [];
  for (const c of corridas) {
    const clave = c.modo === "BARRIDO" && c.barrido ? `B${c.barrido.toISOString()}` : c.id;
    const g = grupos.find((x) => x.clave === clave);
    if (g) {
      g.inicio = c.inicio < g.inicio ? c.inicio : g.inicio;
      g.fin = !c.fin || !g.fin ? null : c.fin > g.fin ? c.fin : g.fin;
      g.revisadas += c.consultados;
      g.nuevos += c.nuevos;
      g.contestados += c.contestados;
      g.enCurso ||= !c.fin;
    } else {
      grupos.push({ clave, modo: c.modo, inicio: c.barrido ?? c.inicio, fin: c.fin, revisadas: c.consultados, nuevos: c.nuevos, contestados: c.contestados, enCurso: !c.fin });
    }
  }
  const cfg = await db.configuracion.findUnique({ where: { id: "main" } });
  const lista = grupos.slice(0, 25);
  if (lista.length === 0) return <div className="card"><Vacio>Aún no hay búsquedas registradas.</Vacio></div>;

  // Notificaciones creadas por MARCanet durante cada búsqueda
  const desde = lista[lista.length - 1].inicio;
  const notifs = await db.notificacion.findMany({
    where: { fuente: "MARCANET", creado: { gte: desde } },
    include: { expediente: { select: { id: true, denominacion: true, numeroExpediente: true, clienteId: true, cliente: { select: { nombre: true } } } } },
    orderBy: { creado: "desc" },
  });

  return (
    <div className="space-y-4">
      {lista.map((g) => {
        const fin = g.fin ?? new Date();
        // Búsqueda completa en curso: su ventana llega hasta ahora
        const abierta = g.modo === "BARRIDO" && cfg?.barridoInicio && g.inicio.getTime() === cfg.barridoInicio.getTime() && !cfg.barridoTermino;
        const suyas = notifs.filter((n) => n.creado >= g.inicio && (abierta || g.enCurso ? true : n.creado <= new Date(fin.getTime() + 60000)));
        // Solo lo que llegó por atender: se omite lo que MARCanet encontró ya contestado (es historial)
        const propias = suyas.filter((n) => !(n.estado === "CONTESTADA" && n.fechaContestacion && n.fechaContestacion < n.creado));
        return (
          <section key={g.clave} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{MODO[g.modo] ?? g.modo}{(g.enCurso || abierta) && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">en curso</span>}</p>
                <p className="text-xs text-neutral-500">
                  {g.inicio.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                  {g.fin && !abierta && ` → ${g.fin.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}`} · {g.revisadas.toLocaleString("es-MX")} marcas revisadas · {g.contestados} contestaciones registradas
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${propias.length ? "bg-violet-600 text-white" : "bg-neutral-100 text-neutral-500"}`}>
                {propias.length} {propias.length === 1 ? "notificación nueva" : "notificaciones nuevas"}
              </span>
            </div>
            {propias.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="px-4 py-2">Marca</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Oficio</th><th className="px-4 py-2">Notificado</th><th className="px-4 py-2">Plazo</th><th className="px-4 py-2">Estado</th></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {propias.map((n) => (
                      <tr key={n.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2"><Link href={`/clientes/${n.expediente.clienteId}?marca=${n.expediente.id}`} className="font-medium hover:underline">{n.expediente.denominacion}</Link><span className="block text-[11px] text-neutral-400">Exp. {n.expediente.numeroExpediente}</span></td>
                        <td className="px-4 py-2 text-neutral-600">{n.expediente.cliente.nombre}</td>
                        <td className="px-4 py-2">{TIPOS_OFICIO[n.tipo]}<span className="block text-[11px] text-neutral-400">oficio {n.numeroOficio}</span></td>
                        <td className="whitespace-nowrap px-4 py-2">{fmtFecha(n.fechaNotificacion)}</td>
                        <td className="px-4 py-2">{ACTIVAS.includes(n.estado) ? <PlazoOficio n={n} /> : "—"}</td>
                        <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PASO[n.estado]?.cls ?? ""}`}>{PASO[n.estado]?.txt ?? n.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

async function OficiosAnteriores() {
  const ahora = new Date();
  const inicioMes = new Date(Date.UTC(ahora.getFullYear(), ahora.getMonth(), 1));
  const notifs = (
    await db.notificacion.findMany({
      where: { estado: { in: [...ACTIVAS, "NO_PAGO"] }, fechaNotificacion: { lt: inicioMes } },
      include: { expediente: { select: { id: true, denominacion: true, numeroExpediente: true, clienteId: true, cliente: { select: { nombre: true, telefono: true } } } } },
    })
  )
    .filter((n) => !estaVencida(n))
    // Los más urgentes primero; los aún no notificados (su plazo no corre) al final
    .sort((a, b) => Number(a.pendienteNotificar) - Number(b.pendienteNotificar) || siguientePlazo(a).fecha.getTime() - siguientePlazo(b).fecha.getTime());

  const porCobrar = notifs.filter((n) => ["RECIBIDA", "AVISADO", "NO_PAGO"].includes(n.estado));
  const potencial = porCobrar.reduce((a, n) => a + (n.montoCotizado ?? COSTO_CONTESTACION), 0);
  const porMes = new Map<string, typeof notifs>();
  for (const n of notifs) {
    const k = n.fechaNotificacion.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
    porMes.set(k, [...(porMes.get(k) ?? []), n]);
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card px-4 py-3"><p className="text-xs text-neutral-500">Oficios en plazo de meses anteriores</p><p className="mt-0.5 text-2xl font-semibold">{notifs.length}</p></div>
        <div className="card px-4 py-3"><p className="text-xs text-neutral-500">Aún sin cobrar</p><p className="mt-0.5 text-2xl font-semibold text-amber-600">{porCobrar.length}</p></div>
        <div className="card px-4 py-3"><p className="text-xs text-neutral-500">Venta posible</p><p className="mt-0.5 text-2xl font-semibold text-marca-oscuro">{mxn.format(potencial)}</p><p className="text-[11px] text-neutral-400">cotizado o $3,200 por contestación</p></div>
        <div className="card px-4 py-3"><p className="text-xs text-neutral-500">Vencen en 15 días o menos</p><p className="mt-0.5 text-2xl font-semibold text-red-600">{notifs.filter((n) => !n.pendienteNotificar && (siguientePlazo(n).fecha.getTime() - Date.now()) / 864e5 <= 15).length}</p></div>
      </div>
      {notifs.length === 0 ? (
        <div className="card"><Vacio>No hay oficios de meses anteriores que sigan en plazo.</Vacio></div>
      ) : (
        <div className="space-y-4">
          {[...porMes].map(([mes, lista]) => (
            <section key={mes} className="card overflow-hidden">
              <h2 className="border-b border-black/5 px-4 py-3 text-sm font-semibold first-letter:uppercase">Notificados en {mes} <span className="font-normal text-neutral-400">· {lista.length}</span></h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-neutral-50 text-left text-xs text-neutral-500"><tr><th className="px-4 py-2">Marca</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Oficio</th><th className="px-4 py-2">Notificado</th><th className="px-4 py-2">Tiempo para contestar</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2 text-right">Cotizado</th></tr></thead>
                  <tbody className="divide-y divide-black/5">
                    {lista.map((n) => (
                      <tr key={n.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-2"><Link href={`/clientes/${n.expediente.clienteId}?marca=${n.expediente.id}`} className="font-medium hover:underline">{n.expediente.denominacion}</Link><span className="block text-[11px] text-neutral-400">Exp. {n.expediente.numeroExpediente ?? "s/n"}</span></td>
                        <td className="px-4 py-2 text-neutral-600">{n.expediente.cliente.nombre}{n.expediente.cliente.telefono && <span className="block text-[11px] text-neutral-400">{n.expediente.cliente.telefono}</span>}</td>
                        <td className="px-4 py-2">{TIPOS_OFICIO[n.tipo]}</td>
                        <td className="whitespace-nowrap px-4 py-2">{fmtFecha(n.fechaNotificacion)}</td>
                        <td className="px-4 py-2"><PlazoOficio n={n} /></td>
                        <td className="px-4 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PASO[n.estado]?.cls ?? ""}`}>{PASO[n.estado]?.txt ?? n.estado}</span></td>
                        <td className="px-4 py-2 text-right">{n.montoCotizado ? mxn.format(n.montoCotizado) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
