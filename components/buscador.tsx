"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User } from "lucide-react";
import { buscarGlobal, type ResultadoBusqueda } from "@/app/actions";
import { ETAPAS } from "@/lib/catalogos";

export function Buscador() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultadoBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [cargando, setCargando] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setRes([]);
      return;
    }
    setCargando(true);
    const h = setTimeout(() => buscarGlobal(q).then((r) => { setRes(r); setActivo(0); setCargando(false); }), 220);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const atajo = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        caja.current?.querySelector("input")?.focus();
      }
    };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", atajo);
    return () => { document.removeEventListener("mousedown", cerrar); document.removeEventListener("keydown", atajo); };
  }, []);

  const ir = (r: ResultadoBusqueda) => {
    setAbierto(false);
    setQ("");
    router.push(`/clientes/${r.clienteId}${r.expedienteId ? `?marca=${r.expedienteId}` : ""}`);
  };

  return (
    <div ref={caja} className="relative w-full max-w-xl">
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActivo((a) => Math.min(a + 1, res.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActivo((a) => Math.max(a - 1, 0)); }
          if (e.key === "Enter" && res[activo]) ir(res[activo]);
          if (e.key === "Escape") setAbierto(false);
        }}
        placeholder="Buscar cliente, marca, expediente, registro o teléfono…"
        className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-marca focus:ring-4 focus:ring-marca/20"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-black/10 px-1.5 text-[11px] text-neutral-400 sm:block">/</kbd>

      {abierto && q.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-black/10 bg-white p-1.5 shadow-xl">
          {cargando && res.length === 0 && <p className="px-3 py-4 text-sm text-neutral-400">Buscando…</p>}
          {!cargando && res.length === 0 && <p className="px-3 py-4 text-sm text-neutral-400">Sin resultados para “{q}”.</p>}
          {res.map((r, i) => (
            <button
              key={`${r.clienteId}-${r.expedienteId}`}
              onMouseEnter={() => setActivo(i)}
              onClick={() => ir(r)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left ${i === activo ? "bg-marca-claro" : ""}`}
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-carbon text-xs font-semibold text-marca">
                {r.cliente.trim().charAt(0) || <User size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.cliente}</span>
                {r.denominacion ? (
                  <span className="block truncate text-xs text-neutral-600">
                    Marca <b className="font-medium">{r.denominacion}</b>
                    {r.numeroExpediente && ` · Exp. ${r.numeroExpediente}`}
                    {r.numeroRegistro && ` · Reg. ${r.numeroRegistro}`}
                  </span>
                ) : (
                  <span className="block truncate text-xs text-neutral-500">{r.telefono ?? "Cliente"}</span>
                )}
                <span className="block text-[11px] text-neutral-400">
                  {r.marcas === 1 ? "Solo tiene esta marca" : `Tiene ${r.marcas} marcas`}
                  {r.etapa && ` · ${ETAPAS[r.etapa]}`}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
