import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { datosReporteGeneral } from "@/lib/reporte-general";
import { reporteGeneralEnWord } from "@/lib/word-reportes";

export const maxDuration = 60;

/** Reporte general de marcas (Admin) en Word. */
export async function GET() {
  const sesion = await requerirSesion();
  if (sesion.rol !== "ADMIN") return new Response("Solo administradores", { status: 403 });
  const [r, cfg] = await Promise.all([datosReporteGeneral(db), db.configuracion.findUnique({ where: { id: "main" }, select: { ultimaActualizacionTotal: true } })]);
  const buffer = await reporteGeneralEnWord(r, cfg?.ultimaActualizacionTotal ?? null);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="Reporte general de marcas ${new Date().toLocaleDateString("en-CA")}.docx"`, "Cache-Control": "no-store" },
  });
}
