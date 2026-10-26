import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { auditoriaEnWord } from "@/lib/word-auditoria";
import type { ResultadoAuditoria } from "@/lib/marcanet/auditoria";

export const maxDuration = 60;

/** Descarga la auditoría en Word (.docx) para editarla. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requerirAdmin(); // la auditoría es solo para administradores
  const { id } = await params;
  const a = await db.auditoria.findUnique({ where: { id } });
  if (!a?.resultado) return new Response("La auditoría aún no tiene resultados", { status: 404 });
  const cliente = a.clienteId ? (await db.cliente.findUnique({ where: { id: a.clienteId }, select: { nombre: true } }))?.nombre ?? null : null;
  const buffer = await auditoriaEnWord({ cliente, nombres: JSON.parse(a.nombres), terminado: a.terminado, resultado: JSON.parse(a.resultado) as ResultadoAuditoria });
  const nombre = `Auditoria de marcas${cliente ? ` - ${cliente}` : ""}.docx`.replace(/[\\/:*?"<>|]/g, "");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
