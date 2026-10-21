"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { recordatoriosQueTocan } from "@/app/actions";

type R = { id: string; texto: string; recordarEn: string };

/** Revisa cada minuto los recordatorios del usuario y, cuando toca uno, lo muestra en cualquier pantalla. */
export function AvisoRecordatorios() {
  const [lista, setLista] = useState<R[]>([]);
  const [cerrados, setCerrados] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    const revisar = async () => {
      try {
        const r = await recordatoriosQueTocan();
        if (!vivo) return;
        setLista(r);
        // Aviso del navegador una sola vez por recordatorio (si el usuario dio permiso)
        let vistos: string[] = [];
        try { vistos = JSON.parse(localStorage.getItem("recordatorios-avisados") ?? "[]"); } catch {}
        const nuevos = r.filter((x) => !vistos.includes(`${x.id}|${x.recordarEn}`));
        if (nuevos.length && typeof Notification !== "undefined" && Notification.permission === "granted") {
          nuevos.forEach((x) => new Notification("Recordatorio · Arriola Abogados", { body: x.texto }));
        }
        try { localStorage.setItem("recordatorios-avisados", JSON.stringify([...vistos, ...nuevos.map((x) => `${x.id}|${x.recordarEn}`)].slice(-200))); } catch {}
      } catch {}
    };
    revisar();
    const t = setInterval(revisar, 60000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const visibles = lista.filter((r) => !cerrados.includes(r.id));
  if (!visibles.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 w-[min(360px,calc(100vw-2rem))] space-y-2">
      {visibles.slice(0, 3).map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-xl">
          <Bell size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase text-amber-700">Recordatorio</p>
            <p className="line-clamp-3 text-sm text-amber-950">{r.texto}</p>
            <div className="mt-1.5 flex gap-3 text-xs">
              <Link href="/notas" className="font-medium text-amber-800 underline-offset-2 hover:underline">Ver mis notas</Link>
              {typeof Notification !== "undefined" && Notification.permission === "default" && (
                <button onClick={() => Notification.requestPermission()} className="text-amber-800 hover:underline">Avisarme también con notificación</button>
              )}
            </div>
          </div>
          <button onClick={() => setCerrados((c) => [...c, r.id])} className="text-amber-700 hover:text-black" aria-label="Cerrar"><X size={15} /></button>
        </div>
      ))}
    </div>
  );
}
