import { redirect } from "next/navigation";
import { panelDe, sesionAnterior } from "@/lib/vendedoras";

export const dynamic = "force-dynamic";

/** Cada vendedora tiene su propio panel en /vendedoras/<id>. Aquí solo se llega desde enlaces anteriores. */
export default async function Vendedoras() {
  const s = await sesionAnterior();
  redirect(s ? panelDe(s.vid) : "/vendedoras/login");
}
