// Panel Vendedoras: sesión aparte de ArriolApp (nombre + contraseña), catálogo de resultados y días en hora de México.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export const COOKIE_VENDEDORA = "arriola_vendedora";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export type SesionVendedora = { vid: string; nombre: string; tipo: "vendedora" };

export async function crearSesionVendedora(id: string, nombre: string) {
  const token = await new SignJWT({ vid: id, nombre, tipo: "vendedora" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE_VENDEDORA, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/vendedoras", maxAge: 60 * 60 * 24 * 30 });
}

export async function cerrarSesionVendedora() {
  (await cookies()).set(COOKIE_VENDEDORA, "", { path: "/vendedoras", maxAge: 0 });
}

/** Exige sesión de una vendedora activa (si el gerente le quitó el acceso, sale al momento). */
export async function requerirVendedora() {
  const token = (await cookies()).get(COOKIE_VENDEDORA)?.value;
  let s: SesionVendedora | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      if (payload.tipo === "vendedora") s = payload as unknown as SesionVendedora;
    } catch {}
  }
  if (!s) redirect("/vendedoras/login");
  const v = await db.vendedora.findUnique({ where: { id: s.vid }, select: { id: true, nombre: true, activa: true } });
  if (!v || !v.activa) redirect("/vendedoras/login?error=inactiva");
  return v;
}

/** Resultado de una llamada / estado del contacto. */
export const RESULTADOS: Record<string, { txt: string; cls: string; contesto: boolean }> = {
  NO_CONTESTO: { txt: "No contestó", cls: "bg-neutral-100 text-neutral-600", contesto: false },
  CONTESTO: { txt: "Contestó · interesado", cls: "bg-sky-50 text-sky-800", contesto: true },
  COTIZACION: { txt: "Cotización enviada", cls: "bg-violet-50 text-violet-800", contesto: true },
  VOLVER: { txt: "Volver a llamar", cls: "bg-amber-50 text-amber-800", contesto: true },
  VENDIDO: { txt: "Vendido", cls: "bg-marca-claro text-marca-oscuro", contesto: true },
  NO_INTERESA: { txt: "No le interesa", cls: "bg-red-50 text-red-700", contesto: true },
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
