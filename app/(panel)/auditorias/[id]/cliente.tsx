"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Printer } from "lucide-react";

/** Mientras la auditoría corre, la página se actualiza sola cada 20 s. */
export function Refrescar() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function Imprimir() {
  return <button onClick={() => window.print()} className="btn-primario"><Printer size={14} /> Imprimir / guardar PDF</button>;
}
