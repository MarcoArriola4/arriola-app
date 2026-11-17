import Link from "next/link";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { Encabezado, Vacio } from "@/components/ui";
import { normalizarNombre } from "@/lib/catalogos";
import { SERVICIOS_VENTA, fmtMx } from "@/lib/vendedoras";
import { RevisarVenta, type CandidatoCliente, type VentaRevision } from "./componentes";

export const metadata = { title: "Ventas por aprobar" };
export const dynamic = "force-dynamic";

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const dia = (d: Date) => d.toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export default async function VentasPorAprobar({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirAdmin();
  const { ver } = await searchParams;
  const [pendientes, revisadas] = await Promise.all([
    db.ventaVendedora.findMany({ where: { estado: "PENDIENTE" }, include: { vendedora: { select: { nombre: true, nombreVentas: true } }, lead: { select: { nombre: true, asignadoEl: true, intentos: true, contestoPor: true } } }, orderBy: { creado: "asc" } }),
    db.ventaVendedora.findMany({ where: { estado: { in: ver === "rechazadas" ? ["RECHAZADA"] : ["APROBADA"] } }, include: { vendedora: { select: { nombre: true } } }, orderBy: { revisadoEl: "desc" }, take: 150 }),
  ]);

  // Para verificar: clientes y marcas que ya existen en ArriolApp con ese nombre, teléfono o expediente
  const revision: VentaRevision[] = await Promise.all(
    pendientes.map(async (v) => {
      const norm = normalizarNombre(v.clienteNombre);
      const tel = (v.telefono ?? "").replace(/\D/g, "").slice(-10);
      const [clientes, expediente] = await Promise.all([
        db.cliente.findMany({
          where: { OR: [{ nombreNorm: norm }, { nombreNorm: { contains: norm.split(" ").slice(0, 2).join(" ") } }, ...(tel.length >= 8 ? [{ telefono: { contains: tel.slice(-8) } }] : [])] },
          select: { id: true, nombre: true, telefono: true, _count: { select: { expedientes: true } } }, take: 8,
        }),
        v.numeroExpediente ? db.expediente.findUnique({ where: { numeroExpediente: v.numeroExpediente }, select: { denominacion: true, clienteId: true, cliente: { select: { nombre: true } } } }) : null,
      ]);
      const candidatos: CandidatoCliente[] = clientes.map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, marcas: c._count.expedientes, exacto: normalizarNombre(c.nombre) === norm }));
      return {
        id: v.id, vendedora: v.vendedora.nombre, vendio: v.vendedora.nombreVentas ?? v.vendedora.nombre.split(" ")[0], creado: v.creado.toISOString(),
        lead: v.lead ? { nombre: v.lead.nombre, asignado: v.lead.asignadoEl.toISOString(), intentos: v.lead.intentos, contestoPor: v.lead.contestoPor } : null,
        datos: {
          clienteNombre: v.clienteNombre, telefono: v.telefono ?? "", email: v.email ?? "", servicio: v.servicio, denominacion: v.denominacion ?? "",
          numeroExpediente: v.numeroExpediente ?? "", pagado: String(v.pagado), debe: String(v.debe), fechaCobro: v.fechaCobro.toISOString().slice(0, 10), banco: v.banco ?? "", notas: v.notas ?? "",
        },
        candidatos,
        expedienteExistente: expediente ? { denominacion: expediente.denominacion, cliente: expediente.cliente.nombre, clienteId: expediente.clienteId } : null,
      };
    }),
  );

  return (
    <>
      <Encabezado
        titulo="Ventas por aprobar"
        subtitulo="Lo que reportan las vendedoras desde su panel. Nada entra a Contrataciones hasta que tú lo apruebes; si algo no cuadra, corrígelo antes o recházalo con el motivo."
      />

      <section className="mb-8">
        <h2 className="rotulo mb-2 px-1">Pendientes de revisar · {revision.length}</h2>
        {revision.length === 0 ? <div className="card"><Vacio>No hay ventas pendientes. Cuando una vendedora reporte una venta, te aparecerá aquí y en el aviso de arriba.</Vacio></div> : (
          <div className="space-y-4">{revision.map((v) => <RevisarVenta key={v.id} v={v} />)}</div>
        )}
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-linea px-4 py-3">
          <h2 className="text-sm font-semibold">Ya revisadas</h2>
          <div className="ml-auto inline-flex rounded-lg bg-black/[0.05] p-1 text-sm">
            <Link href="/ventas-vendedoras" className={`rounded-md px-3 py-1 ${ver !== "rechazadas" ? "bg-white shadow-tarjeta font-medium" : "text-neutral-500"}`}>Aprobadas</Link>
            <Link href="/ventas-vendedoras?ver=rechazadas" className={`rounded-md px-3 py-1 ${ver === "rechazadas" ? "bg-white shadow-tarjeta font-medium" : "text-neutral-500"}`}>Rechazadas</Link>
          </div>
        </div>
        {revisadas.length === 0 ? <Vacio>Nada todavía.</Vacio> : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-linea"><tr><th className="th">Cobro</th><th className="th">Vendedora</th><th className="th">Cliente</th><th className="th">Servicio</th><th className="th text-right">Pagó</th><th className="th text-right">Debe</th><th className="th">Revisó</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {revisadas.map((v) => (
                <tr key={v.id}>
                  <td className="td whitespace-nowrap">{dia(v.fechaCobro)}</td>
                  <td className="td">{v.vendedora.nombre}</td>
                  <td className="td font-medium">{v.clienteNombre}{v.denominacion && <p className="text-xs font-normal text-neutral-500">{v.denominacion}{v.numeroExpediente && ` · Exp. ${v.numeroExpediente}`}</p>}</td>
                  <td className="td">{SERVICIOS_VENTA[v.servicio] ?? v.servicio}</td>
                  <td className="td cifra text-right">{mxn.format(v.pagado)}</td>
                  <td className="td cifra text-right">{v.debe ? mxn.format(v.debe) : "—"}</td>
                  <td className="td text-xs text-neutral-500">{v.revisadoPor} · {v.revisadoEl ? fmtMx(v.revisadoEl) : ""}{v.motivoRechazo && <p className="text-red-600">Motivo: {v.motivoRechazo}</p>}</td>
                  <td className="td whitespace-nowrap text-right">{v.clienteId && <Link href={`/clientes/${v.clienteId}`} className="text-xs font-medium underline">Ver cliente</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
