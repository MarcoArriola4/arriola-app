"use client";
import { useRouter } from "next/navigation";

/** Elegir qué revisión ver (la más reciente por omisión). */
export function ElegirRevision({ actual, opciones }: { actual: string; opciones: { clave: string; texto: string }[] }) {
  const router = useRouter();
  return (
    <select value={actual} onChange={(e) => router.push(`/reportes/revision?r=${encodeURIComponent(e.target.value)}`)} className="input w-auto">
      {opciones.map((o, i) => <option key={o.clave} value={o.clave}>{i === 0 ? "Última · " : ""}{o.texto}</option>)}
    </select>
  );
}
