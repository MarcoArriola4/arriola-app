import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { listaPermisos, type Permiso } from "./permisos";

const COOKIE = "arriola_sesion";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET);

export type Sesion = { id: string; nombre: string; email: string; rol: string };

export async function crearSesion(s: Sesion) {
  const token = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE);
}

export async function leerToken(token?: string): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Sesion;
  } catch {
    return null;
  }
}

export async function obtenerSesion() {
  return leerToken((await cookies()).get(COOKIE)?.value);
}

// Datos actuales del usuario (nombre, rol y permisos se leen de la base: un cambio del admin aplica al momento)
const usuarioActual = cache(async (id: string) =>
  db.usuario.findUnique({ where: { id }, select: { id: true, nombre: true, email: true, rol: true, permisos: true, activo: true } })
);

export type SesionCompleta = Sesion & { permisos: Set<string> };

/** Para server actions y páginas: exige sesión iniciada de un usuario activo. */
export async function requerirSesion(): Promise<SesionCompleta> {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  const u = await usuarioActual(s.id);
  if (!u || !u.activo) redirect("/login?error=inactivo");
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, permisos: listaPermisos(u) };
}

/** Exige un permiso (el administrador siempre lo tiene). */
export async function requerirPermiso(p: Permiso) {
  const s = await requerirSesion();
  if (!s.permisos.has(p)) throw new Error("No tienes permiso para hacer esto. Pídeselo al administrador.");
  return s;
}

/** Para páginas: redirige al inicio si falta el permiso. */
export async function requerirPermisoPagina(p: Permiso) {
  const s = await requerirSesion();
  if (!s.permisos.has(p)) redirect("/?error=sin-permiso");
  return s;
}

export const COOKIE_SESION = COOKIE;

/** Exige sesión de administrador. */
export async function requerirAdmin() {
  const s = await requerirSesion();
  if (s.rol !== "ADMIN") redirect("/?error=solo-admin");
  return s;
}
