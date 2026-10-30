"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileBarChart, RefreshCw } from "lucide-react";
import { solicitarBusqueda } from "@/app/actions";

/** Admin: actualiza todas las marcas en MARCanet (búsqueda completa, en segundo plano) y abre el reporte general. */
export function BotonReporteGeneral({ enCurso }: { enCurso: boolean }) {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const actualizar = async () => {
    if (!enCurso && !confirm("¿Actualizar todas las marcas en MARCanet y generar el reporte?\n\nCorre sola en segundo plano (puede tardar varias horas). El reporte se va completando conforme avanza.")) return;
    setPidiendo(true);
    try {
      if (!enCurso) await solicitarBusqueda();
    } catch {}
    router.push("/reportes/general");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={actualizar} disabled={pidiendo} className="btn-primario">
        <RefreshCw size={15} className={pidiendo ? "animate-spin" : ""} /> {enCurso ? "Actualización en curso · ver reporte" : "Actualizar todas y generar reporte"}
      </button>
      <Link href="/reportes/general" className="btn"><FileBarChart size={15} /> Ver reporte con los datos de hoy</Link>
    </div>
  );
}
