import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { datosRevision, listarRevisiones } from "@/lib/reporte-revision";
import { revisionEnWord } from "@/lib/word-revision";

export const maxDuration = 60;

/** Descarga el reporte de una revisión en Word (?r=clave; sin clave, la última). */
export async function GET(req: Request) {
  await requerirSesion();
  const r = new URL(req.url).searchParams.get("r");
  const revisiones = await listarRevisiones(db);
  const rev = revisiones.find((x) => x.clave === r) ?? revisiones[0];
  if (!rev) return new Response("Aún no hay revisiones", { status: 404 });
  const buffer = await revisionEnWord(await datosRevision(db, rev));
  const nombre = `Reporte de revision ${rev.inicio.toLocaleDateString("en-CA")}.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${nombre}"`, "Cache-Control": "no-store" },
  });
}
