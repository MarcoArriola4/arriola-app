import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

/** Para server actions y páginas: exige sesión iniciada. */
export async function requerirSesion() {
  const s = await obtenerSesion();
  if (!s) redirect("/login");
  return s;
}

export const COOKIE_SESION = COOKIE;

/** Exige sesión de administrador. */
export async function requerirAdmin() {
  const s = await requerirSesion();
  if (s.rol !== "ADMIN") redirect("/?error=solo-admin");
  return s;
}
