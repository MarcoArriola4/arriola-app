import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { datosReporteCliente } from "@/lib/reporte-cliente";
import { reporteClienteEnWord } from "@/lib/word-reportes";

export const maxDuration = 60;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const archivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w .-]/g, "").trim().slice(0, 80) || "cliente";

/** Reporte rápido del cliente en Word (?titular=clave para un solo titular). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requerirSesion();
  const { id } = await params;
  const titular = new URL(req.url).searchParams.get("titular") ?? undefined;
  const d = await datosReporteCliente(db, id, titular);
  if (!d) return new Response("No existe", { status: 404 });
  const buffer = await reporteClienteEnWord(d);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": DOCX, "Content-Disposition": `attachment; filename="Reporte de marcas - ${archivo(d.titularNombre ?? d.cliente.nombre)}.docx"`, "Cache-Control": "no-store" },
  });
}
