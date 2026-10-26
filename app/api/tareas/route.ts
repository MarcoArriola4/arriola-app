import { after } from "next/server";
import { db } from "@/lib/db";
import { despertarTrabajador } from "@/lib/despertar";
import { PRESUPUESTO_MS, soltarCandado, tomarCandado, trabajar } from "@/lib/trabajador";

// Cada corrida trabaja ~3–4 min en segundo plano y, si queda trabajo, se vuelve a llamar.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function correr(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("No autorizado", { status: 401 });
  if (!(await tomarCandado(db))) return Response.json({ ok: true, ocupado: true }, { status: 202 });
  const origen = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(req.url).origin;
  after(async () => {
    const inicio = Date.now();
    let queda = false;
    try {
      queda = await trabajar(db, inicio + PRESUPUESTO_MS);
      // Si MARCanet pidió esperar, se espera aquí (hasta ~4 min) antes de pasar la estafeta
      const cfg = await db.configuracion.findUnique({ where: { id: "main" }, select: { esperaCuotaHasta: true } });
      const falta = (cfg?.esperaCuotaHasta?.getTime() ?? 0) - Date.now();
      if (queda && falta > 0) await dormir(Math.min(falta, 250 * 1000 - (Date.now() - inicio)));
    } catch {
      queda = true; // un error inesperado no detiene la cadena: se reintenta en la siguiente corrida
      await dormir(30 * 1000);
    } finally {
      await soltarCandado(db);
    }
    if (queda) await despertarTrabajador(origen);
  });
  return Response.json({ ok: true }, { status: 202 });
}

export const POST = correr;
export const GET = correr;
