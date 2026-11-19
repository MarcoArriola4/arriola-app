"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { altaServicio } from "@/app/actions";
import { intentar, type Resultado } from "@/lib/vendedoras";
import { leerVenta } from "@/lib/ventas-vendedoras";
import { recalcularLead } from "@/lib/vendedoras-registros";

const refrescar = () => {
  revalidatePath("/", "layout");
  revalidatePath("/ventas-vendedoras");
  revalidatePath("/vendedoras", "layout");
  revalidatePath("/contrataciones");
};
const fechaTxt = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Aprobar una venta: se guarda con los datos que dejó el administrador (puede corregirlos), se da de alta en
 * Contrataciones (cliente existente o nuevo) con el nombre de la vendedora en "Vendió", y el contacto queda vendido.
 */
export async function aprobarVenta(id: string, form: FormData): Promise<Resultado<{ url: string }>> {
  return intentar(async () => {
    const admin = await requerirAdmin();
    const d = leerVenta(form);
    const vendio = String(form.get("vendio") ?? "").replace(/\s+/g, " ").trim();
    if (!vendio) throw new Error("Escribe quién vendió (como aparece en Contrataciones)");
    const clienteId = String(form.get("clienteId") ?? "").trim() || null;
    if (clienteId && !(await db.cliente.findUnique({ where: { id: clienteId }, select: { id: true } }))) throw new Error("Ese cliente ya no existe; elige otro");

    // Evita aprobarla dos veces (dos pestañas o doble clic)
    const tomada = await db.ventaVendedora.updateMany({ where: { id, estado: "PENDIENTE" }, data: { estado: "APROBANDO" } });
    if (!tomada.count) throw new Error("Esta venta ya no está pendiente (alguien ya la revisó). Recarga la página.");
    const venta = await db.ventaVendedora.findUniqueOrThrow({ where: { id }, include: { vendedora: { select: { nombre: true } } } });
    try {
      const f = new FormData();
      if (clienteId) f.set("clienteId", clienteId);
      f.set("clienteNombre", d.clienteNombre);
      if (d.telefono) f.set("telefono", d.telefono);
      if (d.email) f.set("email", d.email);
      f.set("servicio", d.servicio);
      if (d.denominacion) f.set("denominacion", d.denominacion);
      if (d.numeroExpediente) f.set("numeroExpediente", d.numeroExpediente);
      f.set("costo", String(d.pagado + d.debe));
      f.set("pagado", String(d.pagado));
      f.set("fechaContratacion", fechaTxt(d.fechaCobro));
      if (d.banco) f.set("banco", d.banco);
      f.set("origenVenta", "Panel Vendedoras");
      f.set("vendedor", vendio);
      f.set("notas", [`Venta reportada por ${venta.vendedora.nombre} en el Panel Vendedoras · aprobada por ${admin.nombre}`, d.notas].filter(Boolean).join(" · "));
      const alta = await altaServicio(f);
      await db.servicio.update({ where: { id: alta.servicioId }, data: { editadoEnApp: true } });
      await db.ventaVendedora.update({
        where: { id },
        data: { ...d, estado: "APROBADA", revisadoEl: new Date(), revisadoPor: admin.nombre, motivoRechazo: null, servicioId: alta.servicioId, clienteId: alta.clienteId },
      });
      // El contacto de la vendedora queda como vendido (con su registro, en la fecha en que lo reportó)
      if (venta.leadId) {
        const lead = await db.lead.findUnique({ where: { id: venta.leadId }, select: { contestoPor: true, canal: true } });
        if (lead) {
          await db.llamada.create({
            data: {
              leadId: venta.leadId, vendedoraId: venta.vendedoraId, fecha: venta.creado, canal: lead.contestoPor ?? lead.canal ?? "LLAMADA",
              contesto: true, resultado: "VENDIDO", comentario: "Venta aprobada por el administrador", cotizacion: false,
            },
          });
          await recalcularLead(venta.leadId, null);
        }
      }
      refrescar();
      return { url: alta.url };
    } catch (e) {
      await db.ventaVendedora.updateMany({ where: { id, estado: "APROBANDO" }, data: { estado: "PENDIENTE" } });
      throw e;
    }
  }, () => "Venta aprobada: ya está en Contrataciones");
}

/** Rechazar una venta (no entra a Contrataciones). La vendedora ve el motivo y puede corregirla. */
export async function rechazarVenta(id: string, motivo: string): Promise<Resultado> {
  return intentar(async () => {
    const admin = await requerirAdmin();
    const m = motivo.replace(/\s+/g, " ").trim();
    if (!m) throw new Error("Escribe el motivo para que la vendedora sepa qué corregir");
    const r = await db.ventaVendedora.updateMany({ where: { id, estado: "PENDIENTE" }, data: { estado: "RECHAZADA", motivoRechazo: m, revisadoEl: new Date(), revisadoPor: admin.nombre } });
    if (!r.count) throw new Error("Esta venta ya no está pendiente. Recarga la página.");
    refrescar();
  }, () => "Venta rechazada");
}
