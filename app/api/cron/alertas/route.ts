import { enviarResumen } from "@/lib/alertas";

// Se ejecuta cada mañana (ver vercel.json). Protegido con CRON_SECRET.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  return Response.json(await enviarResumen());
}
