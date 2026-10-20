import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { FormAlta } from "./form";
import { claveVendedor, nombrePropio } from "@/lib/catalogos";

export const metadata = { title: "Alta de cliente o servicio" };

export default async function Alta({ searchParams }: { searchParams: Promise<{ cliente?: string; servicio?: string }> }) {
  await requerirAdmin();
  const { cliente, servicio } = await searchParams;
  // Sugerencias para "Vendió": nombres ya usados (sin repetir mayúsculas/minúsculas)
  const usados = await db.servicio.groupBy({ by: ["vendedor"], where: { vendedor: { not: null } }, _count: true, orderBy: { _count: { vendedor: "desc" } } });
  const vendedores = [...new Map(usados.map((u) => [claveVendedor(u.vendedor!), nombrePropio(claveVendedor(u.vendedor!))])).values()];
  const c = cliente
    ? await db.cliente.findUnique({ where: { id: cliente }, select: { id: true, nombre: true, telefono: true, expedientes: { select: { id: true, denominacion: true, numeroExpediente: true, numeroRegistro: true }, orderBy: { denominacion: "asc" } } } })
    : null;
  return (
    <>
      <Link href={c ? `/clientes/${c.id}` : "/admin"} className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> {c ? c.nombre : "Admin"}</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Alta de cliente o servicio</h1>
      <p className="mb-6 mt-0.5 text-sm text-neutral-500">Tres pasos: quién es el cliente, qué servicio contrató y cuánto pagó.</p>
      <FormAlta cliente={c} servicioInicial={servicio} vendedores={vendedores} />
    </>
  );
}
