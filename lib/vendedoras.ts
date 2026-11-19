// Panel Vendedoras: sesión aparte de ArriolApp (nombre + contraseña), catálogo de resultados y días en hora de México.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { db } from "./db";

/** Sesión anterior (una sola por navegador). Se sigue aceptando para no sacar a nadie, pero ya no se crea. */
export const COOKIE_VENDEDORA = "arriola_vendedora";
/**
 * Cada vendedora tiene su propio panel (/vendedoras/<id>) y su propia sesión, guardada solo para esa dirección:
 * si dos vendedoras usan la misma computadora o navegador, cada una ve únicamente lo suyo y no se mezclan.
 */
const PREFIJO = "arriola_v_";
const cookieDe = (id: string) => `${PREFIJO}${id}`;
export const panelDe = (id: string) => `/vendedoras/${id}`;
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export type SesionVendedora = { vid: string; nombre: string; tipo: "vendedora" };

export async function crearSesionVendedora(id: string, nombre: string) {
  const token = await new SignJWT({ vid: id, nombre, tipo: "vendedora" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret());
  const c = await cookies();
  c.set(cookieDe(id), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: panelDe(id), maxAge: 60 * 60 * 24 * 30 });
  c.set(COOKIE_VENDEDORA, "", { path: "/vendedoras", maxAge: 0 });
}

export async function cerrarSesionVendedora(id: string) {
  const c = await cookies();
  c.set(cookieDe(id), "", { path: panelDe(id), maxAge: 0 });
  c.set(COOKIE_VENDEDORA, "", { path: "/vendedoras", maxAge: 0 });
}

async function leer(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.tipo === "vendedora" ? (payload as unknown as SesionVendedora) : null;
  } catch {
    return null;
  }
}

/** Sesión anterior (de antes de separar los paneles): para mandarla a su propio panel. */
export async function sesionAnterior() {
  return leer((await cookies()).get(COOKIE_VENDEDORA)?.value);
}

/**
 * Exige sesión de una vendedora activa (si el gerente le quitó el acceso, sale al momento).
 * `vid`: el panel que se está abriendo; solo entra la vendedora dueña de ese panel.
 * Sin `vid` (acciones): el navegador solo manda la sesión del panel desde el que se hizo la acción.
 */
export async function requerirVendedora(vid?: string) {
  const c = await cookies();
  let s: SesionVendedora | null = null;
  if (vid) s = await leer(c.get(cookieDe(vid))?.value);
  else {
    const propias = c.getAll().filter((x) => x.name.startsWith(PREFIJO));
    if (propias.length === 1) s = await leer(propias[0].value);
  }
  if (!s) {
    const vieja = await sesionAnterior();
    if (vieja && (!vid || vieja.vid === vid)) s = vieja;
  }
  if (!s || (vid && s.vid !== vid)) redirect("/vendedoras/login");
  const v = await db.vendedora.findUnique({ where: { id: s.vid }, select: { id: true, nombre: true, activa: true } });
  if (!v || !v.activa) redirect("/vendedoras/login?error=inactiva");
  return v;
}

/** Resultado de una llamada / estado del contacto. */
export const RESULTADOS: Record<string, { txt: string; cls: string; contesto: boolean }> = {
  NO_CONTESTO: { txt: "No contestó", cls: "bg-neutral-100 text-neutral-600", contesto: false },
  CONTESTO: { txt: "Contestó · interesado", cls: "bg-sky-50 text-sky-800", contesto: true },
  COTIZACION: { txt: "Cotización enviada", cls: "bg-violet-50 text-violet-800", contesto: true },
  VOLVER: { txt: "Volver a contactar", cls: "bg-amber-50 text-amber-800", contesto: true },
  VENDIDO: { txt: "Vendido", cls: "bg-marca-claro text-marca-oscuro", contesto: true },
  NO_INTERESA: { txt: "No le interesa", cls: "bg-red-50 text-red-700", contesto: true },
  SIN_CONTACTO: { txt: "Sin WhatsApp · no se pudo contactar", cls: "bg-neutral-200 text-neutral-600", contesto: false },
};
/** Contactos que ya no se siguen: vendido, no le interesa o no se pudo contactar (sin WhatsApp). */
export const CERRADOS = ["VENDIDO", "NO_INTERESA", "SIN_CONTACTO"];
/** Por dónde se hizo el contacto: si no contesta la llamada, se le escribe por WhatsApp. */
export const CANALES: Record<string, { txt: string; cls: string }> = {
  LLAMADA: { txt: "Llamada", cls: "bg-sky-50 text-sky-800" },
  WHATSAPP: { txt: "WhatsApp", cls: "bg-emerald-50 text-emerald-800" },
};
/** Texto del resultado según el canal ("No respondió" en WhatsApp). */
export const txtResultado = (resultado: string, canal?: string | null) =>
  resultado === "NO_CONTESTO" ? (canal === "WHATSAPP" ? "WhatsApp enviado · sin respuesta" : "No contestó") : (RESULTADOS[resultado]?.txt ?? "Por llamar");

