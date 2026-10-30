import Link from "next/link";
import { db } from "@/lib/db";
import { ACTIVAS } from "@/lib/consultas";
import { esNuevaDeImpi, estaVencida } from "@/lib/plazos";
import { Encabezado, PlazoOficio } from "@/components/ui";
import { Prioridades } from "@/components/prioridades";
import { requerirSesion } from "@/lib/auth";
import { TIPOS_OFICIO, fmtFecha } from "@/lib/catalogos";
import { contratacionesSinPresentar } from "@/lib/marcanet/seleccion";
import { BotonAvise } from "./boton-avise";
import { MarcarVistas } from "./vistas";
import { Tablero, type Tarjeta } from "./tablero";
import { NuevaNotificacion } from "./nueva";

export const metadata = { title: "Notificaciones" };

export default async function Notificaciones({ searchParams }: { searchParams: Promise<{ nueva?: string; ver?: string }> }) {
  const [{ nueva, ver }, sesion] = await Promise.all([searchParams, requerirSesion()]);
  // Lo que llegó desde la última vez que este usuario abrió Notificaciones
  const vistasHasta = (await db.usuario.findUnique({ where: { id: sesion.id }, select: { notifVistasHasta: true } }))?.notifVistasHasta ?? null;
  const vista = ver === "no-pago" ? "no-pago" : ver === "vencidas" ? "vencidas" : "tablero";
  const hace30 = new Date(Date.now() - 30 * 864e5);
  const [todas, cfg, noPago, sinPresentar] = await Promise.all([
    db.notificacion.findMany({
      where: vista === "no-pago"
        ? { estado: "NO_PAGO", tipo: { not: "ALEGATOS" } } // alegatos sin contestar no son riesgo de abandono
        : { OR: [{ estado: { in: ACTIVAS } }, { estado: "CONTESTADA", fechaContestacion: { gte: hace30 } }] },
      include: {
        expediente: { include: { cliente: { select: { nombre: true, telefono: true, email: true } } } },
        servicio: { select: { fechaContratacion: true, creado: true, pagado: true, costo: true } },
      },
      orderBy: { fechaLimite: "asc" },
    }),
    db.configuracion.findUnique({ where: { id: "main" } }),
    db.notificacion.count({ where: { estado: "NO_PAGO", tipo: { not: "ALEGATOS" } } }),
    vista === "tablero" ? contratacionesSinPresentar(db) : Promise.resolve([]),
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
    // Las de contestaciones ya vendidas no son "nuevas": ya se sabe de ellas
    nueva: ACTIVAS.includes(n.estado) && !n.servicio && (!vistasHasta || n.creado > vistasHasta) && n.creado > new Date(Date.now() - 30 * 864e5),
    venta: n.servicio ? { fecha: (n.servicio.fechaContratacion ?? n.servicio.creado).toISOString(), pagado: n.servicio.pagado, costo: n.servicio.costo } : null,
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

  const sinVer = tarjetas.filter((t) => t.nueva);
  // Por atender: oficios en plazo a los que aún no se les hace nada (ni aviso al cliente). Se quedan hasta que se mueven.
  const porAtender = tarjetas
    .filter((t) => t.estado === "RECIBIDA")
    .sort((a, b) => b.fechaNotificacion.localeCompare(a.fechaNotificacion) || Number(b.nueva) - Number(a.nueva));
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
      {vista === "tablero" && <MarcarVistas />}
      {vista === "tablero" && porAtender.length > 0 && (
        <section className="mb-6 rounded-2xl border-2 border-violet-300 bg-violet-50/70 p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-violet-900">
              {sinVer.length > 0 && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-600" />}
              Notificaciones por atender ({porAtender.length}){sinVer.length > 0 && ` · ${sinVer.length} sin ver`}
            </p>
            <p className="text-xs text-violet-700/80">De la más reciente a la más antigua. El punto se quita al verlas; cada una se queda aquí hasta que avises al cliente o la muevas de paso.</p>
          </div>
          <ul className="overflow-hidden rounded-xl border border-violet-200 bg-white">
            {porAtender.map((t, i) => (
              <li key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 ${i ? "border-t border-violet-100" : ""}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${t.nueva ? "bg-violet-600" : "bg-transparent"}`} title={t.nueva ? "Sin ver" : undefined} />
                <a href={`#oficio-${t.id}`} className="min-w-0 flex-1 basis-52 hover:underline">
                  <p className={`truncate text-sm ${t.nueva ? "font-semibold" : "font-medium"}`}>{t.denominacion}</p>
                  <p className="truncate text-xs text-neutral-500">{t.cliente} · {TIPOS_OFICIO[t.tipo] ?? t.tipo} · notificada {new Date(t.fechaNotificacion).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p>
                </a>
                <span className="shrink-0 text-xs"><PlazoOficio n={t} /></span>
                <BotonAvise id={t.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {vista === "tablero" && <Prioridades seguimiento={cfg?.diasSeguimientoPago ?? 5} />}
      {vista === "tablero" && sinPresentar.length > 0 && (
        <details className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-amber-900">
            Contestaciones vendidas sin presentar ({sinPresentar.length})
            <span className="ml-2 text-xs font-normal text-amber-800/80">Vendidas hace más de 15 días (últimos 3 meses) · se revisan en MARCanet cada 7 días</span>
          </summary>
          <ul className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-white">
            {sinPresentar.map((v, i) => {
              const dias = Math.floor((Date.now() - (v.fechaContratacion ?? v.creado).getTime()) / 864e5);
              return (
                <li key={v.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 ${i ? "border-t border-amber-100" : ""}`}>
                  <Link href={`/expedientes/${v.expedienteId}`} className="min-w-0 flex-1 basis-52 hover:underline">
                    <p className="truncate text-sm font-medium">{v.expediente.denominacion}</p>
                    <p className="truncate text-xs text-neutral-500">{v.expediente.cliente.nombre} · Exp. {v.expediente.numeroExpediente} · vendida el {fmtFecha(v.fechaContratacion ?? v.creado)}</p>
                  </Link>
                  <span className="shrink-0 text-xs font-medium text-amber-700">Hace {dias} días · sin presentar</span>
                  <span className="shrink-0 text-[11px] text-neutral-400">{v.expediente.marcanetSync ? `Revisada en MARCanet el ${fmtFecha(v.expediente.marcanetSync)}` : "Aún sin revisar en MARCanet"}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {vista === "tablero" && (
        <div className="mb-3 flex items-baseline justify-between border-b border-black/10 pb-2">
          <h2 className="text-base font-semibold">Tablero de oficios</h2>
          <span className="text-xs text-neutral-500">Mueve cada oficio con sus botones; todo se actualiza en la marca y en Contrataciones</span>
        </div>
      )}
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
