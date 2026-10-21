"use server";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { crearSesion, cerrarSesion } from "@/lib/auth";

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

export async function iniciarSesion(form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const desde = new Date(Date.now() - VENTANA_MS);

  // Tras 5 intentos fallidos en 15 minutos, la cuenta se bloquea temporalmente
  if ((await db.intentoLogin.count({ where: { email, fecha: { gte: desde } } })) >= MAX_INTENTOS) redirect("/login?error=bloqueado");

  const u = await db.usuario.findUnique({ where: { email } });
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    await db.intentoLogin.create({ data: { email } });
    redirect("/login?error=1");
  }
  if (!u.activo) redirect("/login?error=inactivo");
  await db.intentoLogin.deleteMany({ where: { email } });
  await crearSesion({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol });
  redirect("/");
}

export async function salir() {
  await cerrarSesion();
  redirect("/login");
}
