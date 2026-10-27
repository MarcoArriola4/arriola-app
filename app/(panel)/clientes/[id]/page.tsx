import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, ChevronLeft, FileText, SearchCheck, Mail, MessageCircle, Phone, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { ESTADOS_TRABAJO, ETAPAS, TIPOS_EXPEDIENTE, TIPOS_OFICIO, TIPOS_SERVICIO, esSigno, fmtFecha, mxn, normalizarNombre } from "@/lib/catalogos";
import { type Inhabiles } from "@/lib/plazos";
import { analizarDDU, analizarRenovacion } from "@/lib/cumplimiento";
import { cargarInhabiles } from "@/lib/inhabiles";
import { EstadoPago, Etapa, Metrica, Origen, Parcialidades, PlazoOficio, Vacio } from "@/components/ui";
import { AccesoImpi, Abono, BotonMarcanet, CambiarEtapa, EditarCliente, EditarExpediente, EditarServicio, EliminarMarca, HerramientasCliente, NuevoCobro, YaNoContinua } from "@/components/ficha";
import { ControlOficio, SeguimientoNuevo } from "@/components/control-oficio";
import { tipoDesdeImpi } from "@/lib/marcanet/sincronizar";
import { NotasMarca } from "@/components/notas-marca";
import { SeccionAuditoria } from "@/components/seccion-auditoria";
import { dondeAparece, textoPlazo } from "@/lib/estado-oficio";
import { estaVencida } from "@/lib/plazos";
import { agregarEvento } from "@/app/actions";
import { NuevaNotificacion } from "../../notificaciones/nueva";

// La consulta a MARCanet de una marca puede tardar ~20 s
export const maxDuration = 60;

const ACTIVAS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"];
// Estado del trabajo: catálogo único (Por trabajar, Presentar, Pagar en sistema, Trabajado…)
const TRABAJO = ESTADOS_TRABAJO;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = await db.cliente.findUnique({ where: { id: (await params).id }, select: { nombre: true } });
  return { title: c?.nombre ?? "Cliente" };
}

