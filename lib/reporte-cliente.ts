// Reporte rápido de un cliente (estatus de sus marcas explicado para el cliente). Lo usan la pantalla y el Word.
import type { PrismaClient } from "@prisma/client";
import { ACTIVAS } from "./consultas";
import { TIPOS_OFICIO, esSigno, fmtFecha, normalizarNombre } from "./catalogos";
import { cargarInhabiles } from "./inhabiles";
import { diasRestantes, esperandoImpi, fechaLimiteDDU, fechaRenovacion, siguientePlazo } from "./plazos";

// Estatus explicado para el cliente (sin términos internos del despacho)
export const ESTATUS_CLIENTE: Record<string, { txt: string; cls: string }> = {
  POR_PRESENTAR: { txt: "Por presentar", cls: "bg-neutral-100 text-neutral-700" },
  EN_TRAMITE: { txt: "En trámite ante el IMPI", cls: "bg-sky-50 text-sky-800" },
  CON_OFICIO: { txt: "Requerimiento del IMPI en atención", cls: "bg-amber-50 text-amber-800" },
  CONCEDIDA: { txt: "Registrada", cls: "bg-green-50 text-green-800" },
  NEGATIVA: { txt: "Negativa del IMPI", cls: "bg-red-50 text-red-700" },
  CONFIRMA_ACTO: { txt: "Negativa confirmada", cls: "bg-red-50 text-red-700" },
  EN_JUICIO: { txt: "En recurso de revisión / juicio", cls: "bg-violet-50 text-violet-800" },
  ABANDONADA: { txt: "Abandonada", cls: "bg-neutral-100 text-neutral-500" },
};

export const claveTitular = (t: string) => normalizarNombre(t).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export async function datosReporteCliente(db: PrismaClient, id: string, titular?: string) {
  const c = await db.cliente.findUnique({
    where: { id },
    include: {
      expedientes: {
        include: {
          notificaciones: { where: { estado: { in: [...ACTIVAS, "NO_PAGO"] } }, orderBy: { fechaNotificacion: "desc" } },
          oficiosImpi: { orderBy: { fechaOficio: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!c) return null;
  const inhabiles = await cargarInhabiles(db);
  const hoy = new Date();

  // Agrupadas por titular, ordenadas por titular y luego por marca
  const todas = c.expedientes.map((e) => ({ ...e, tit: (e.titular ?? c.nombre).replace(/\s+/g, " ").trim() }));
  const titulares = [...new Map(todas.map((e) => [claveTitular(e.tit), e.tit])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const elegidas = titular ? todas.filter((e) => claveTitular(e.tit) === titular) : todas;
  const etapa = (e: (typeof elegidas)[number]) => (e.desistio ? "ABANDONADA" : e.etapa);

  const marca = (e: (typeof elegidas)[number]) => {
    const signo = esSigno(e.tipo);
    const ddu = signo && e.fechaConcesion ? fechaLimiteDDU(e.fechaConcesion, inhabiles) : null;
    const renov = signo && e.fechaConcesion ? fechaRenovacion(e.fechaConcesion) : null;
    const oficio = e.notificaciones.find((n) => ACTIVAS.includes(n.estado));
    const proximos: string[] = [];
    if (e.desistio) proximos.push("Sin seguimiento (el titular decidió no continuar)");
    else if (oficio) {
      if (esperandoImpi(oficio)) proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: en espera de la resolución del IMPI`);
      else if (oficio.pendienteNotificar) proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: emitido, pendiente de notificación`);
      else {
        const p = siguientePlazo(oficio);
        proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: responder a más tardar el ${fmtFecha(p.fecha)}${p.etiqueta ? ` (${p.etiqueta.toLowerCase()})` : ""}`);
      }
    }
    if (ddu && diasRestantes(ddu, hoy) >= -30 && diasRestantes(ddu, hoy) <= 365) proximos.push(`Declaración de uso: a más tardar el ${fmtFecha(ddu)}`);
    if (renov && diasRestantes(renov, hoy) <= 365 && diasRestantes(renov, hoy) >= -180) proximos.push(`Renovación: vence el ${fmtFecha(renov)}`);
    if (!proximos.length && renov && e.etapa === "CONCEDIDA") proximos.push(`Vigente hasta el ${fmtFecha(renov)}`);
    const ultimo = e.ultimaActImpi && e.ultimaActImpiFecha ? `${fmtFecha(e.ultimaActImpiFecha)} · ${e.ultimaActImpi}` : e.oficiosImpi[0] ? `${fmtFecha(e.oficiosImpi[0].fechaOficio)} · ${e.oficiosImpi[0].descripcion}` : null;
    const et = etapa(e);
    return {
      id: e.id, denominacion: e.denominacion, tipo: e.tipo, numeroExpediente: e.numeroExpediente, numeroRegistro: e.numeroRegistro,
      fechaPresentacion: e.fechaPresentacion, fechaConcesion: e.fechaConcesion, marcanetSync: e.marcanetSync,
      estatus: ESTATUS_CLIENTE[et] ?? { txt: et, cls: "" }, ultimo, proximos,
    };
  };

  const grupos = titulares
    .filter(([k]) => !titular || k === titular)
    .map(([k, nombre]) => ({ nombre, marcas: elegidas.filter((e) => claveTitular(e.tit) === k).sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es")).map(marca) }))
    .filter((g) => g.marcas.length);

  const cuenta = (et: string[]) => elegidas.filter((e) => et.includes(etapa(e))).length;
  const resumen = [
    { t: "Marcas", n: elegidas.length },
    { t: "Registradas", n: cuenta(["CONCEDIDA"]) },
    { t: "En trámite", n: cuenta(["POR_PRESENTAR", "EN_TRAMITE", "CON_OFICIO"]) },
    { t: "Negativa / juicio", n: cuenta(["NEGATIVA", "CONFIRMA_ACTO", "EN_JUICIO"]) },
  ];
  const sincronizadas = elegidas.map((e) => e.marcanetSync).filter(Boolean) as Date[];
  return {
    cliente: { id: c.id, nombre: c.nombre },
    hoy,
    titulares: titulares.map(([k, n]) => ({ clave: k, nombre: n })),
    titularNombre: titular ? grupos[0]?.nombre ?? null : null,
    ids: elegidas.filter((e) => e.numeroExpediente && esSigno(e.tipo)).map((e) => e.id),
    resumen,
    grupos,
    /** la consulta a MARCanet más antigua y la más reciente de estas marcas */
    consultaMasVieja: sincronizadas.length ? new Date(Math.min(...sincronizadas.map((d) => d.getTime()))) : null,
    consultaMasNueva: sincronizadas.length ? new Date(Math.max(...sincronizadas.map((d) => d.getTime()))) : null,
  };
}

export type DatosReporteCliente = NonNullable<Awaited<ReturnType<typeof datosReporteCliente>>>;
