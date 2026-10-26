import { enviarResumen } from "@/lib/alertas";
import { db } from "@/lib/db";
import { despertarTrabajador } from "@/lib/despertar";
import { programarAutomatico } from "@/lib/trabajador";

export const maxDuration = 60;

// Se ejecuta cada mañana (ver vercel.json). Protegido con CRON_SECRET.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  // Además programa lo automático (búsqueda completa cada 7 días y revisión diaria de oficios) y lo arranca
  await programarAutomatico(db);
  const resumen = await enviarResumen();
  await despertarTrabajador(new URL(req.url).origin);
  return Response.json(resumen);
}
