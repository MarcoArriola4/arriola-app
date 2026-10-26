// Arranca (o continúa) el trabajo en segundo plano de la app llamando a /api/tareas.
import { headers } from "next/headers";

/** URL base de la app: la de producción en Vercel o la de la petición actual. */
export async function origenApp() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "http"}://${host}`;
  } catch {}
  return "http://localhost:3000";
}

/** Pide a /api/tareas que trabaje. Responde de inmediato (el trabajo sigue en segundo plano). */
export async function despertarTrabajador(origen?: string) {
  const base = origen ?? (await origenApp());
  try {
    await fetch(`${base}/api/tareas`, { method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  } catch {
    // si no responde, el siguiente sondeo de la app o el cron lo vuelve a intentar
  }
}
