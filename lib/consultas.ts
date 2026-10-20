import { db } from "./db";
import { diasRestantes, fechaLimiteDDU, fechaRenovacion } from "./plazos";
import { cargarInhabiles } from "./inhabiles";
import { TIPOS_SIGNO } from "./catalogos";

export const ACTIVAS = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"];

export type Vencimiento = {
  expedienteId: string;
  denominacion: string;
  numeroExpediente: string | null;
  numeroRegistro: string | null;
  cliente: string;
  telefono: string | null;
  tipo: "DDU" | "RENOVACION";
  fecha: Date;
  dias: number;
  contratada?: boolean; // el cliente ya la pagó y falta presentarla
};

/** Declaraciones de uso y renovaciones pendientes de marcas concedidas. */
export async function vencimientos({ desdeDias = -90, hastaDias = 365 } = {}) {
  const exps = await db.expediente.findMany({
    where: { fechaConcesion: { not: null }, etapa: { not: "ABANDONADA" }, tipo: { in: TIPOS_SIGNO } }, // DDU y renovación: solo signos distintivos
    select: {
      id: true, denominacion: true, numeroExpediente: true, numeroRegistro: true, fechaConcesion: true, ultimoEstatus: true,
      cliente: { select: { nombre: true, telefono: true } },
      servicios: { select: { tipo: true, fechaContratacion: true, estadoTrabajo: true } },
      tramitesImpi: { select: { descripcion: true, fechaInicio: true } },
    },
  });
  const inhabiles = await cargarInhabiles();
  const out: Vencimiento[] = [];
  for (const e of exps) {
    const conc = e.fechaConcesion!;
    const base = { expedienteId: e.id, denominacion: e.denominacion, numeroExpediente: e.numeroExpediente, numeroRegistro: e.numeroRegistro, cliente: e.cliente.nombre, telefono: e.cliente.telefono };
    // DDU presentada: servicio DDU que no esté pendiente (morado) en el Excel
    const dduHecha =
      e.servicios.some((s) => s.tipo === "DDU" && s.estadoTrabajo !== "PENDIENTE") ||
      /ddu/i.test(e.ultimoEstatus ?? "") ||
      e.tramitesImpi.some((t) => /DECLARACI[OÓ]N DE USO/i.test(t.descripcion)); // presentada ante el IMPI (MARCanet)
    const dduContratada = e.servicios.some((s) => s.tipo === "DDU" && s.estadoTrabajo === "PENDIENTE");
    if (!dduHecha) {
      const f = fechaLimiteDDU(conc, inhabiles);
      const d = diasRestantes(f);
      if (dduContratada || (d >= desdeDias && d <= hastaDias)) out.push({ ...base, tipo: "DDU", fecha: f, dias: d, contratada: dduContratada });
    }
    const f = fechaRenovacion(conc);
    const renovada =
      e.servicios.some((s) => s.tipo === "RENOVACION" && s.fechaContratacion && s.fechaContratacion > conc) ||
      e.tramitesImpi.some((t) => /RENOVACI/i.test(t.descripcion) && t.fechaInicio && t.fechaInicio > conc);
    const d = diasRestantes(f);
    if (!renovada && d >= desdeDias && d <= hastaDias) out.push({ ...base, tipo: "RENOVACION", fecha: f, dias: d });
  }
  return out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

export async function notificacionesActivas() {
  return db.notificacion.findMany({
    where: { estado: { in: ACTIVAS } },
    include: { expediente: { include: { cliente: { select: { nombre: true, telefono: true } } } } },
    orderBy: { fechaLimite: "asc" },
  });
}
