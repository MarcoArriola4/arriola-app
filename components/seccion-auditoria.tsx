import Link from "next/link";
import { FileDown, SearchCheck } from "lucide-react";
import type { Auditoria } from "@prisma/client";
import { fmtFecha } from "@/lib/catalogos";
import { categoriaDe, progresoAuditoria, type MarcaAuditada, type ResultadoAuditoria } from "@/lib/marcanet/auditoria";
import { RelojAuditoria } from "./reloj-auditoria";

const TONO: Record<MarcaAuditada["tono"], string> = {
  verde: "bg-green-50 text-green-800",
  azul: "bg-sky-50 text-sky-800",
  ambar: "bg-amber-50 text-amber-800",
  rojo: "bg-red-50 text-red-700",
  gris: "bg-neutral-100 text-neutral-600",
};

/** Marcas que el IMPI tiene a su nombre y no tenemos en la app, las vigentes primero (posibles servicios por vender). */
export function oportunidades(r: ResultadoAuditoria) {
  // En proceso primero (se pueden atender ya), luego las registradas (DDU, renovación) y al final las perdidas
  const orden: Record<string, number> = { PROCESO: 0, GANADA: 1, PERDIDA: 2 };
  return r.marcas.filter((m) => !m.enApp).sort((a, b) => orden[categoriaDe(a)] - orden[categoriaDe(b)] || a.denominacion.localeCompare(b.denominacion, "es"));
}

/** Última auditoría del cliente en su ficha (solo administradores). */
export function SeccionAuditoria({ clienteId, a }: { clienteId: string; a: Auditoria | null }) {
  if (!a) {
    return (
      <section className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Auditoría de marcas en el IMPI</h2>
          <p className="text-xs text-neutral-500">Busca todas las marcas de este cliente (como titular y como apoderado) y muestra las que no nos ha contratado.</p>
        </div>
        <Link href={`/clientes/${clienteId}/auditoria`} className="btn-primario"><SearchCheck size={14} /> Hacer auditoría</Link>
      </section>
    );
  }
  const r: ResultadoAuditoria = a.resultado ? JSON.parse(a.resultado) : { busquedas: [], marcas: [] };
  const p = progresoAuditoria(a);
  const lista = a.estado === "LISTA";
  const opo = oportunidades(r);
  const cuenta = (c: string) => r.marcas.filter((m) => categoriaDe(m) === c).length;

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">Última auditoría de marcas en el IMPI</h2>
          <p className="text-xs text-neutral-500">
            {a.creado.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}{a.autor && ` · ${a.autor}`} · {(JSON.parse(a.nombres) as string[]).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/auditorias/${a.id}`} className="btn">Ver reporte</Link>
          {lista && <a href={`/api/auditorias/${a.id}/word`} className="btn"><FileDown size={14} /> Word</a>}
          <Link href={`/clientes/${clienteId}/auditoria`} className="btn"><SearchCheck size={14} /> Nueva auditoría</Link>
        </div>
      </div>

      <div className="px-5 py-4">
        {!lista ? (
          <RelojAuditoria p={p} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { t: "Encontradas", n: r.marcas.length, cls: "" },
                { t: "Ganadas (registradas)", n: cuenta("GANADA"), cls: "text-green-700" },
                { t: "En proceso", n: cuenta("PROCESO"), cls: "text-sky-700" },
                { t: "Abandonadas, negadas o vencidas", n: cuenta("PERDIDA"), cls: "text-red-700" },
                { t: "No contratadas con nosotros", n: opo.length, cls: "text-violet-700" },
              ].map((x) => (
                <div key={x.t} className="rounded-lg bg-neutral-50 px-3 py-2">
                  <p className={`text-xl font-semibold ${x.cls}`}>{x.n}</p>
                  <p className="text-[11px] leading-tight text-neutral-500">{x.t}</p>
                </div>
              ))}
            </div>

            {opo.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Marcas que no nos ha contratado · oportunidad de venta</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead><tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500"><th className="py-1.5 pr-3">Marca</th><th className="py-1.5 pr-3">Expediente</th><th className="py-1.5 pr-3">Clase</th><th className="py-1.5 pr-3">Estatus</th><th className="py-1.5">Último movimiento</th></tr></thead>
                    <tbody className="divide-y divide-black/5 align-top">
                      {opo.slice(0, 12).map((m) => (
                        <tr key={m.expediente}>
                          <td className="py-2 pr-3 font-medium">{m.denominacion}<span className="block text-[11px] font-normal text-neutral-400">{m.encontradaComo.map((x) => `${x.como === "TITULAR" ? "Titular" : "Apoderado"}: ${x.nombre}`).join(" · ")}</span></td>
                          <td className="py-2 pr-3 text-xs">{m.expediente}{m.registro && <span className="block text-neutral-400">Reg. {m.registro}</span>}</td>
                          <td className="py-2 pr-3 text-xs">{m.clase ?? "—"}</td>
                          <td className="py-2 pr-3"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${TONO[m.tono]}`}>{m.estatus || "—"}</span></td>
                          <td className="py-2 text-xs text-neutral-500">{[m.ddu, m.renovacion].filter((j) => j && (j.tono === "ambar" || j.tono === "rojo")).map((j) => <span key={j!.texto} className="block font-medium text-amber-700">{j!.texto}</span>)}{m.ultimo ? `${fmtFecha(m.ultimo.fecha)} · ${m.ultimo.texto}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {opo.length > 12 && <Link href={`/auditorias/${a.id}`} className="mt-2 inline-block text-xs text-neutral-500 hover:text-black">Ver las {opo.length} en el reporte →</Link>}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
