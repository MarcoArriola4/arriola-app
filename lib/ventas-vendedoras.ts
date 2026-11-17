// Ventas que reportan las vendedoras: validación y su conteo oficial (lo que ya está en Contrataciones).
import { db } from "./db";
import { claveVendedor, personasVenta } from "./catalogos";
import { SERVICIOS_VENTA } from "./vendedoras";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").replace(/\s+/g, " ").trim() || null;
const dinero = (f: FormData, k: string) => {
  const v = txt(f, k);
  if (!v) return 0;
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Escribe las cantidades solo con números (ej. 3500)");
  return Math.round(n * 100) / 100;
};

/** Lee y valida el formulario de una venta. */
export function leerVenta(form: FormData) {
  const clienteNombre = txt(form, "clienteNombre");
  if (!clienteNombre || clienteNombre.length < 3) throw new Error("Escribe el nombre completo del cliente");
  const servicio = txt(form, "servicio") ?? "MARCA";
  if (!(servicio in SERVICIOS_VENTA)) throw new Error("Elige qué se le vendió");
  const pagado = dinero(form, "pagado");
  const debe = dinero(form, "debe");
  if (pagado + debe <= 0) throw new Error("Escribe cuánto pagó y/o cuánto debe");
  const f = txt(form, "fechaCobro");
  if (!f || !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error("Escribe la fecha en que se hizo el cobro");
  const fechaCobro = new Date(`${f}T00:00:00Z`);
  if (fechaCobro.getTime() > Date.now() + 2 * 864e5) throw new Error("La fecha del cobro no puede ser futura");
  const numeroExpediente = txt(form, "numeroExpediente")?.replace(/\s/g, "") || null;
  if (numeroExpediente && !/^\d{4,9}$/.test(numeroExpediente)) throw new Error("El expediente lleva solo números (ej. 3456789)");
  return {
    clienteNombre, telefono: txt(form, "telefono"), email: txt(form, "email"), servicio,
    denominacion: txt(form, "denominacion"), numeroExpediente, pagado, debe, fechaCobro, banco: txt(form, "banco"), notas: txt(form, "notas"),
  };
}

/**
 * Conteo oficial de una vendedora en un periodo: lo que está en Contrataciones con su nombre en "Vendió".
 * Los títulos cuentan 1 venta por cada N (regla general o la suya).
 */
export async function conteoOficial(nombreVentas: string | null, desde: Date, hasta: Date) {
  const vacio = { ventas: 0, titulos: 0, porTitulos: 0, total: 0, regla: 6, lista: [] as { id: string; fecha: Date | null; cliente: string; marca: string; tipo: string; costo: number; pagado: number }[] };
  if (!nombreVentas) return vacio;
  const clave = claveVendedor(nombreVentas);
  const [servicios, cfg] = await Promise.all([
    db.servicio.findMany({
      where: { fechaContratacion: { gte: desde, lt: hasta }, OR: [{ vendedor: { contains: nombreVentas, mode: "insensitive" } }, { origenVenta: { contains: nombreVentas, mode: "insensitive" } }] },
      select: { id: true, tipo: true, vendedor: true, origenVenta: true, fechaContratacion: true, costo: true, pagado: true, expediente: { select: { denominacion: true, cliente: { select: { nombre: true } } } } },
      orderBy: { fechaContratacion: "desc" },
    }),
    db.configuracion.findUnique({ where: { id: "main" }, select: { titulosPorVenta: true, titulosPorVentaVendedor: true } }),
  ]);
  let porVendedor: Record<string, number> = {};
  try { porVendedor = JSON.parse(cfg?.titulosPorVentaVendedor ?? "{}"); } catch {}
  const regla = porVendedor[clave] ?? cfg?.titulosPorVenta ?? 6;
  // Mismo criterio que la hoja de Contrataciones: la columna "Vendió" (o el origen si no hay vendedor)
  const suyos = servicios.filter((s) => { const v = s.vendedor ?? s.origenVenta; return v ? personasVenta(v).includes(clave) : false; });
  const titulos = suyos.filter((s) => s.tipo === "TITULO").length;
  const ventas = suyos.length - titulos;
  const porTitulos = Math.floor(titulos / regla);
  return {
    ventas, titulos, porTitulos, total: ventas + porTitulos, regla,
    lista: suyos.map((s) => ({ id: s.id, fecha: s.fechaContratacion, cliente: s.expediente.cliente.nombre, marca: s.expediente.denominacion, tipo: s.tipo, costo: s.costo ?? 0, pagado: s.pagado })),
  };
}
