// Registros de contacto (llamada o WhatsApp) de las vendedoras: leer el formulario y mantener al día el contacto.
import { db } from "./db";
import { CANALES, CERRADOS, INTERES, RESULTADOS, fechaHoraLocalMx } from "./vendedoras";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim() || null;

/** Lee y valida el formulario de un registro (nuevo o corregido). */
export function leerRegistro(form: FormData) {
  const canal = txt(form, "canal") ?? "LLAMADA";
  if (!(canal in CANALES)) throw new Error("Elige si fue llamada o WhatsApp");
  const resultado = txt(form, "resultado") ?? "";
  if (!(resultado in RESULTADOS)) throw new Error("Elige qué pasó");
  const comentario = String(form.get("comentario") ?? "").trim().slice(0, 4000) || null;
  const cotizacion = form.get("cotizacion") === "on" || resultado === "COTIZACION";
  // Con cotización hay que decir si el cliente está interesado o si es solo para darle seguimiento
  const interes = cotizacion ? txt(form, "interes") : null;
  if (cotizacion && !(interes && interes in INTERES)) throw new Error("Con cotización: elige si está interesado o si es solo para dar seguimiento");
  const volverTxt = txt(form, "volverLlamar");
  const volver = fechaHoraLocalMx(volverTxt);
  if (volverTxt && !volver) throw new Error("La fecha del recordatorio no es válida");
  return { canal, resultado, contesto: RESULTADOS[resultado].contesto, comentario, cotizacion, interes, volverLlamar: CERRADOS.includes(resultado) ? null : volver };
}

/**
 * Vuelve a calcular el estado del contacto a partir de sus registros (después de corregir o borrar uno).
 * `volverLlamar`: si se pasa, es el nuevo recordatorio del contacto.
 */
export async function recalcularLead(leadId: string, volverLlamar?: Date | null) {
  const regs = await db.llamada.findMany({ where: { leadId }, orderBy: { fecha: "desc" } });
  const u = regs[0];
  await db.lead.update({
    where: { id: leadId },
    data: u
      ? {
          estado: u.resultado,
          comentario: regs.find((r) => r.comentario)?.comentario ?? null,
          cotizacion: regs.some((r) => r.cotizacion),
          canal: u.canal,
          contestoPor: regs.find((r) => r.contesto)?.canal ?? null,
          ultimaLlamada: u.fecha,
          intentos: regs.length,
          ...(volverLlamar !== undefined && { volverLlamar: CERRADOS.includes(u.resultado) ? null : volverLlamar }),
        }
      : { estado: "PENDIENTE", comentario: null, cotizacion: false, canal: null, contestoPor: null, ultimaLlamada: null, intentos: 0, volverLlamar: null },
  });
}

/** Corrige un registro. Si es el más reciente del contacto, su recordatorio pasa a ser el del contacto. */
export async function corregirRegistro(id: string, form: FormData, soloDe?: string) {
  const r = await db.llamada.findUnique({ where: { id }, select: { id: true, leadId: true, vendedoraId: true, fecha: true } });
  if (!r || (soloDe && r.vendedoraId !== soloDe)) throw new Error("Este registro ya no existe. Recarga la página.");
  const d = leerRegistro(form);
  await db.llamada.update({ where: { id }, data: { ...d, editado: new Date() } });
  const ultimo = await db.llamada.findFirst({ where: { leadId: r.leadId }, orderBy: { fecha: "desc" }, select: { id: true } });
  await recalcularLead(r.leadId, ultimo?.id === id ? d.volverLlamar : undefined);
}

/** Borra un registro (solo el gerente) y recalcula el contacto. */
export async function borrarRegistro(id: string) {
  const r = await db.llamada.findUnique({ where: { id }, select: { leadId: true } });
  if (!r) throw new Error("Este registro ya no existe");
  await db.llamada.delete({ where: { id } });
  const u = await db.llamada.findFirst({ where: { leadId: r.leadId }, orderBy: { fecha: "desc" }, select: { volverLlamar: true } });
  await recalcularLead(r.leadId, u?.volverLlamar && u.volverLlamar > new Date() ? u.volverLlamar : null);
}
