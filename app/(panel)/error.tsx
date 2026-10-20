"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Si algo falla en una pantalla, se muestra este aviso en lugar de la página de error de Vercel
export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
      <AlertTriangle className="mx-auto mb-3 text-amber-600" size={28} />
      <h1 className="text-lg font-semibold text-amber-900">Algo no salió bien</h1>
      <p className="mt-1 text-sm text-amber-800">No se guardó ningún cambio a medias. Vuelve a intentarlo; si se repite, avísanos con este código: <b>{error.digest ?? "sin código"}</b>.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={reset} className="btn-primario"><RotateCcw size={14} /> Reintentar</button>
        <Link href="/" className="btn">Ir al inicio</Link>
      </div>
    </div>
  );
}
