import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TIPOS_SERVICIO, fmtFecha, mxn } from "@/lib/catalogos";
import { Encabezado, EstadoPago, Metrica, Origen, Vacio } from "@/components/ui";

export const metadata = { title: "Pagos" };
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default async function Pagos({ searchParams }: { searchParams: Promise<{ mes?: string; estado?: string }> }) {
  const { mes, estado = "" } = await searchParams;
  const ahora = new Date();
  const [y, m] = (mes ?? `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 1));
  const soloPendientes = estado === "pendientes";

  const where: Prisma.ServicioWhereInput = soloPendientes
    ? { estadoPago: { in: ["PENDIENTE", "PARCIAL"] }, costo: { gt: 0 } }
    : { fechaContratacion: { gte: desde, lt: hasta } };

  const hace12 = new Date(Date.UTC(y, m - 12, 1));
  const [servicios, historico] = await Promise.all([
    db.servicio.findMany({ where, include: { expediente: { include: { cliente: { select: { nombre: true } } } } }, orderBy: { fechaContratacion: "desc" }, take: 500 }),
    db.servicio.findMany({ where: { fechaContratacion: { gte: hace12, lt: hasta } }, select: { fechaContratacion: true, pagado: true } }),
  ]);

  const cobrado = servicios.reduce((a, s) => a + s.pagado, 0);
  const porCobrar = servicios.reduce((a, s) => a + Math.max(0, (s.costo ?? 0) - s.pagado), 0);
  const porBanco = Object.entries(servicios.reduce<Record<string, number>>((a, s) => ({ ...a, [s.banco ?? "Sin banco"]: (a[s.banco ?? "Sin banco"] ?? 0) + s.pagado }), {})).sort((a, b) => b[1] - a[1]);
  const porTipo = Object.entries(servicios.reduce<Record<string, number>>((a, s) => ({ ...a, [s.tipo]: (a[s.tipo] ?? 0) + 1 }), {}));

  const barras = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 12 + i, 1));
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const total = historico.filter((s) => s.fechaContratacion && s.fechaContratacion.getUTCFullYear() === d.getUTCFullYear() && s.fechaContratacion.getUTCMonth() === d.getUTCMonth()).reduce((a, s) => a + s.pagado, 0);
    return { k, label: MESES[d.getUTCMonth()], total };
  });
  const max = Math.max(...barras.map((b) => b.total), 1);
  const mesActual = `${y}-${String(m).padStart(2, "0")}`;
  const nombreMes = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <Encabezado titulo="Pagos" subtitulo={soloPendientes ? "Todos los servicios con saldo pendiente" : `Servicios contratados en ${nombreMes}`}>
        <Link href={soloPendientes ? "/pagos" : "/pagos?estado=pendientes"} className="btn">{soloPendientes ? "Ver por mes" : "Ver pendientes de cobro"}</Link>
        {!soloPendientes && (
          <form className="flex gap-2"><input type="month" name="mes" defaultValue={mesActual} className="input w-auto" /><button className="btn">Ver</button></form>
        )}
      </Encabezado>

      {!soloPendientes && (
        <section className="card mb-4 p-4">
          <p className="mb-3 text-xs text-neutral-500">Cobrado por mes (últimos 12 meses) · da clic en un mes</p>
          <div className="flex h-36 items-end gap-1.5">
            {barras.map((b) => (
              <Link key={b.k} href={`/pagos?mes=${b.k}`} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={mxn.format(b.total)}>
                <span className="text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100">{Math.round(b.total / 1000)}k</span>
                <div className={`w-full rounded-t ${b.k === mesActual ? "bg-marca" : "bg-neutral-200 group-hover:bg-neutral-300"}`} style={{ height: `${(b.total / max) * 100}%`, minHeight: 2 }} />
                <span className={`text-[11px] ${b.k === mesActual ? "font-semibold" : "text-neutral-400"}`}>{b.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica label="Cobrado" valor={mxn.format(cobrado)} tono="verde" />
        <Metrica label="Por cobrar" valor={mxn.format(porCobrar)} tono={porCobrar ? "rojo" : undefined} />
        <Metrica label="Servicios" valor={servicios.length} nota={porTipo.map(([k, v]) => `${v} ${TIPOS_SERVICIO[k]?.toLowerCase()}`).join(" · ")} />
        <div className="card px-4 py-3.5">
          <p className="mb-1 text-xs text-neutral-500">Por banco</p>
          {porBanco.slice(0, 4).map(([b, v]) => <p key={b} className="flex justify-between text-xs"><span>{b}</span><span className="font-medium">{mxn.format(v)}</span></p>)}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-black/5 bg-neutral-50/60"><tr><th className="th">Fecha</th><th className="th">Marca / cliente</th><th className="th">Servicio</th><th className="th text-right">Costo</th><th className="th text-right">Pagado</th><th className="th">Estado</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {servicios.map((s) => (
              <tr key={s.id} className="hover:bg-neutral-50">
                <td className="td whitespace-nowrap text-neutral-600">{fmtFecha(s.fechaContratacion)}</td>
                <td className="td">
                  <Link href={`/expedientes/${s.expedienteId}`} className="font-medium hover:underline">{s.expediente.denominacion}</Link>
                  <span className="block text-xs text-neutral-500">{s.expediente.cliente.nombre}</span>
                </td>
                <td className="td whitespace-nowrap">{TIPOS_SERVICIO[s.tipo]} <Origen origen={s.origenVenta} /></td>
                <td className="td whitespace-nowrap text-right">{s.costo ? mxn.format(s.costo) : "—"}</td>
                <td className="td whitespace-nowrap text-right">{mxn.format(s.pagado)}<span className="block text-xs text-neutral-400">{s.banco}</span></td>
                <td className="td"><EstadoPago estado={s.estadoPago} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {servicios.length === 0 && <Vacio>Sin servicios en este periodo.</Vacio>}
      </div>
    </>
  );
}
