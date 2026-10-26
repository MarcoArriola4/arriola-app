"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { asegurarTrabajador } from "@/app/actions";

/** Mientras la auditoría corre, la página se actualiza sola cada 20 s. */
export function Refrescar() {
  const router = useRouter();
  useEffect(() => {
    // Si el trabajo en segundo plano se detuvo por algo, esto lo vuelve a arrancar
    void asegurarTrabajador().catch(() => {});
    const t = setInterval(() => { router.refresh(); void asegurarTrabajador().catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function Imprimir() {
  return <button onClick={() => window.print()} className="btn-primario"><Printer size={14} /> Imprimir / guardar PDF</button>;
}
