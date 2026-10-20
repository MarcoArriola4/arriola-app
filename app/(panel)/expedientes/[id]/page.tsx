import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

// Toda marca se ve dentro del perfil de su cliente.
export default async function Expediente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await db.expediente.findUnique({ where: { id }, select: { clienteId: true } });
  if (!e) notFound();
  redirect(`/clientes/${e.clienteId}?marca=${id}`);
}
