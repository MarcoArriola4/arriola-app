"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RESULTADOS, cerrarSesionVendedora, crearSesionVendedora, fechaHoraLocalMx, requerirVendedora } from "@/lib/vendedoras";

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim() || null;

/** Entrar con nombre + contraseña (5 intentos fallidos = 15 min de espera). */
export async function entrarVendedora(form: FormData) {
  const nombre = txt(form, "nombre") ?? "";
  const password = String(form.get("password") ?? "");
  const clave = `vendedora:${nombre.toLowerCase()}`;
  if ((await db.intentoLogin.count({ where: { email: clave, fecha: { gte: new Date(Date.now() - VENTANA_MS) } } })) >= MAX_INTENTOS) redirect("/vendedoras/login?error=bloqueado");
  const v = await db.vendedora.findFirst({ where: { nombre: { equals: nombre, mode: "insensitive" } } });
  if (!v || !(await bcrypt.compare(password, v.passwordHash))) {
    await db.intentoLogin.create({ data: { email: clave } });
    redirect("/vendedoras/login?error=1");
  }
  if (!v.activa) redirect("/vendedoras/login?error=inactiva");
  await db.intentoLogin.deleteMany({ where: { email: clave } });
  await crearSesionVendedora(v.id, v.nombre);
  redirect("/vendedoras");
}

export async function salirVendedora() {
  await cerrarSesionVendedora();
  redirect("/vendedoras/login");
}

/** Registrar una llamada: si contestó, qué dijo, si se envió cotización y cuándo volver a llamar. */
export async function registrarLlamada(form: FormData) {
  const v = await requerirVendedora();
  const leadId = txt(form, "leadId")!;
  const resultado = txt(form, "resultado") ?? "";
  if (!(resultado in RESULTADOS)) throw new Error("Elige qué pasó en la llamada");
  const lead = await db.lead.findFirst({ where: { id: leadId, vendedoraId: v.id } });
  if (!lead) throw new Error("Este contacto no es tuyo");
  const comentario = txt(form, "comentario");
  const cotizacion = form.get("cotizacion") === "on" || resultado === "COTIZACION";
  const volver = fechaHoraLocalMx(txt(form, "volverLlamar"));
  const ahora = new Date();
  await db.llamada.create({
    data: { leadId, vendedoraId: v.id, fecha: ahora, contesto: RESULTADOS[resultado].contesto, resultado, comentario, cotizacion, volverLlamar: volver },
  });
  await db.lead.update({
    where: { id: leadId },
    data: {
      estado: resultado,
      cotizacion: lead.cotizacion || cotizacion,
      ...(comentario && { comentario }),
      // El recordatorio nuevo reemplaza al anterior; si no se pone, el que ya se cumplió se cierra
      volverLlamar: volver ?? (lead.volverLlamar && lead.volverLlamar > ahora && !["VENDIDO", "NO_INTERESA"].includes(resultado) ? lead.volverLlamar : null),
      ultimaLlamada: ahora,
      intentos: { increment: 1 },
    },
  });
  revalidatePath("/vendedoras");
  revalidatePath("/llamadas");
}

/** Observaciones de la vendedora sobre un contacto (el apartado de cada renglón). */
export async function guardarObservaciones(leadId: string, texto: string) {
  const v = await requerirVendedora();
  const r = await db.lead.updateMany({ where: { id: leadId, vendedoraId: v.id }, data: { observaciones: texto.trim() || null } });
  if (!r.count) throw new Error("Este contacto no es tuyo");
  revalidatePath("/llamadas");
}

/** Agregar un contacto que consiguió la vendedora (queda para hoy). */
export async function agregarContactoPropio(form: FormData) {
  const v = await requerirVendedora();
  const nombre = txt(form, "nombre");
  const telefono = txt(form, "telefono");
  if (!nombre || !telefono) throw new Error("Falta el nombre o el teléfono");
  await db.lead.create({ data: { vendedoraId: v.id, nombre, telefono, email: txt(form, "email"), nota: txt(form, "nota"), asignadoEl: new Date(), propio: true } });
  revalidatePath("/vendedoras");
  revalidatePath("/llamadas");
}
