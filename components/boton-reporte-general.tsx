"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileBarChart, RefreshCw } from "lucide-react";
import { solicitarActualizacionTotal } from "@/app/actions";

/**
 * Admin: actualización TOTAL en MARCanet (todas las marcas, sin omitir ninguna; en segundo plano) y reporte general.
 * Es distinto del botón "Actualizar marcas activas" (solo activas y próximas a declaración de uso o renovación).
 */
export function BotonReporteGeneral({ enCurso }: { enCurso: boolean }) {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const actualizar = async () => {
    if (!enCurso && !confirm("¿Actualizar TODAS las marcas en MARCanet (incluidas registradas, negadas y abandonadas) y generar el reporte?\n\nCorre sola en segundo plano y tarda bastante más que la de marcas activas (alrededor de un día). El reporte se va completando conforme avanza.")) return;
    setPidiendo(true);
    try {
      if (!enCurso) await solicitarActualizacionTotal();
    } catch {}
    router.push("/reportes/general");
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={actualizar} disabled={pidiendo} className="btn-primario">
        <RefreshCw size={15} className={pidiendo ? "animate-spin" : ""} /> {enCurso ? "Actualización total en curso · ver reporte" : "Actualizar TODAS las marcas y generar reporte"}
      </button>
      <Link href="/reportes/general" className="btn"><FileBarChart size={15} /> Ver reporte con los datos de hoy</Link>
    </div>
  );
}
