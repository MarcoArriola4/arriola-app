import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown, Hourglass } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { fmtFecha } from "@/lib/catalogos";
import type { MarcaAuditada, ResultadoAuditoria } from "@/lib/marcanet/auditoria";
import { Imprimir, Refrescar } from "./cliente";

export const metadata = { title: "Auditoría + Reporte" };

const TONO: Record<MarcaAuditada["tono"], string> = {
  verde: "bg-green-50 text-green-800",
  azul: "bg-sky-50 text-sky-800",
  ambar: "bg-amber-50 text-amber-800",
  rojo: "bg-red-50 text-red-700",
  gris: "bg-neutral-100 text-neutral-600",
};

export default async function Auditoria({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requerirSesion()]);
  const a = await db.auditoria.findUnique({ where: { id } });
  if (!a) notFound();
  const cliente = a.clienteId ? await db.cliente.findUnique({ where: { id: a.clienteId }, select: { id: true, nombre: true } }) : null;
  const nombres = JSON.parse(a.nombres) as string[];
  const r: ResultadoAuditoria = a.resultado ? JSON.parse(a.resultado) : { busquedas: [], marcas: [] };
  const lista = a.estado === "LISTA";

  // Ordenadas por titular (o apoderado) del IMPI y luego por marca
  const grupoDe = (m: MarcaAuditada) => m.encontradaComo.find((x) => x.como === "TITULAR")?.nombre ?? `Apoderado: ${m.encontradaComo[0]?.nombre ?? "—"}`;
  const grupos = new Map<string, MarcaAuditada[]>();
  for (const m of r.marcas) grupos.set(grupoDe(m), [...(grupos.get(grupoDe(m)) ?? []), m]);
  const ordenados = [...grupos.entries()].sort((x, y) => x[0].localeCompare(y[0], "es")).map(([g, ms]) => [g, ms.sort((p, q) => p.denominacion.localeCompare(q.denominacion, "es") || p.expediente.localeCompare(q.expediente))] as const);
  const cuenta = (t: MarcaAuditada["tono"][]) => r.marcas.filter((m) => t.includes(m.tono)).length;
  const hoy = a.terminado ?? new Date();

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        {cliente ? <Link href={`/clientes/${cliente.id}/auditoria`} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> {cliente.nombre}</Link> : <span />}
        {lista && (
          <div className="flex flex-wrap gap-2">
            <a href={`/api/auditorias/${a.id}/word`} className="btn"><FileDown size={14} /> Descargar en Word</a>
            <Imprimir />
          </div>
        )}
      </div>

      {!lista && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          <Hourglass size={20} className="animate-reloj shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">{a.estado === "ERROR" ? "La auditoría no pudo terminar" : a.estado === "PENDIENTE" ? "Auditoría en espera · empieza en unos minutos" : "Auditoría en curso"}</p>
            <p className="text-xs">{a.avance ?? "Corre sola en segundo plano; puedes cerrar la app y volver después."} {r.marcas.length > 0 && `· ${r.marcas.length} marcas encontradas hasta ahora`}</p>
          </div>
          {a.estado !== "ERROR" && <Refrescar />}
        </div>
      )}

      <article className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-carbon px-8 py-6 text-white print:[print-color-adjust:exact]">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-44" />
          <div className="text-right">
            <p className="text-lg font-semibold">Auditoría de marcas</p>
            <p className="text-sm text-white/70">{hoy.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <div className="px-8 py-6">
          {cliente && <><p className="text-xs uppercase tracking-wide text-neutral-500">Cliente</p><h1 className="text-2xl font-semibold tracking-tight">{cliente.nombre}</h1></>}
          <p className="mt-1 text-sm text-neutral-600">Búsqueda en el IMPI (MARCanet) por titular y por apoderado de: <b className="font-medium">{nombres.join(" · ")}</b></p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { t: "Marcas encontradas", n: r.marcas.length },
              { t: "Registradas", n: cuenta(["verde"]) },
              { t: "En trámite", n: cuenta(["azul"]) },
              { t: "Requieren atención", n: cuenta(["ambar", "rojo"]) },
              { t: "Abandonadas", n: cuenta(["gris"]) },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-black/[0.07] px-4 py-3">
                <p className="text-xs text-neutral-500">{x.t}</p>
                <p className="text-2xl font-semibold">{x.n}</p>
              </div>
            ))}
          </div>

          {ordenados.map(([grupo, marcas]) => (
            <section key={grupo} className="mt-8">
              <h2 className="mb-2 border-b-2 border-carbon pb-1 text-sm font-semibold uppercase tracking-wide">{grupo} <span className="font-normal text-neutral-400">· {marcas.length} {marcas.length === 1 ? "marca" : "marcas"}</span></h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Marca</th>
                    <th className="py-2 pr-3">Expediente / registro</th>
                    <th className="py-2 pr-3">Clase</th>
                    <th className="py-2 pr-3">Estatus actual</th>
                    <th className="py-2 pr-3">Último movimiento</th>
                    <th className="py-2">Encontrada como</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 align-top">
                  {marcas.map((m) => (
                    <tr key={m.expediente} className="break-inside-avoid">
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold">{m.denominacion}</p>
                        <p className="text-xs text-neutral-500">{m.tipoMarca}</p>
                        {m.enApp && <Link href={`/clientes/${m.enApp.clienteId}?marca=${m.enApp.id}`} className="text-[11px] text-marca-oscuro hover:underline print:hidden">En la app →</Link>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        <p>Exp. {m.expediente}</p>
                        {m.registro && <p>Reg. {m.registro}</p>}
                        {m.fechaPresentacion && <p className="text-neutral-500">Presentada {fmtFecha(m.fechaPresentacion)}</p>}
                        {m.fechaConcesion && <p className="text-neutral-500">Concesión {fmtFecha(m.fechaConcesion)}</p>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">{m.clase ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        {m.estatus ? <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium print:[print-color-adjust:exact] ${TONO[m.tono]}`}>{m.estatus}</span> : <span className="text-xs text-neutral-400">Consultando…</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-neutral-600">{m.ultimo ? <>{fmtFecha(m.ultimo.fecha)} · {m.ultimo.texto}</> : "—"}</td>
                      <td className="py-2.5 text-[11px] text-neutral-500">{m.encontradaComo.map((x) => <p key={x.como + x.nombre}>{x.como === "TITULAR" ? "Titular" : "Apoderado"}: {x.nombre}</p>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}

          {lista && r.marcas.length === 0 && <p className="mt-8 rounded-xl bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">El IMPI no tiene marcas registradas a nombre de estos titulares o apoderados.</p>}

          {r.busquedas.length > 0 && (
            <section className="mt-10 break-inside-avoid">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Detalle de las búsquedas</h2>
              <table className="w-full text-xs">
                <thead><tr className="text-left text-neutral-500"><th className="py-1.5 pr-3">Nombre buscado</th><th className="py-1.5 pr-3">Como</th><th className="py-1.5 pr-3">Marcas</th><th className="py-1.5">Nombres parecidos en el IMPI (no incluidos)</th></tr></thead>
                <tbody className="divide-y divide-black/5 align-top">
                  {r.busquedas.map((b) => (
                    <tr key={b.nombre + b.como}>
                      <td className="py-1.5 pr-3">{b.nombre}</td>
                      <td className="py-1.5 pr-3">{b.como === "TITULAR" ? "Titular" : "Apoderado"}</td>
                      <td className="py-1.5 pr-3">{b.error ? <span className="text-red-600">No se pudo buscar</span> : b.marcas}</td>
                      <td className="py-1.5 text-neutral-500">{b.parecidos.length ? b.parecidos.join(" · ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <footer className="mt-10 border-t border-black/10 pt-4 text-[11px] text-neutral-500">
            Información obtenida de la consulta pública del IMPI (MARCanet){a.terminado && ` el ${a.terminado.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`}. Elaborado por Arriola Abogados.
          </footer>
        </div>
      </article>
    </>
  );
}
