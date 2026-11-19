"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { intentar, rangoDia, type Resultado } from "@/lib/vendedoras";
import { borrarRegistro, corregirRegistro } from "@/lib/vendedoras-registros";
import { leerExcelContactos, leerTextoContactos, type Lectura } from "@/lib/vendedoras-excel";

// Todas devuelven { ok, error } en lugar de lanzar el error: así el mensaje se ve tal cual en producción.

const refrescar = () => {
  revalidatePath("/llamadas");
  revalidatePath("/vendedoras", "layout");
};
const validarPassword = (p: string) => {
  if (p.trim().length < 4) throw new Error("La contraseña debe tener al menos 4 caracteres");
  return p.trim();
};

/** Dar acceso al Panel Vendedoras: nombre (con el que entra) y contraseña. */
export async function crearVendedora(nombre: string, password: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    const n = nombre.replace(/\s+/g, " ").trim();
    if (n.length < 3) throw new Error("Escribe el nombre completo");
    if (await db.vendedora.findFirst({ where: { nombre: { equals: n, mode: "insensitive" } } })) throw new Error("Ya existe una vendedora con ese nombre");
    await db.vendedora.create({ data: { nombre: n, nombreVentas: n.split(" ")[0], passwordHash: await bcrypt.hash(validarPassword(password), 10) } });
    refrescar();
  }, () => "Acceso creado");
}

export async function cambiarPasswordVendedora(id: string, password: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    await db.vendedora.update({ where: { id }, data: { passwordHash: await bcrypt.hash(validarPassword(password), 10) } });
    refrescar();
  }, () => "Contraseña cambiada");
}

/** Quitar o devolver el acceso (sus contactos y llamadas se conservan). */
export async function activarVendedora(id: string, activa: boolean): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    await db.vendedora.update({ where: { id }, data: { activa } });
    refrescar();
  }, () => (activa ? "Acceso devuelto" : "Acceso quitado"));
}

/** Eliminar el acceso por completo: solo si no tiene contactos ni llamadas (si tiene, se le quita el acceso). */
export async function eliminarVendedora(id: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    const v = await db.vendedora.findUniqueOrThrow({ where: { id }, select: { _count: { select: { leads: true, llamadas: true, ventas: true } } } });
    if (v._count.leads || v._count.llamadas || v._count.ventas) throw new Error("Tiene contactos o llamadas registradas: mejor quítale el acceso para conservar su historial");
    await db.vendedora.delete({ where: { id } });
    refrescar();
  }, () => "Vendedora eliminada");
}

/** Guarda los contactos leídos para la vendedora y el día elegidos. */
async function guardarContactos(vendedoraId: string, dia: string, l: Lectura) {
  if (!vendedoraId || !(await db.vendedora.findUnique({ where: { id: vendedoraId }, select: { id: true } }))) throw new Error("Elige la vendedora");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error("Elige el día");
  if (!l.contactos.length) throw new Error("No encontré contactos. Revisa que cada contacto tenga al menos su nombre (Cliente) y su teléfono.");
  const asignadoEl = new Date(rangoDia(dia).inicio.getTime() + 9 * 3600 * 1000); // 9:00 de ese día
  // Orden fijo (el del Excel), a continuación de los que ya tenga ese día
  const ultimo = await db.lead.aggregate({ where: { vendedoraId, asignadoEl }, _max: { orden: true }, _count: true });
  const desde = Math.max(ultimo._max.orden ?? 0, ultimo._count);
  await db.lead.createMany({ data: l.contactos.map((c, i) => ({ ...c, vendedoraId, asignadoEl, orden: desde + i + 1 })) });
  refrescar();
  return { asignados: l.contactos.length, sinTelefono: l.sinTelefono };
}
const aviso = (r: { asignados: number; sinTelefono: number } | void) =>
  r ? `${r.asignados} ${r.asignados === 1 ? "contacto asignado" : "contactos asignados"}${r.sinTelefono ? ` · ${r.sinTelefono} sin teléfono (la vendedora los ve marcados «sin teléfono»)` : ""}` : undefined;