/** Al enviar cotización: ¿el cliente está interesado o es solo para darle seguimiento? */
export const INTERES: Record<string, string> = { INTERESADO: "Interesado", SEGUIMIENTO: "Solo para dar seguimiento" };

type RegMetrica = { leadId: string; canal: string; contesto: boolean; cotizacion: boolean; resultado: string; interes?: string | null };
/** ¿Este registro muestra que el cliente está interesado? (contestó interesado, compró, o cotización «interesado») */
export const esInteresado = (r: RegMetrica) => (r.cotizacion && r.interes ? r.interes === "INTERESADO" : r.resultado === "CONTESTO" || r.resultado === "VENDIDO");
/**
 * Las métricas que importan (vendedora y administrador): llamadas hechas, contestadas, cotizaciones enviadas,
 * interesados y no interesados. Cotizaciones, interesados y no interesados cuentan clientes (no se repiten).
 */
export function metricas(regs: RegMetrica[]) {
  const clientes = (f: (r: RegMetrica) => boolean) => new Set(regs.filter(f).map((r) => r.leadId)).size;
  return {
    llamadas: regs.filter((r) => r.canal !== "WHATSAPP").length,
    contestadas: regs.filter((r) => r.contesto).length,
    cotizaciones: clientes((r) => r.cotizacion),
    interesados: clientes(esInteresado),
    noInteresados: clientes((r) => r.resultado === "NO_INTERESA"),
    whats: regs.filter((r) => r.canal === "WHATSAPP").length,
  };
}

/** Servicios que puede reportar una vendedora (los mismos de Contrataciones). */
export const SERVICIOS_VENTA: Record<string, string> = {
  MARCA: "Registro de marca", CONTESTACION: "Contestación de oficio", DDU: "Declaración de uso", RENOVACION: "Renovación", TITULO: "Título de concesión", OTRO: "Otro",
};
export const ESTADO_PENDIENTE = { txt: "Por llamar", cls: "bg-white text-carbon ring-1 ring-black/10" };
export const estadoLead = (e: string) => RESULTADOS[e] ?? ESTADO_PENDIENTE;

export const CONTACTOS_POR_DIA = 35;

// Ciudad de México: UTC-6 todo el año (sin horario de verano desde 2022)
const MX = -6 * 3600 * 1000;
/** Día en México (AAAA-MM-DD) de una fecha. */
export const diaMx = (d = new Date()) => new Date(d.getTime() + MX).toISOString().slice(0, 10);
/** Rango [inicio, fin) en UTC de un día de México. */
export function rangoDia(dia: string) {
  const inicio = new Date(`${dia}T00:00:00-06:00`);
  return { inicio, fin: new Date(inicio.getTime() + 864e5) };
}
/** "2026-11-17T10:30" (hora de México, de un <input type="datetime-local">) → Date */
export function fechaHoraLocalMx(v: string | null | undefined) {
  const m = v?.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2].padStart(2, "0")}:${m[3]}:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Hora de México legible: "lun 17 nov, 10:30" */
export const fmtMx = (d: Date | string) =>
  new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Resultado de una acción: en producción Next oculta el mensaje de los errores lanzados, así que las acciones
 * devuelven el error como dato para mostrarlo tal cual ("Falta el teléfono", etc.).
 */
export type Resultado<T = unknown> = { ok: true; datos?: T; mensaje?: string } | { ok: false; error: string };

export async function intentar<T>(fn: () => Promise<T | void>, mensaje?: (d: T | void) => string | undefined): Promise<Resultado<T>> {
  try {
    const datos = await fn();
    return { ok: true, datos: datos ?? undefined, mensaje: mensaje?.(datos) };
  } catch (e) {
    unstable_rethrow(e); // redirecciones (p. ej. sesión vencida) siguen su curso
    console.error(e);
    return { ok: false, error: e instanceof Error && e.message && !/prisma|invocation|database/i.test(e.message) ? e.message : "No se pudo guardar. Inténtalo de nuevo." };
  }
}
