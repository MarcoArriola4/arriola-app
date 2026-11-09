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
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle size={24} aria-hidden /></span>
      <h1 className="font-titulo text-2xl font-semibold text-carbon">Algo no salió bien</h1>
      <p className="mt-2 text-sm text-neutral-600">No se guardó ningún cambio a medias. Vuelve a intentarlo; si se repite, avísanos con este código: <b>{error.digest ?? "sin código"}</b>.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={reset} className="btn-primario"><RotateCcw size={14} /> Reintentar</button>
        <Link href="/" className="btn">Ir al inicio</Link>
      </div>
    </div>
  );
}
