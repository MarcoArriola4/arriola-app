import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { notificacionesActivas, vencimientos } from "@/lib/consultas";
import { DIA, diasRestantes, esNuevaDeImpi, estaVencida, siguientePlazo } from "@/lib/plazos";
import { TIPOS_OFICIO, fmtFecha, mxn } from "@/lib/catalogos";
import { PlazoOficio } from "@/components/ui";

export const metadata = { title: "Inicio" };

const PASO: Record<string, { txt: string; cls: string }> = {
  RECIBIDA: { txt: "Falta avisar al cliente", cls: "bg-amber-50 text-amber-700" },
  AVISADO: { txt: "Esperando pago", cls: "bg-sky-50 text-sky-700" },
  EN_TRABAJO: { txt: "Pagado · por trabajar", cls: "bg-violet-50 text-violet-700" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema", cls: "bg-yellow-200 text-yellow-900" },
};

export default async function Inicio({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [sesion, { error }] = await Promise.all([requerirSesion(), searchParams]);
  const activas = await notificacionesActivas();
  const pendientesNotas = await db.recordatorio.findMany({ where: { usuarioId: sesion.id, hecho: false, recordarEn: { lte: new Date() } }, orderBy: { recordarEn: "asc" }, take: 5 });
  // En Inicio solo lo que aún está en plazo; las vencidas van en su propio apartado
  const notifs = activas.filter((n) => !estaVencida(n));
  const vencidas = activas.length - notifs.length;
  const nuevasImpi = notifs.filter((n) => esNuevaDeImpi(n)).length;
  const hace7 = new Date(Date.now() - 7 * DIA);

  const [nuevas, contestadas, cobros, altas, actividad, venc] = await Promise.all([
    db.notificacion.count({ where: { creado: { gte: hace7 }, NOT: { notas: { startsWith: "Importado" } } } }),
    db.notificacion.count({ where: { fechaContestacion: { gte: hace7 } } }),
    db.servicio.aggregate({ where: { fechaContratacion: { gte: hace7 } }, _sum: { pagado: true } }),
    db.servicio.count({ where: { filaExcel: null, creado: { gte: hace7 } } }),
    db.evento.findMany({
      where: { importado: false },
      include: { expediente: { select: { denominacion: true, clienteId: true } } },
      orderBy: { creado: "desc" },
      take: 6,
    }),
    vencimientos({ desdeDias: 0, hastaDias: 30 }),
  ]);

  const dias = (n: (typeof notifs)[number]) => (n.pendienteNotificar ? 9999 : diasRestantes(siguientePlazo(n).fecha));
  notifs.sort((a, b) => dias(a) - dias(b));
  const urgentes = notifs.filter((n) => { const d = dias(n); return d >= 0 && d <= 7; }).length;
  const porPaso = (e: string) => notifs.filter((n) => n.estado === e).length;

  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      {error === "solo-admin" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">Esa sección es solo para administradores.</p>}
      {error === "sin-permiso" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">No tienes permiso para esa sección. Pídeselo al administrador.</p>}
      {pendientesNotas.length > 0 && (
        <Link href="/notas" className="mb-4 flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
          <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-semibold text-carbon">{pendientesNotas.length}</span>
          <span className="min-w-0 flex-1 truncate">Recordatorios de tu bloc: {pendientesNotas.map((n) => n.texto).join(" · ")}</span>
          <ChevronRight size={16} />
        </Link>
      )}
      <p className="text-sm text-neutral-500 first-letter:uppercase">{hoy}</p>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{saludo}, {sesion.nombre.split(" ")[0]}</h1>

      {/* 1. Notificaciones pendientes por contestar */}
      <section className="card mb-6 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-black/5 p-5">
          <div>
            <p className="text-sm text-neutral-500">Notificaciones en plazo por contestar</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{notifs.length}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            {nuevasImpi > 0 && <span className="rounded-full bg-violet-600 px-2.5 py-1 text-white">{nuevasImpi} nuevas del IMPI</span>}
            {urgentes > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700">{urgentes} vencen esta semana</span>}
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">{porPaso("RECIBIDA")} por avisar</span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">{porPaso("AVISADO")} esperando pago</span>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">{porPaso("EN_TRABAJO")} por trabajar</span>
            <span className="rounded-full bg-yellow-200 px-2.5 py-1 text-yellow-900">{porPaso("PAGAR_SISTEMA")} pagar en sistema</span>
          </div>
        </div>

        {notifs.length === 0 ? (
          <p className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-marca-oscuro"><CheckCircle2 size={18} /> Todo al día: no hay oficios pendientes.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {notifs.slice(0, 10).map((n) => (
              <li key={n.id}>
                <Link
                  href={`/clientes/${n.expediente.clienteId}?marca=${n.expedienteId}`}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${esNuevaDeImpi(n) ? "border-l-4 border-violet-500 bg-violet-50 hover:bg-violet-100" : "hover:bg-neutral-50"}`}
                >
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="truncate text-sm font-semibold">
                      {esNuevaDeImpi(n) && <span className="mr-1.5 rounded bg-violet-600 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-white">Nueva · IMPI</span>}
                      {n.expediente.denominacion}
                    </p>
                    <p className="truncate text-xs text-neutral-500">{n.expediente.cliente.nombre} · {TIPOS_OFICIO[n.tipo]} · Exp. {n.expediente.numeroExpediente ?? "s/n"}</p>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${PASO[n.estado].cls}`}>{PASO[n.estado].txt}</span>
                  <span className="w-52 text-right"><PlazoOficio n={n} /></span>
                  <ChevronRight size={16} className="hidden text-neutral-300 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {vencidas > 0 && (
          <Link href="/notificaciones?ver=vencidas" className="block border-t border-black/5 px-5 py-2.5 text-center text-xs text-red-700 hover:bg-red-50">
            Además hay {vencidas} {vencidas === 1 ? "notificación vencida" : "notificaciones vencidas"} sin contestación registrada → revisar
          </Link>
        )}
        {notifs.length > 0 && (
          <Link href="/notificaciones" className="block border-t border-black/5 bg-neutral-50/60 px-5 py-3 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            {notifs.length > 10 ? `Ver las ${notifs.length} en el tablero` : "Abrir el tablero de notificaciones"} →
          </Link>
        )}
      </section>

      {/* 2. Resumen breve */}
      <h2 className="mb-3 text-sm font-semibold text-neutral-500">Resumen de los últimos 7 días</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Dato label="Oficios nuevos" valor={nuevas} />
        <Dato label="Contestaciones enviadas" valor={contestadas} />
        <Dato label="Servicios dados de alta" valor={altas} />
        <Dato label="Cobrado" valor={mxn.format(cobros._sum.pagado ?? 0)} verde />
        <Link href="/vencimientos?rango=30" className="card px-4 py-3.5 hover:border-black/20">
          <p className="text-xs text-neutral-500">DDU y renovaciones (30 días)</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{venc.length}</p>
        </Link>
      </div>

      <section className="card">
        <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold">Actividad reciente</h2>
        {actividad.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">Aquí aparecerá lo que hagan en la app: avisos, pagos, contestaciones y altas.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {actividad.map((a) => (
              <li key={a.id}>
                <Link href={`/clientes/${a.expediente.clienteId}?marca=${a.expedienteId}`} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-neutral-50">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-marca" />
                  <span className="min-w-0 flex-1 truncate"><b className="font-medium">{a.expediente.denominacion}</b> · {a.titulo}</span>
                  <span className="shrink-0 text-xs text-neutral-400">{a.autor ? `${a.autor} · ` : ""}{fmtFecha(a.creado)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Dato({ label, valor, verde }: { label: string; valor: React.ReactNode; verde?: boolean }) {
  return (
    <div className="card px-4 py-3.5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${verde ? "text-marca-oscuro" : ""}`}>{valor}</p>
    </div>
  );
}