export default async function PerfilCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ marca?: string; ok?: string }> }) {
  const [{ id }, { marca, ok }, sesion] = await Promise.all([params, searchParams, requerirSesion()]);
  const puede = (p: string) => sesion.permisos.has(p);

  const c = await db.cliente.findUnique({
    where: { id },
    include: {
      expedientes: {
        include: {
          servicios: { orderBy: [{ fechaContratacion: "desc" }, { creado: "desc" }] },
          notificaciones: { orderBy: { fechaNotificacion: "desc" } },
          eventos: { orderBy: [{ fecha: "desc" }, { creado: "desc" }], take: 150 },
          oficiosImpi: { orderBy: { fechaOficio: "desc" } },
          promocionesImpi: { orderBy: { fechaPresentacion: "desc" } },
          tramitesImpi: { orderBy: { fechaInicio: "desc" } },
          notasMarca: { orderBy: { creado: "desc" } },
        },
        orderBy: [{ actualizado: "desc" }],
      },
    },
  });
  if (!c) notFound();

  const sel = c.expedientes.find((e) => e.id === marca) ?? c.expedientes[0];
  const auditoria = sesion.rol === "ADMIN" ? await db.auditoria.findFirst({ where: { clienteId: c.id }, orderBy: { creado: "desc" } }) : null;
  const inhabiles = await cargarInhabiles();
  const servicios = c.expedientes.flatMap((e) => e.servicios);
  const pagado = servicios.reduce((a, s) => a + s.pagado, 0);
  const debe = servicios.reduce((a, s) => a + Math.max(0, (s.costo ?? 0) - s.pagado), 0);
  const oficiosActivos = c.expedientes.flatMap((e) => e.notificaciones).filter((n) => ACTIVAS.includes(n.estado)).length;
  const tel = c.telefono?.split(/[/,]/)[0].replace(/\D/g, "") ?? "";
  const marcas = c.expedientes.filter((e) => esSigno(e.tipo));
  const otros = c.expedientes.filter((e) => !esSigno(e.tipo));
  const n = marcas.length;

  return (
    <>
      <Link href="/clientes" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> Clientes</Link>

      {ok === "alta" && (
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-marca-claro px-4 py-2.5 text-sm text-marca-oscuro"><CheckCircle2 size={16} /> Servicio dado de alta.</p>
      )}

      {/* Encabezado del cliente */}
      <section className="card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-carbon text-xl font-semibold text-marca">{c.nombre.trim().charAt(0)}</span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{c.nombre}</h1>
              <p className="mt-0.5 text-sm text-neutral-500">
                {[c.telefono, c.email, c.rfc && `RFC ${c.rfc}`].filter(Boolean).join(" · ") || "Sin datos de contacto"}
              </p>
              <p className="mt-1 text-sm font-medium text-neutral-700">
                {n === 1 ? "Este cliente solo tiene esta marca" : `Este cliente tiene ${n} marcas`}
                {otros.length > 0 && ` · ${otros.length} ${otros.length === 1 ? "patente o diseño" : "patentes o diseños"}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tel.length >= 10 && <a href={`https://wa.me/${tel.length === 10 ? "52" + tel : tel}`} target="_blank" rel="noreferrer" className="btn text-green-700"><MessageCircle size={14} /> WhatsApp</a>}
            {tel.length >= 10 && <a href={`tel:${tel}`} className="btn"><Phone size={14} /> Llamar</a>}
            {c.email && <a href={`mailto:${c.email}`} className="btn"><Mail size={14} /> Correo</a>}
            {sesion.rol === "ADMIN" && <HerramientasCliente c={{ id: c.id, nombre: c.nombre }} marcas={c.expedientes.length} />}
            {sesion.rol === "ADMIN" && <Link href={`/clientes/${c.id}/auditoria`} className="btn"><SearchCheck size={14} /> Auditoría + Reporte</Link>}
            <Link href={`/clientes/${c.id}/reporte`} className="btn"><FileText size={14} /> Reporte rápido</Link>
            {puede("altas") && <EditarCliente c={{ id: c.id, nombre: c.nombre, telefono: c.telefono, email: c.email, rfc: c.rfc, notas: c.notas }} />}
            {puede("altas") && <Link href={`/admin/alta?cliente=${c.id}`} className="btn-primario"><Plus size={14} /> Agregar servicio</Link>}
          </div>
        </div>
        {c.notas && <p className="mt-3 whitespace-pre-line rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{c.notas}</p>}
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica label="Marcas" valor={n} />
        <Metrica label="Oficios en curso" valor={oficiosActivos} tono={oficiosActivos ? "ambar" : undefined} />
        <Metrica label="Total pagado" valor={mxn.format(pagado)} tono="verde" />
        <Metrica label="Saldo pendiente" valor={mxn.format(debe)} tono={debe > 0 ? "rojo" : undefined} />
      </div>

      {sesion.rol === "ADMIN" && <SeccionAuditoria clienteId={c.id} a={auditoria} />}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lista de marcas */}
        <aside>
          <ListaExpedientes titulo="Marcas" lista={marcas} clienteId={c.id} selId={sel?.id} cliente={c.nombre} />
          {puede("altas") && (
            <Link href={`/admin/alta?cliente=${c.id}&servicio=MARCA`} className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/15 py-3 text-sm text-neutral-500 hover:border-black/30 hover:text-black">
              <Plus size={14} /> Agregar marca
            </Link>
          )}
          <div className="mt-6">
            <ListaExpedientes titulo="Patentes, diseños y otros" lista={otros} clienteId={c.id} selId={sel?.id} cliente={c.nombre} vacio="Sin patentes ni diseños registrados." />
            {puede("altas") && (
              <Link href={`/admin/alta?cliente=${c.id}&servicio=PATENTE`} className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-black/15 py-3 text-sm text-neutral-500 hover:border-black/30 hover:text-black">
                <Plus size={14} /> Agregar patente o diseño industrial
              </Link>
            )}
          </div>
        </aside>

        {/* Detalle de la marca elegida */}
        {sel ? <DetalleMarca e={sel} permisos={sesion.permisos} inhabiles={inhabiles} /> : <div className="card"><Vacio>Este cliente aún no tiene marcas.</Vacio></div>}
      </div>
    </>
  );
}

function ListaExpedientes({ titulo, lista, clienteId, selId, vacio, cliente }: { titulo: string; lista: Exp[]; clienteId: string; selId?: string; vacio?: string; cliente: string }) {
  // Agrupadas por titular / razón social ("JUAN PÉREZ LÓPEZ / EMPRESA UNO", "… / EMPRESA DOS")
  const grupos = new Map<string, Exp[]>();
  for (const e of lista) {
    // "EMPRESA UNO S.A. DE C.V." y "EMPRESA UNO, S.A. DE C.V." van juntas
    const k = normalizarNombre(e.titular ?? cliente).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    grupos.set(k, [...(grupos.get(k) ?? []), e]);
  }
  const ordenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  const varios = ordenados.length > 1;
  return (
    <>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{titulo} <span className="text-neutral-400">{lista.length}</span></h2>
      {lista.length === 0 && vacio && <p className="px-1 text-xs text-neutral-400">{vacio}</p>}
      {ordenados.map(([k, items]) => (
        <div key={k} className={varios ? "mb-4" : ""}>
          {varios && (
            <p className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-black/10 px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
              <span className="min-w-0">{(items[0].titular ?? cliente).split("/").slice(1).join("/").trim() || (items[0].titular ?? cliente)}</span>
              <span className="flex shrink-0 items-center gap-2 font-normal text-neutral-400">
                <Link href={`/clientes/${clienteId}/reporte?titular=${encodeURIComponent(k)}`} className="normal-case text-neutral-500 hover:text-black hover:underline">Reporte</Link>
                {items.length}
              </span>
            </p>
          )}
          <ul className="space-y-2">
            {[...items].sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es")).map((e) => {
              const activa = e.notificaciones.find((x) => ACTIVAS.includes(x.estado));
              const elegida = e.id === selId;
              return (
                <li key={e.id}>
                  <Link
                    href={`/clientes/${clienteId}?marca=${e.id}`}
                    scroll={false}
                    className={`block rounded-xl border p-3 transition ${e.desistio ? "border-red-200 bg-red-50/40" : "bg-white"} ${elegida ? "border-marca ring-2 ring-marca/30" : "border-black/[0.07] hover:border-black/20"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 text-sm font-semibold leading-snug">{e.denominacion}</p>
                      <Etapa etapa={e.etapa} desistio={e.desistio} />
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {TIPOS_EXPEDIENTE[e.tipo]} · Exp. {e.numeroExpediente ?? "s/n"}
                      {e.numeroRegistro && ` · Reg. ${e.numeroRegistro}`}
                    </p>
                    {activa && (
                      <p className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="text-amber-700">{TIPOS_OFICIO[activa.tipo]}</span>
                        {activa.estado === "EN_TRABAJO" || activa.estado === "PAGAR_SISTEMA" ? (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">{activa.estado === "EN_TRABAJO" ? "Pagado · por trabajar" : "Pagar en sistema"}</span>
                        ) : (
                          <PlazoOficio n={activa} />
                        )}
                      </p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

type Exp = Prisma.ExpedienteGetPayload<{ include: { servicios: true; notificaciones: true; eventos: true; oficiosImpi: true; promocionesImpi: true; tramitesImpi: true; notasMarca: true } }>;

function DetalleMarca({ e, permisos }: { e: Exp; permisos: Set<string>; inhabiles: Inhabiles }) {
  const puede = (p: string) => permisos.has(p);
  const totalCosto = e.servicios.reduce((a, s) => a + (s.costo ?? 0), 0);
  const totalPagado = e.servicios.reduce((a, s) => a + s.pagado, 0);
  const signo = esSigno(e.tipo);
  const dduHecha =
    e.servicios.some((s) => s.tipo === "DDU" && s.estadoTrabajo !== "PENDIENTE") ||
    /ddu/i.test(e.ultimoEstatus ?? "") ||
    e.tramitesImpi.some((t) => /DECLARACI[OÓ]N DE USO/i.test(t.descripcion));
  // Oficios abiertos primero; luego los contestados o cerrados más recientes
  const oficios = [...e.notificaciones]
    .sort((a, b) => Number(ACTIVAS.includes(b.estado) || b.estado === "NO_PAGO") - Number(ACTIVAS.includes(a.estado) || a.estado === "NO_PAGO") || b.fechaNotificacion.getTime() - a.fechaNotificacion.getTime())
    .slice(0, 8);

  return (
    <div className="min-w-0 space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{e.denominacion}</h2>
              {e.desistio ? <Etapa etapa={e.etapa} desistio /> : puede("marcas") ? <CambiarEtapa expedienteId={e.id} etapa={e.etapa} etapas={ETAPAS} /> : <Etapa etapa={e.etapa} />}
            </div>
            {e.titular && <p className="mt-0.5 text-xs text-neutral-500">Titular: {e.titular}</p>}
            <p className="mt-1 text-sm text-neutral-500">
              {TIPOS_EXPEDIENTE[e.tipo]} · Expediente <b className="font-medium text-neutral-800">{e.numeroExpediente ?? "sin número"}</b>
              {e.numeroRegistro && <> · Registro <b className="font-medium text-neutral-800">{e.numeroRegistro}</b></>}
            </p>
            {e.ultimaActImpi && e.ultimaActImpiFecha ? (
              <p className={`mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${e.ultimaActImpiDe === "IMPI" ? "bg-violet-50 text-violet-800" : "bg-sky-50 text-sky-800"}`}>
                <b className="font-semibold">Última actualización IMPI · {fmtFecha(e.ultimaActImpiFecha)}:</b>
                {e.ultimaActImpiDe === "IMPI" ? "El IMPI contestó" : "Ingresaste"} — {e.ultimaActImpi}
                {e.ultimaActImpiDe === "DESPACHO" && <span className="opacity-70">(en espera de respuesta)</span>}
              </p>
            ) : (
              e.ultimoEstatus && <p className="mt-1 text-xs text-neutral-400">Último estatus: {e.ultimoEstatus}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {puede("marcas") && <YaNoContinua expedienteId={e.id} denominacion={e.denominacion} activo={!!e.desistio} />}
            {puede("cobros") && <NuevoCobro expedienteId={e.id} />}
            {puede("oficios") && <NuevaNotificacion expediente={{ id: e.id, denominacion: e.denominacion, numeroExpediente: e.numeroExpediente }} />}
          </div>
        </div>

        {oficios.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Oficios de esta marca</h3>
            {oficios.map((n) => {
              const vencida = ACTIVAS.includes(n.estado) && estaVencida(n);
              const abierta = ACTIVAS.includes(n.estado) || n.estado === "NO_PAGO";
              const donde = dondeAparece(n);
              return (
                <div key={n.id} className={`rounded-lg border px-3 py-2.5 text-sm ${abierta ? (vencida ? "border-red-200 bg-red-50/50" : "border-amber-200 bg-amber-50/60") : "border-black/[0.07] bg-neutral-50/60"}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`font-medium ${abierta ? "text-amber-900" : "text-neutral-700"}`}>{TIPOS_OFICIO[n.tipo] ?? n.tipo}</span>
                    {n.numeroOficio && <span className="text-[11px] text-marca-oscuro">✓ IMPI · oficio {n.numeroOficio}</span>}
                    <span className="text-xs text-neutral-500">
                      {n.estado === "CONTESTADA" ? `Notificado el ${fmtFecha(n.fechaNotificacion)} · contestado el ${fmtFecha(n.fechaContestacion)}` : textoPlazo(n)}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11px] text-neutral-500">
                      {abierta && !vencida && <PlazoOficio n={n} />}
                      {donde}
                    </span>
                  </div>
                  <ControlOficio
                    conPasos
                    soloLectura={!puede("oficios")}
                    o={{ id: n.id, estado: n.estado, tipo: n.tipo, denominacion: e.denominacion, fechaLimite: n.fechaLimite.toISOString(), fechaLimiteRevision: n.fechaLimiteRevision?.toISOString() ?? null, montoCotizado: n.montoCotizado }}
                  />
                </div>
              );
            })}
          </div>
        )}
        {puede("eliminar") && (
          <div className="mt-4 flex justify-end border-t border-black/5 pt-3">
            <EliminarMarca expedienteId={e.id} denominacion={e.denominacion} cobros={e.servicios.length} />
          </div>
        )}
      </section>

      <NotasMarca
        expedienteId={e.id}
        editable={puede("marcas")}
        notas={e.notasMarca.map((n) => ({ id: n.id, texto: n.texto, autor: n.autor, creado: n.creado.toISOString(), editado: n.editado?.toISOString() ?? null }))}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="card p-4">
          <h3 className="mb-3 text-sm font-semibold">Fechas clave</h3>
          <dl className="space-y-2 text-sm">
            <Fila label="Presentación" valor={fmtFecha(e.fechaPresentacion)} />
            <Fila label="Concesión" valor={fmtFecha(e.fechaConcesion)} />
            {signo && e.fechaConcesion && (() => {
              // Reglas: DDU solo si se concedió a partir del 10/08/2018 (3 meses tras el 3er aniversario); renovación a los 10 años
              const tono = { verde: "text-marca-oscuro", azul: "text-sky-700", ambar: "text-amber-700", rojo: "text-red-600", gris: "text-neutral-500" };
              const ddu = analizarDDU(e.fechaConcesion, e.tramitesImpi);
              const dduTexto = ddu && dduHecha && ddu.tono !== "verde" && ddu.tono !== "gris" && ddu.tono !== "azul" ? { texto: "Presentada (según el registro del despacho)", tono: "verde" as const } : ddu;
              const renov = analizarRenovacion(e.fechaConcesion, null, e.tramitesImpi);
              return (
                <>
                  {dduTexto && <Fila label="Declaración de uso" valor={<span className={`text-xs ${tono[dduTexto.tono]}`}>{dduTexto.texto.replace(/^Declaración de uso:? ?/, "")}</span>} />}
                  {renov && <Fila label="Renovación" valor={<span className={`text-xs ${tono[renov.tono]}`}>{renov.texto}</span>} />}
                </>
              );
            })()}
          </dl>
        </section>
        <AccesoImpi expedienteId={e.id} usuario={e.impiUsuario} tienePassword={!!e.impiPasswordEnc} />
      </div>

      {/* Datos públicos del IMPI (solo marcas, avisos y nombres comerciales están en MARCanet) */}
      {signo && <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">IMPI · MARCanet</h3>
            <p className="text-xs text-neutral-500">
              {e.marcanetSync ? `Consultado el ${e.marcanetSync.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : "Aún no se ha consultado"}
              {e.marcanetError && <span className="text-red-600"> · {e.marcanetError}</span>}
            </p>
          </div>
          {e.numeroExpediente && <BotonMarcanet expedienteId={e.id} />}
        </div>
        {e.oficiosImpi.length === 0 ? <Vacio>{e.marcanetSync ? "El IMPI no tiene oficios registrados para este expediente." : "Se llenará con la próxima consulta automática."}</Vacio> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead><tr className="border-b border-black/5"><th className="th">Oficio del IMPI</th><th className="th">Fecha</th><th className="th">Notificación</th><th className="th">Contestación</th><th className="th">Seguimiento del despacho</th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {e.oficiosImpi.map((o) => {
                  const promo = e.promocionesImpi.find((p) => p.oficioRelacionado === o.numero);
                  const interno = /ARCHIVO FON|EXAMEN FIGURATIVO/i.test(o.descripcion);
                  return (
                    <tr key={o.id} className={interno ? "text-neutral-400" : ""}>
                      <td className="td"><span className={interno ? "" : "font-medium"}>{o.descripcion}</span><span className="block text-xs text-neutral-400">No. {o.numero}{o.tramite ? ` · ${o.tramite}` : ""}</span></td>
                      <td className="td whitespace-nowrap">{fmtFecha(o.fechaOficio)}</td>
                      <td className="td">
                        {o.fechaNotificacion ? <span className="whitespace-nowrap">{fmtFecha(o.fechaNotificacion)}</span> : interno ? "—" : <span className="text-sky-700" title={o.estadoNotificacion ?? ""}>Aún no notificado</span>}
                      </td>
                      <td className="td">{promo ? <span className="text-marca-oscuro">{fmtFecha(promo.fechaPresentacion)}<span className="block text-xs text-neutral-400">{promo.descripcion}</span></span> : interno ? "" : "—"}</td>
                      <td className="td min-w-[300px]">
                        {interno ? null : (() => {
                          // La tarjeta de este oficio en la app (misma marca): su paso se cambia aquí y se refleja en todos lados
                          const n = e.notificaciones.find((x) => x.numeroOficio === o.numero);
                          if (n) {
                            return (
                              <>
                                <ControlOficio conPasos soloLectura={!puede("oficios")} o={{ id: n.id, estado: n.estado, tipo: n.tipo, denominacion: e.denominacion, fechaLimite: n.fechaLimite.toISOString(), fechaLimiteRevision: n.fechaLimiteRevision?.toISOString() ?? null, montoCotizado: n.montoCotizado }} />
                                <span className="mt-1 block text-[11px] text-neutral-400">{TIPOS_OFICIO[n.tipo]} · {dondeAparece(n)}</span>
                              </>
                            );
                          }
                          return puede("oficios") ? <SeguimientoNuevo oficioImpiId={o.id} tipoSugerido={tipoDesdeImpi(o.descripcion)} /> : <span className="text-xs text-neutral-400">Sin seguimiento</span>;
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {e.tramitesImpi.length > 0 && (
          <p className="border-t border-black/5 px-4 py-2.5 text-xs text-neutral-500">
            Trámites: {e.tramitesImpi.map((t) => `${t.descripcion} (${fmtFecha(t.fechaInicio)})`).join(" · ")}
          </p>
        )}
      </section>}

      {/* Pagos */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 px-4 py-3">
          <h3 className="text-sm font-semibold">Pagos de esta marca</h3>
          <p className="text-xs text-neutral-500">
            Pagado <b className="text-neutral-800">{mxn.format(totalPagado)}</b> de {mxn.format(totalCosto)}
            {totalCosto - totalPagado > 0 && <span className="ml-2 font-medium text-red-600">Debe {mxn.format(totalCosto - totalPagado)}</span>}
          </p>
        </div>
        {e.servicios.length === 0 ? <Vacio>Sin cobros registrados.</Vacio> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="border-b border-black/5"><th className="th">Servicio</th><th className="th">Fecha</th><th className="th text-right">Costo</th><th className="th text-right">Pagado</th><th className="th">Estado</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-black/5">
                {e.servicios.map((s) => (
                  <tr key={s.id}>
                    <td className="td">
                      <span className="font-medium">{TIPOS_SERVICIO[s.tipo]}</span> <Origen origen={s.origenVenta} />
                      {s.vendedor && <span className="ml-1 text-[11px] text-neutral-400">· vendió {s.vendedor}</span>}
                      {s.estadoTrabajo && TRABAJO[s.estadoTrabajo] && (
                        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium ${TRABAJO[s.estadoTrabajo].cls}`}>{TRABAJO[s.estadoTrabajo].txt}</span>
                      )}
                      {(s.notas || s.avance) && <span className="block max-w-xs truncate text-xs text-neutral-400">{[s.avance, s.notas].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className="td whitespace-nowrap text-neutral-600">{fmtFecha(s.fechaContratacion)}</td>
                    <td className="td whitespace-nowrap text-right">{s.costo ? mxn.format(s.costo) : "—"}<Parcialidades s={s} /></td>
                    <td className="td whitespace-nowrap text-right">{mxn.format(s.pagado)}<span className="block text-xs text-neutral-400">{s.banco}</span></td>
                    <td className="td"><EstadoPago estado={s.estadoPago} /></td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        {s.estadoPago !== "PAGADO" && puede("cobros") && <Abono servicioId={s.id} restante={(s.costo ?? 0) - s.pagado} />}
                        {puede("cobros") && (
                          <EditarServicio s={{ id: s.id, tipo: s.tipo, fechaContratacion: s.fechaContratacion?.toISOString().slice(0, 10) ?? "", costo: s.costo, pagado: s.pagado, banco: s.banco, origenVenta: s.origenVenta, vendedor: s.vendedor, notas: s.notas }} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historial */}
      <section className="card">
        <h3 className="border-b border-black/5 px-4 py-3 text-sm font-semibold">Historial</h3>
        <form action={agregarEvento} className="flex flex-wrap gap-2 border-b border-black/5 px-4 py-3">
          <input type="hidden" name="expedienteId" value={e.id} />
          <input type="date" name="fecha" defaultValue={new Date().toLocaleDateString("en-CA")} className="input w-auto" />
          <input name="titulo" required placeholder="Agregar nota: se llamó al cliente, se envió escrito…" className="input min-w-0 flex-1" />
          <button className="btn">Agregar</button>
        </form>
        {e.eventos.length === 0 ? <Vacio>Sin movimientos.</Vacio> : (
          <ol className="px-4 py-3">
            {[...e.eventos].sort((a, b) => b.fecha.getTime() - a.fecha.getTime()).map((ev) => (
              <li key={ev.id} className="relative border-l border-black/10 pb-4 pl-5 last:pb-1">
                <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${ev.importado ? "bg-neutral-300" : "bg-marca"}`} />
                <p className="text-xs text-neutral-400">{fmtFecha(ev.fecha)}{ev.autor && ` · ${ev.autor}`}</p>
                <p className="text-sm">{ev.titulo}</p>
                {ev.detalle && <p className="text-xs text-neutral-500">{ev.detalle}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <EditarExpediente
        e={{
          id: e.id, denominacion: e.denominacion, tipo: e.tipo, numeroExpediente: e.numeroExpediente, numeroRegistro: e.numeroRegistro, etapa: e.etapa,
          fechaPresentacion: e.fechaPresentacion?.toISOString().slice(0, 10) ?? "", fechaConcesion: e.fechaConcesion?.toISOString().slice(0, 10) ?? "", notas: e.notas ?? "",
        }}
        etapas={ETAPAS}
        tipos={TIPOS_EXPEDIENTE}
      />
      {e.notas && (
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-semibold">Notas de la marca</h3>
          <p className="whitespace-pre-line text-sm text-neutral-600">{e.notas}</p>
        </section>
      )}
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-neutral-500">{label}</dt>
      <dd className="flex min-w-0 flex-wrap justify-end text-right">{valor}</dd>
    </div>
  );
}
