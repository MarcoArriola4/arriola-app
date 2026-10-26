"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { solicitarRevisionMarcas } from "@/app/actions";

/** Elegir titular, pedir que se actualicen con MARCanet e imprimir / guardar como PDF. */
export function AccionesReporte({ clienteId, titular, titulares, ids }: { clienteId: string; titular: string; titulares: { clave: string; nombre: string }[]; ids: string[] }) {
  const router = useRouter();
  const [pedido, setPedido] = useState(false);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {titulares.length > 1 && (
        <select value={titular} onChange={(e) => router.push(`/clientes/${clienteId}/reporte${e.target.value ? `?titular=${encodeURIComponent(e.target.value)}` : ""}`)} className="input w-auto">
          <option value="">Todos los titulares</option>
          {titulares.map((t) => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}
        </select>
      )}
      <button
        disabled={pendiente || pedido || !ids.length}
        onClick={() => iniciar(async () => { await solicitarRevisionMarcas(ids); setPedido(true); })}
        className="btn"
        title="Consulta de nuevo estas marcas en MARCanet antes de enviar el reporte"
      >
        <RefreshCw size={14} /> {pedido ? "Pedido · se actualizan en ~15–30 min" : `Actualizar estas ${ids.length} marcas con MARCanet`}
      </button>
      <button onClick={() => window.print()} className="btn-primario"><Printer size={14} /> Imprimir / guardar PDF</button>
    </div>
  );
}
