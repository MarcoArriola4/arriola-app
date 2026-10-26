import Link from "next/link";
import { db } from "@/lib/db";
import { ACTIVAS } from "@/lib/consultas";
import { esNuevaDeImpi, estaVencida } from "@/lib/plazos";
import { Encabezado } from "@/components/ui";
import { Tablero, type Tarjeta } from "./tablero";
import { NuevaNotificacion } from "./nueva";

export const metadata = { title: "Notificaciones" };

export default async function Notificaciones({ searchParams }: { searchParams: Promise<{ nueva?: string; ver?: string }> }) {
  const { nueva, ver } = await searchParams;
  const vista = ver === "no-pago" ? "no-pago" : ver === "vencidas" ? "vencidas" : "tablero";
  const hace30 = new Date(Date.now() - 30 * 864e5);
  const [todas, cfg, noPago] = await Promise.all([
    db.notificacion.findMany({
      where: vista === "no-pago"
        ? { estado: "NO_PAGO", tipo: { not: "ALEGATOS" } } // alegatos sin contestar no son riesgo de abandono
        : { OR: [{ estado: { in: ACTIVAS } }, { estado: "CONTESTADA", fechaContestacion: { gte: hace30 } }] },
      include: { expediente: { include: { cliente: { select: { nombre: true, telefono: true, email: true } } } } },
      orderBy: { fechaLimite: "asc" },
    }),
    db.configuracion.findUnique({ where: { id: "main" } }),
    db.notificacion.count({ where: { estado: "NO_PAGO", tipo: { not: "ALEGATOS" } } }),
  ]);
  // Tablero: solo lo que aún se puede trabajar y cobrar. Vencidas: activas cuyo plazo final ya pasó.
  const vencidasTodas = todas.filter((n) => ACTIVAS.includes(n.estado) && estaVencida(n));
  const notifs = vista === "vencidas" ? vencidasTodas : vista === "no-pago" ? todas : todas.filter((n) => !(ACTIVAS.includes(n.estado) && estaVencida(n)));
  const nuevasImpi = notifs.filter((n) => esNuevaDeImpi(n)).length;

  const tarjetas: Tarjeta[] = notifs.map((n) => ({
    id: n.id,
    estado: n.estado,
    tipo: n.tipo,
    fechaNotificacion: n.fechaNotificacion.toISOString(),
    fechaLimite: n.fechaLimite.toISOString(),
    fechaLimiteRevision: n.fechaLimiteRevision?.toISOString() ?? null,
    pendienteNotificar: n.pendienteNotificar,
    numeroOficio: n.numeroOficio,
    nuevaImpi: esNuevaDeImpi(n),
    fechaAvisoCliente: n.fechaAvisoCliente?.toISOString() ?? null,
    fechaPago: n.fechaPago?.toISOString() ?? null,
    fechaContestacion: n.fechaContestacion?.toISOString() ?? null,
    medioDefensa: n.medioDefensa,
    montoCotizado: n.montoCotizado,
    notas: n.notas,
    expedienteId: n.expedienteId,
    denominacion: n.expediente.denominacion,
    numeroExpediente: n.expediente.numeroExpediente,
    cliente: n.expediente.cliente.nombre,
    telefono: n.expediente.cliente.telefono,
    email: n.expediente.cliente.email,
  }));

  const titulo = vista === "vencidas" ? "Notificaciones vencidas" : vista === "no-pago" ? "Riesgo de abandono · no pagaron" : "Notificaciones del IMPI";
  const subtitulo =
    vista === "vencidas"
      ? "Oficios cuyo plazo ya pasó sin registrarse la contestación. Si ya se presentaron, márcalos como contestados."
      : vista === "no-pago"
        ? "Clientes que no pagaron la contestación."
        : "Solo oficios en plazo: lo que todavía se puede trabajar y cobrar.";

  return (
    <>
      <Encabezado titulo={titulo} subtitulo={subtitulo}>
        {vista !== "tablero" && <Link href="/notificaciones" className="btn">← Volver al tablero</Link>}
        {vista !== "vencidas" && vencidasTodas.length > 0 && (
          <Link href="/notificaciones?ver=vencidas" className="btn text-red-700">Vencidas ({vencidasTodas.length})</Link>
        )}
        {vista !== "no-pago" && noPago > 0 && <Link href="/notificaciones?ver=no-pago" className="btn text-neutral-500">Riesgo de abandono ({noPago})</Link>}
        <NuevaNotificacion abiertoInicial={nueva === "1"} />
      </Encabezado>
      {vista === "tablero" && nuevasImpi > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          {nuevasImpi === 1 ? "1 notificación nueva detectada" : `${nuevasImpi} notificaciones nuevas detectadas`} en la revisión con MARCanet. {nuevasImpi === 1 ? "Aparece" : "Aparecen"} en morado.
        </p>
      )}
      <Tablero tarjetas={tarjetas} diasSeguimiento={cfg?.diasSeguimientoPago ?? 5} modoLista={vista !== "tablero"} />
    </>
  );
}
