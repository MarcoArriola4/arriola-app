import Link from "next/link";
import { Bell, CalendarX, UserPlus } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { construirResumen } from "@/lib/alertas";
import { enviarAlertasAhora, guardarConfiguracion } from "@/app/actions";
import { ActualizarTodas } from "@/components/actualizar-todas";
import { estadoBarrido } from "@/lib/marcanet/estado";
import { Encabezado } from "@/components/ui";

export const metadata = { title: "Admin" };

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requerirAdmin();
  const sp = await searchParams;
  // Estado de la búsqueda completa en MARCanet
  const [barrido, activosCount] = await Promise.all([
    estadoBarrido(),
    db.expediente.count({ where: { numeroExpediente: { not: null }, tipo: { in: ["MARCA", "AVISO", "NOMBRE_COMERCIAL"] }, notificaciones: { some: { estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] } } } } }),
  ]);
  const [syncs, sinConsultar] = await Promise.all([
    db.syncMarcanet.findMany({ orderBy: { inicio: "desc" }, take: 6 }),
    db.expediente.count({ where: { numeroExpediente: { not: null }, marcanetSync: null } }),
  ]);
  const [cfg, usuarios, resumen, totales] = await Promise.all([
    db.configuracion.findUnique({ where: { id: "main" } }),
    db.usuario.findMany({ orderBy: { creado: "asc" } }),
    construirResumen(),
    Promise.all([db.cliente.count(), db.expediente.count(), db.servicio.count()]),
  ]);
  const msg: [string, boolean] | null =
    sp.ok === "usuario" ? ["Usuario creado.", true]
    : sp.error === "corta" ? ["La contraseña debe tener al menos 8 caracteres.", false]
    : sp.error === "existe" ? ["Ya existe un usuario con ese correo.", false]
    : sp.envio === "ok" ? ["Resumen enviado a tu correo.", true]
    : sp.envio ? [`No se envió el correo: ${sp.envio}`, false]
    : sp.marcanet === "iniciado" ? ["Revisión con MARCanet iniciada en segundo plano. Recarga en unos minutos para ver el resultado.", true]
    : sp.marcanet === "github" ? ["La revisión masiva corre cada noche en GitHub Actions. Para lanzarla ahora: GitHub → Actions → MARCanet → Run workflow.", true]
    : null;

  return (
    <>
      <Encabezado titulo="Admin" subtitulo={`${totales[0].toLocaleString("es-MX")} clientes · ${totales[1].toLocaleString("es-MX")} marcas · ${totales[2].toLocaleString("es-MX")} cobros`} />
      {msg && <p className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${msg[1] ? "bg-marca-claro text-marca-oscuro" : "bg-red-50 text-red-700"}`}>{msg[0]}</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/admin/alta" className="group flex items-center gap-4 rounded-xl bg-carbon p-5 text-white transition hover:bg-black">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-marca text-carbon"><UserPlus size={22} /></span>
          <span>
            <span className="block text-base font-semibold">Dar de alta cliente o servicio</span>
            <span className="block text-sm text-white/60">Registro de marca, aviso, patente, contestación, DDU, renovación…</span>
          </span>
        </Link>
        <Link href="/notificaciones?nueva=1" className="group flex items-center gap-4 rounded-xl border border-black/[0.07] bg-white p-5 transition hover:border-black/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Bell size={22} /></span>
          <span>
            <span className="block text-base font-semibold">Registrar notificación del IMPI</span>
            <span className="block text-sm text-neutral-500">Llegó un oficio: calcula el plazo y lo pone en el tablero</span>
          </span>
        </Link>
        <Link href="/admin/inhabiles" className="group flex items-center gap-4 rounded-xl border border-black/[0.07] bg-white p-5 transition hover:border-black/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700"><CalendarX size={22} /></span>
          <span>
            <span className="block text-base font-semibold">Días inhábiles del IMPI</span>
            <span className="block text-sm text-neutral-500">Calendario oficial y suspensiones; los plazos los descuentan</span>
          </span>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-1 text-sm font-semibold">Alertas por correo</h2>
          <p className="mb-4 text-xs text-neutral-500">Cada mañana a las 7:00 llega un resumen con lo urgente y los recordatorios.</p>
          <form action={guardarConfiguracion} className="space-y-3">
            <label className="block"><span className="label">Enviar a</span><input name="emailAlertas" type="email" defaultValue={cfg?.emailAlertas ?? ""} placeholder="tu@correo.com" className="input" /></label>
            <label className="block"><span className="label">Avisar cuando falten (días, separados por coma)</span><input name="diasAlerta" defaultValue={cfg?.diasAlerta ?? "60,30,15,7,1"} className="input" /></label>
            <label className="block"><span className="label">Dar seguimiento si el cliente no paga después de (días)</span><input name="diasSeguimientoPago" type="number" min={1} defaultValue={cfg?.diasSeguimientoPago ?? 5} className="input w-28" /></label>
            <button className="btn-primario">Guardar</button>
          </form>
          <form action={enviarAlertasAhora} className="mt-3 border-t border-black/5 pt-3">
            <button className="btn">Enviar resumen ahora</button>
          </form>
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-black/5 px-5 py-3">
            <h2 className="text-sm font-semibold">Vista previa del correo de hoy</h2>
            <p className="text-xs text-neutral-500">{resumen.total} pendientes</p>
          </div>
          <iframe srcDoc={resumen.html} title="Vista previa del correo" className="h-[420px] w-full bg-neutral-50" />
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Actualización automática con MARCanet (IMPI)</h2>
              <p className="text-xs text-neutral-500">
                Cada noche se consultan los expedientes activos y, por turnos, el resto. Se detectan oficios nuevos, su fecha real de notificación y las contestaciones presentadas.
                {sinConsultar > 0 && ` ${sinConsultar.toLocaleString("es-MX")} expedientes aún no se han consultado.`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <ActualizarTodas modo="activos" barrido={barrido} esAdmin />
              <span className="text-[11px] text-neutral-400">{activosCount} marcas con oficios en curso · corre sola en segundo plano</span>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-neutral-50 p-3 text-sm">
            <ActualizarTodas barrido={barrido} esAdmin />
            <p className="basis-full text-xs text-neutral-500">
              La búsqueda completa revisa {barrido.total.toLocaleString("es-MX")} marcas: se omiten {barrido.omitidas.registradas.toLocaleString("es-MX")} registradas sin novedades
              (se revisan si les agregas algo o cerca de los 3 y 10 años) y {barrido.omitidas.abandonadas.toLocaleString("es-MX")} abandonadas hace más de un mes.
            </p>
          </div>
          {syncs.length === 0 ? <p className="text-sm text-neutral-400">Todavía no hay consultas.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b border-black/5"><th className="th">Inicio</th><th className="th">Tipo</th><th className="th text-right">Consultados</th><th className="th text-right">Oficios nuevos</th><th className="th text-right">Contestados</th><th className="th text-right">Errores</th><th className="th">Nota</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {syncs.map((s) => (
                    <tr key={s.id}>
                      <td className="td whitespace-nowrap">{s.inicio.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}{!s.fin && (Date.now() - s.inicio.getTime() < 6 * 3600 * 1000 ? <span className="ml-1 text-xs text-amber-600">en curso…</span> : <span className="ml-1 text-xs text-red-600">interrumpida</span>)}</td>
                      <td className="td text-xs">{s.modo === "NOCTURNO" ? "Diaria" : s.modo === "MANUAL" ? "Manual (todas)" : s.modo === "ACTIVOS" ? "Manual (oficios en curso)" : s.modo === "BARRIDO" ? "Búsqueda completa" : "Un expediente"}</td>
                      <td className="td text-right">{s.consultados}/{s.total}</td>
                      <td className="td text-right font-medium">{s.nuevos}</td>
                      <td className="td text-right">{s.contestados}</td>
                      <td className={`td text-right ${s.errores ? "text-red-600" : ""}`}>{s.errores}</td>
                      <td className="td max-w-xs truncate text-xs text-neutral-500" title={s.mensaje ?? ""}>{s.mensaje ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card p-5 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Usuarios y permisos</h2>
            <Link href="/admin/usuarios" className="btn-primario">Administrar usuarios</Link>
          </div>
          <ul className="divide-y divide-black/5 text-sm">
            {usuarios.map((u) => (
              <li key={u.id} className={`flex justify-between py-2 ${u.activo ? "" : "opacity-50"}`}>
                <span>{u.nombre} <span className="text-neutral-400">· {u.email}</span></span>
                <span className="text-xs text-neutral-500">{u.rol === "ADMIN" ? "Administrador" : u.activo ? "Usuario" : "Desactivado"}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
