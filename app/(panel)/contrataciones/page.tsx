import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { TIPOS_EXPEDIENTE, TIPOS_OFICIO, TIPOS_SERVICIO, mxn } from "@/lib/catalogos";
import { diasRestantes, estaVencida, siguientePlazo } from "@/lib/plazos";
import { ACTIVAS } from "@/lib/consultas";
import { Encabezado } from "@/components/ui";
import { ActualizarTodas } from "@/components/actualizar-todas";
import { estadoBarrido } from "@/lib/marcanet/estado";
import { HojaContrataciones, type FilaContratacion } from "./hoja";

export const metadata = { title: "Contrataciones" };
// El botón "Actualizar todas" consulta MARCanet marca por marca
export const maxDuration = 60;

export default async function Contrataciones({ searchParams }: { searchParams: Promise<{ mes?: string; vista?: string }> }) {
  const [{ mes, vista }, sesion] = await Promise.all([searchParams, requerirSesion()]);
  const historial = vista === "todo";
  const ahora = new Date();
  const [y, m] = (mes ?? `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`).split("-").map(Number);
  const desde = new Date(Date.UTC(y, m - 1, 1));
  const hasta = new Date(Date.UTC(y, m, 1));
  const clave = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const anterior = clave(new Date(Date.UTC(y, m - 2, 1)));
  const siguiente = clave(new Date(Date.UTC(y, m, 1)));
  const nombreMes = desde.toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });

  const where: Prisma.ServicioWhereInput = historial ? {} : { fechaContratacion: { gte: desde, lt: hasta } };
  const servicios = await db.servicio.findMany({
    where,
    include: {
      expediente: {
        select: {
          id: true, denominacion: true, numeroExpediente: true, tipo: true, clienteId: true, etapa: true,
          cliente: { select: { nombre: true, telefono: true } },
          notificaciones: { where: { estado: { in: ACTIVAS } }, select: { tipo: true, fechaLimite: true, fechaLimiteRevision: true, pendienteNotificar: true } },
        },
      },
    },
    // Lo más reciente arriba: así al abrir se ven primero las nuevas contrataciones
    orderBy: [{ fechaContratacion: { sort: "desc", nulls: "last" } }, { creado: "desc" }, { filaExcel: "desc" }],
  });

  const filas: FilaContratacion[] = servicios.map((s) => {
    const saldo = Math.max(0, (s.costo ?? 0) - s.pagado);
    const oficio = s.expediente.notificaciones.find((n) => !estaVencida(n));
    const pendientes: { tipo: string; texto: string }[] = [];
    if (s.estadoTrabajo === "PENDIENTE") pendientes.push({ tipo: "trabajar", texto: "Trabajar" });
    if (s.estadoTrabajo === "PRESENTAR") pendientes.push({ tipo: "presentar", texto: "Presentar" });
    if (s.estadoTrabajo === "PAGAR_SISTEMA") pendientes.push({ tipo: "sistema", texto: "Pagar en sistema" });
    if (s.estadoTrabajo === "PROBLEMA") pendientes.push({ tipo: "problema", texto: "Revisar problema" });
    if (saldo > 0) pendientes.push({ tipo: "cobrar", texto: `Cobrar ${mxn.format(saldo)}` });
    if (oficio) {
      const d = oficio.pendienteNotificar ? null : diasRestantes(siguientePlazo(oficio).fecha);
      pendientes.push({ tipo: "oficio", texto: `Contestar ${TIPOS_OFICIO[oficio.tipo]?.toLowerCase()}${d != null ? ` (${d} d)` : ""}` });
    }
    return {
      id: s.id,
      fecha: s.fechaContratacion?.toISOString() ?? null,
      clienteId: s.expediente.clienteId,
      cliente: s.expediente.cliente.nombre,
      telefono: s.expediente.cliente.telefono,
      expedienteId: s.expediente.id,
      denominacion: s.expediente.denominacion,
      numeroExpediente: s.expediente.numeroExpediente,
      tipoExpediente: TIPOS_EXPEDIENTE[s.expediente.tipo] ?? s.expediente.tipo,
      etapa: s.expediente.etapa,
      servicio: TIPOS_SERVICIO[s.tipo] ?? s.tipo,
      vendio: s.vendedor ?? s.origenVenta,
      costo: s.costo,
      pagado: s.pagado,
      saldo,
      estadoPago: s.estadoPago,
      parcialidad1: s.parcialidad1,
      parcialidad1Pagada: s.parcialidad1Pagada,
      parcialidad2: s.parcialidad2,
      parcialidad2Pagada: s.parcialidad2Pagada,
      banco: s.banco,
      estadoTrabajo: s.estadoTrabajo,
      avance: s.avance,
      pendientes,
    };
  });

  const tab = (activo: boolean) => `rounded-md px-3 py-1.5 text-sm font-medium ${activo ? "bg-white shadow-sm" : "text-neutral-500 hover:text-black"}`;

  return (
    <>
      <Encabezado
        titulo={historial ? "Historial de contrataciones" : "Contrataciones del mes"}
        subtitulo={historial ? `Todo lo contratado desde el inicio · ${filas.length.toLocaleString("es-MX")} servicios` : "Lo más reciente arriba. Quién contrató, quién lo vendió, si ya se trabajó, si ya pagó y qué falta."}
      >
        <div className="inline-flex rounded-lg bg-neutral-200/70 p-1">
          <Link href="/contrataciones" className={tab(!historial)}>Por mes</Link>
          <Link href="/contrataciones?vista=todo" className={tab(historial)}>Historial completo</Link>
        </div>
        {!historial && (
          <div className="flex items-center gap-1 rounded-lg bg-white p-1 ring-1 ring-black/10">
            <Link href={`/contrataciones?mes=${anterior}`} className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Mes anterior"><ChevronLeft size={16} /></Link>
            <span className="min-w-36 text-center text-sm font-semibold first-letter:uppercase">{nombreMes}</span>
            <Link href={`/contrataciones?mes=${siguiente}`} className="rounded-md p-1.5 hover:bg-neutral-100" aria-label="Mes siguiente"><ChevronRight size={16} /></Link>
          </div>
        )}
      </Encabezado>
      <HojaContrataciones filas={filas} esAdmin={sesion.rol === "ADMIN"} historial={historial} />
      {historial && (
        <section className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Actualizar las marcas con el IMPI</h2>
            <p className="text-xs text-neutral-500">Consulta MARCanet marca por marca (primero las que tienen oficios en curso) y trae los oficios nuevos y las contestaciones registradas.</p>
          </div>
          <ActualizarTodas barrido={await estadoBarrido()} />
        </section>
      )}
    </>
  );
}
