import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { vencimientos } from "@/lib/consultas";
import { fmtFecha } from "@/lib/catalogos";
import { Encabezado, Metrica, Plazo, Vacio } from "@/components/ui";

export const metadata = { title: "Vencimientos" };

const RANGOS: Record<string, { label: string; desde: number; hasta: number }> = {
  vencidos: { label: "Vencidos (90 días)", desde: -90, hasta: -1 },
  "30": { label: "Próximos 30 días", desde: 0, hasta: 30 },
  "90": { label: "Próximos 90 días", desde: 0, hasta: 90 },
  "180": { label: "Próximos 6 meses", desde: 0, hasta: 180 },
  "365": { label: "Próximo año", desde: 0, hasta: 365 },
};

export default async function Vencimientos({ searchParams }: { searchParams: Promise<{ tipo?: string; rango?: string }> }) {
  const { tipo = "", rango = "90" } = await searchParams;
  const r = RANGOS[rango] ?? RANGOS["90"];
  const todos = await vencimientos({ desdeDias: r.desde, hastaDias: r.hasta });
  const lista = todos.filter((v) => !tipo || v.tipo === tipo);
  const url = (c: Record<string, string>) => `/vencimientos?${new URLSearchParams({ tipo, rango, ...c })}`;
  const chip = (activo: boolean) => `shrink-0 rounded-full px-3 py-1 text-xs font-medium ${activo ? "bg-carbon text-white" : "bg-white text-neutral-600 ring-1 ring-black/10"}`;

  return (
    <>
      <Encabezado titulo="Vencimientos" subtitulo="Declaraciones de uso (3 años + 3 meses tras la concesión) y renovaciones (10 años). Cada una es una venta posible." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Metrica label="Total en el periodo" valor={todos.length} />
        <Metrica label="Declaraciones de uso" valor={todos.filter((v) => v.tipo === "DDU").length} />
        <Metrica label="Renovaciones" valor={todos.filter((v) => v.tipo === "RENOVACION").length} />
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {Object.entries(RANGOS).map(([k, v]) => <Link key={k} href={url({ rango: k })} className={chip(rango === k)}>{v.label}</Link>)}
      </div>
      <div className="mb-4 flex gap-1.5">
        <Link href={url({ tipo: "" })} className={chip(!tipo)}>Todos</Link>
        <Link href={url({ tipo: "DDU" })} className={chip(tipo === "DDU")}>Declaración de uso</Link>
        <Link href={url({ tipo: "RENOVACION" })} className={chip(tipo === "RENOVACION")}>Renovación</Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-black/5 bg-neutral-50/60"><tr><th className="th">Marca</th><th className="th">Cliente</th><th className="th">Trámite</th><th className="th">Fecha límite</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {lista.map((v) => {
              const tel = v.telefono?.split(/[/,]/)[0].replace(/\D/g, "") ?? "";
              const msg = `Hola, le saluda Arriola Abogados. Su marca ${v.denominacion}${v.numeroRegistro ? ` (registro ${v.numeroRegistro})` : ""} requiere ${v.tipo === "DDU" ? "presentar la declaración de uso" : "renovarse"} a más tardar el ${fmtFecha(v.fecha)}. ¿Desea que le apoyemos con el trámite?`;
              return (
                <tr key={v.expedienteId + v.tipo} className="hover:bg-neutral-50">
                  <td className="td"><Link href={`/expedientes/${v.expedienteId}`} className="font-medium hover:underline">{v.denominacion}</Link><span className="block text-xs text-neutral-400">Reg. {v.numeroRegistro ?? "—"}</span></td>
                  <td className="td text-neutral-600">{v.cliente}</td>
                  <td className="td whitespace-nowrap">
                    {v.tipo === "DDU" ? "Declaración de uso" : "Renovación"}
                    {v.contratada && <span className="ml-1.5 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">Pagada · por presentar</span>}
                  </td>
                  <td className="td whitespace-nowrap">{fmtFecha(v.fecha)} <span className="ml-1"><Plazo fecha={v.fecha} /></span></td>
                  <td className="td text-right">
                    {tel.length >= 10 && <a href={`https://wa.me/${tel.length === 10 ? "52" + tel : tel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="btn px-2 py-1 text-xs text-green-700"><MessageCircle size={13} /> Ofrecer</a>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <Vacio>Nada en este periodo.</Vacio>}
      </div>
    </>
  );
}
