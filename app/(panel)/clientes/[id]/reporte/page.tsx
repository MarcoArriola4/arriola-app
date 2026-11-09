import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { TIPOS_EXPEDIENTE, fmtFecha } from "@/lib/catalogos";
import { datosReporteCliente } from "@/lib/reporte-cliente";
import { AccionesReporte } from "./acciones";

export const metadata = { title: "Reporte de marcas" };

export default async function ReporteCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ titular?: string }> }) {
  const [{ id }, { titular }] = await Promise.all([params, searchParams, requerirSesion()]);
  const d = await datosReporteCliente(db, id, titular);
  if (!d) notFound();
  const { cliente: c, hoy, grupos, resumen, consultaMasVieja, consultaMasNueva } = d;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/clientes/${c.id}`} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> {c.nombre}</Link>
        <AccionesReporte clienteId={c.id} titular={titular ?? ""} titulares={d.titulares} ids={d.ids} />
      </div>

      <article className="mx-auto max-w-5xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-carbon px-8 py-6 text-white print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-44" />
          <div className="text-right">
            <p className="text-lg font-semibold">Reporte de estatus de marcas</p>
            <p className="text-sm text-white/70">{hoy.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <div className="px-8 py-6">
          <p className="text-xs uppercase tracking-wide text-neutral-500">Cliente</p>
          <h1 className="font-titulo text-[1.9rem] font-semibold leading-tight tracking-tight">{c.nombre}</h1>
          {d.titularNombre && <p className="text-sm text-neutral-600">Titular: {d.titularNombre}</p>}
          <p className="mt-1 text-xs text-neutral-500">{consultaMasNueva ? `Última actualización en MARCanet: ${fmtFecha(consultaMasNueva)}` : "Aún sin consultar en MARCanet"}</p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {resumen.map((r) => (
              <div key={r.t} className="rounded-xl border border-black/[0.07] px-4 py-3">
                <p className="text-xs text-neutral-500">{r.t}</p>
                <p className="text-2xl font-semibold">{r.n}</p>
              </div>
            ))}
          </div>

          {grupos.map((g) => (
            <section key={g.nombre} className="mt-8 break-inside-avoid-page">
              <h2 className="mb-2 border-b-2 border-carbon pb-1 text-sm font-semibold uppercase tracking-wide">{g.nombre} <span className="font-normal text-neutral-400">· {g.marcas.length} {g.marcas.length === 1 ? "marca" : "marcas"}</span></h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Marca</th>
                    <th className="py-2 pr-3">Expediente / registro</th>
                    <th className="py-2 pr-3">Fechas</th>
                    <th className="py-2 pr-3">Estatus actual</th>
                    <th className="py-2">Último movimiento y próximos pasos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 align-top">
                  {g.marcas.map((e) => {
                    const est = e.estatus;
                    const ultimo = e.ultimo;
                    return (
                      <tr key={e.id} className="break-inside-avoid">
                        <td className="py-2.5 pr-3"><p className="font-semibold">{e.denominacion}</p><p className="text-xs text-neutral-500">{TIPOS_EXPEDIENTE[e.tipo]}</p><p className="text-[11px] text-neutral-400">{e.marcanetSync ? `MARCanet: ${fmtFecha(e.marcanetSync)}` : "Sin consultar en MARCanet"}</p></td>
                        <td className="py-2.5 pr-3 text-xs"><p>Exp. {e.numeroExpediente ?? "—"}</p>{e.numeroRegistro && <p>Reg. {e.numeroRegistro}</p>}</td>
                        <td className="py-2.5 pr-3 text-xs text-neutral-600">
                          {e.fechaPresentacion && <p>Presentada: {fmtFecha(e.fechaPresentacion)}</p>}
                          {e.fechaConcesion && <p>Concesión: {fmtFecha(e.fechaConcesion)}</p>}
                        </td>
                        <td className="py-2.5 pr-3"><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium print:[print-color-adjust:exact] ${est.cls}`}>{est.txt}</span></td>
                        <td className="py-2.5 text-xs">
                          {ultimo && <p className="text-neutral-600">{ultimo}</p>}
                          {e.proximos.map((p) => <p key={p} className="font-medium text-neutral-900">→ {p}</p>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}

          <footer className="mt-10 border-t border-black/10 pt-4 text-[11px] text-neutral-500">
            Información con base en los expedientes públicos del IMPI (MARCanet){consultaMasVieja && `, consultados desde el ${fmtFecha(consultaMasVieja)}`}, y en el seguimiento de Arriola Abogados.
            Las fechas límite consideran los días inhábiles publicados por el IMPI.
          </footer>
        </div>
      </article>
    </>
  );
}