/**
 * Pegar contactos: filas copiadas del Excel, un contacto por línea con comas, o cada dato en su renglón con una línea
 * en blanco entre contactos. Columnas: Cliente, Marca, Expediente, Teléfono, Correo, Estatus.
 */
export async function asignarContactos(vendedoraId: string, dia: string, texto: string): Promise<Resultado<{ asignados: number; sinTelefono: number }>> {
  return intentar(async () => {
    await requerirAdmin();
    return guardarContactos(vendedoraId, dia, leerTextoContactos(texto));
  }, aviso);
}

/** Subir el Excel (.xlsx) de contactos del día para una vendedora. */
export async function subirExcelContactos(form: FormData): Promise<Resultado<{ asignados: number; sinTelefono: number }>> {
  return intentar(async () => {
    await requerirAdmin();
    const archivo = form.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) throw new Error("Elige el archivo de Excel");
    if (!/\.xlsx$/i.test(archivo.name)) throw new Error("El archivo debe ser de Excel (.xlsx). Si es .xls o .csv, ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)».");
    if (archivo.size > 8 * 1024 * 1024) throw new Error("El archivo es muy grande (máx. 8 MB)");
    return guardarContactos(String(form.get("vendedoraId") ?? ""), String(form.get("dia") ?? ""), await leerExcelContactos(await archivo.arrayBuffer()));
  }, aviso);
}

/** Eliminar un contacto asignado (también sus llamadas registradas). */
export async function quitarContacto(id: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    const l = await db.lead.findUnique({ where: { id }, select: { id: true } });
    if (!l) throw new Error("Ese contacto ya no existe");
    await db.lead.delete({ where: { id } });
    refrescar();
  }, () => "Contacto eliminado");
}

export type DatosContacto = {
  nombre: string; telefono: string; marca: string; expediente: string; email: string; estatus: string; observaciones: string; nota: string;
  vendedoraId: string; dia: string;
};

/** Editar un contacto ya asignado: sus datos, a qué vendedora le toca y para qué día. */
export async function editarContacto(id: string, d: DatosContacto): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    const l = await db.lead.findUnique({ where: { id }, select: { asignadoEl: true } });
    if (!l) throw new Error("Ese contacto ya no existe");
    const t = (s: string) => s.replace(/\s+/g, " ").trim() || null;
    const nombre = t(d.nombre);
    if (!nombre) throw new Error("Escribe el nombre del cliente");
    if (!(await db.vendedora.findUnique({ where: { id: d.vendedoraId }, select: { id: true } }))) throw new Error("Elige la vendedora");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.dia)) throw new Error("Elige el día");
    await db.lead.update({
      where: { id },
      data: {
        nombre, telefono: t(d.telefono) ?? "", marca: t(d.marca), expediente: t(d.expediente), email: t(d.email), estatus: t(d.estatus),
        observaciones: d.observaciones.trim() || null, nota: t(d.nota), vendedoraId: d.vendedoraId,
        asignadoEl: new Date(rangoDia(d.dia).inicio.getTime() + 9 * 3600 * 1000),
      },
    });
    refrescar();
  }, () => "Contacto actualizado");
}

/** Corregir cualquier registro de llamada/WhatsApp de cualquier vendedora. */
export async function editarRegistroAdmin(id: string, form: FormData): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    await corregirRegistro(id, form);
    refrescar();
  }, () => "Registro corregido");
}

/** Borrar un registro equivocado (el contacto se conserva y se recalcula su estado). */
export async function eliminarRegistroAdmin(id: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    await borrarRegistro(id);
    refrescar();
  }, () => "Registro eliminado");
}

/** Cómo aparece la vendedora en la columna "Vendió" de Contrataciones (para su conteo de ventas y títulos). */
export async function cambiarNombreVentas(id: string, nombre: string): Promise<Resultado> {
  return intentar(async () => {
    await requerirAdmin();
    const n = nombre.replace(/\s+/g, " ").trim();
    if (n.length < 2) throw new Error("Escribe el nombre como aparece en Contrataciones (ej. Tanya)");
    await db.vendedora.update({ where: { id }, data: { nombreVentas: n } });
    refrescar();
  }, () => "Nombre en Contrataciones guardado");
}
