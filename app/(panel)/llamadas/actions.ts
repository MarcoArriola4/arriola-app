"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { rangoDia } from "@/lib/vendedoras";
import { leerExcelContactos } from "@/lib/vendedoras-excel";

const refrescar = () => {
  revalidatePath("/llamadas");
  revalidatePath("/vendedoras");
};
const validarPassword = (p: string) => {
  if (p.trim().length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres");
  return p.trim();
};

/** Dar acceso al Panel Vendedoras: nombre (con el que entra) y contraseña. */
export async function crearVendedora(nombre: string, password: string) {
  await requerirAdmin();
  const n = nombre.replace(/\s+/g, " ").trim();
  if (n.length < 3) throw new Error("Escribe el nombre completo");
  if (await db.vendedora.findFirst({ where: { nombre: { equals: n, mode: "insensitive" } } })) throw new Error("Ya existe una vendedora con ese nombre");
  await db.vendedora.create({ data: { nombre: n, passwordHash: await bcrypt.hash(validarPassword(password), 10) } });
  refrescar();
}

export async function cambiarPasswordVendedora(id: string, password: string) {
  await requerirAdmin();
  await db.vendedora.update({ where: { id }, data: { passwordHash: await bcrypt.hash(validarPassword(password), 10) } });
  refrescar();
}

/** Quitar o devolver el acceso (sus contactos y llamadas se conservan). */
export async function activarVendedora(id: string, activa: boolean) {
  await requerirAdmin();
  await db.vendedora.update({ where: { id }, data: { activa } });
  refrescar();
}

/** Eliminar el acceso por completo: solo si no tiene contactos ni llamadas (si tiene, se le quita el acceso). */
export async function eliminarVendedora(id: string) {
  await requerirAdmin();
  const v = await db.vendedora.findUniqueOrThrow({ where: { id }, select: { _count: { select: { leads: true, llamadas: true } } } });
  if (v._count.leads || v._count.llamadas) throw new Error("Tiene contactos o llamadas registradas: mejor quítale el acceso para conservar su historial");
  await db.vendedora.delete({ where: { id } });
  refrescar();
}

/**
 * Asignar contactos a una vendedora para un día. Una línea por contacto: "Nombre, teléfono, nota"
 * (también sirve pegar columnas del Excel). El teléfono es el dato con 10 o más dígitos.
 */
export async function asignarContactos(vendedoraId: string, dia: string, texto: string) {
  await requerirAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Elige el día");
  const asignadoEl = new Date(rangoDia(dia).inicio.getTime() + 9 * 3600 * 1000); // 9:00 de ese día
  const contactos: { nombre: string; telefono: string; email: string | null; nota: string | null }[] = [];
  const malas: string[] = [];
  for (const linea of texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const partes = linea.split(/\t|,|;|\|/).map((p) => p.trim()).filter(Boolean);
    const iTel = partes.findIndex((p) => p.replace(/\D/g, "").length >= 10);
    if (iTel < 0) { malas.push(linea); continue; }
    const telefono = partes[iTel];
    const resto = partes.filter((_, i) => i !== iTel);
    const email = resto.find((p) => /\S+@\S+\.\S+/.test(p)) ?? null;
    const sinEmail = resto.filter((p) => p !== email);
    contactos.push({ nombre: sinEmail[0] ?? "Sin nombre", telefono, email, nota: sinEmail.slice(1).join(" · ") || null });
  }
  if (!contactos.length) throw new Error("No encontré contactos con teléfono (10 dígitos o más)");
  await db.lead.createMany({ data: contactos.map((c) => ({ ...c, vendedoraId, asignadoEl })) });
  refrescar();
  return { asignados: contactos.length, sinTelefono: malas.length };
}

/**
 * Subir el Excel de contactos del día para una vendedora. Columnas: Cliente, Marca, Expediente, Teléfono, Correo,
 * Estatus (y Observaciones, opcional). La fila de encabezados puede estar en cualquiera de las primeras 10 filas.
 */
export async function subirExcelContactos(form: FormData) {
  await requerirAdmin();
  const vendedoraId = String(form.get("vendedoraId") ?? "");
  const dia = String(form.get("dia") ?? "");
  const archivo = form.get("archivo");
  if (!vendedoraId) throw new Error("Elige la vendedora");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Elige el día");
  if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elige el archivo de Excel");
  if (archivo.size > 8 * 1024 * 1024) throw new Error("El archivo es muy grande (máx. 8 MB)");
  const { contactos, sinTelefono } = await leerExcelContactos(await archivo.arrayBuffer());
  if (!contactos.length) throw new Error(sinTelefono ? `Ninguna fila tiene teléfono (${sinTelefono} filas sin teléfono)` : "El Excel no tiene contactos debajo de los encabezados");
  const asignadoEl = new Date(rangoDia(dia).inicio.getTime() + 9 * 3600 * 1000);
  await db.lead.createMany({ data: contactos.map((c) => ({ ...c, vendedoraId, asignadoEl })) });
  refrescar();
  return { asignados: contactos.length, sinTelefono };
}

/** Quitar un contacto asignado que todavía no se llama (p. ej. se asignó por error). */
export async function quitarContacto(id: string) {
  await requerirAdmin();
  const l = await db.lead.findUniqueOrThrow({ where: { id }, select: { intentos: true } });
  if (l.intentos > 0) throw new Error("Ya tiene llamadas registradas; no se puede quitar");
  await db.lead.delete({ where: { id } });
  refrescar();
}
