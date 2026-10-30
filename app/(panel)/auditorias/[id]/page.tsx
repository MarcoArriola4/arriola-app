import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown } from "lucide-react";
import { db } from "@/lib/db";
import { requerirPermisoPagina } from "@/lib/auth";
import { fmtFecha } from "@/lib/catalogos";
import { categoriaDe, progresoAuditoria, type MarcaAuditada, type ResultadoAuditoria } from "@/lib/marcanet/auditoria";
import { Imprimir } from "./cliente";
import { RelojAuditoria } from "@/components/reloj-auditoria";
import { oportunidades } from "@/components/seccion-auditoria";
import { redactarAuditoria } from "@/lib/redaccion-auditoria";

export const metadata = { title: "Reporte 2" };

const TONO: Record<MarcaAuditada["tono"], string> = {
  verde: "bg-green-50 text-green-800",
  azul: "bg-sky-50 text-sky-800",
  ambar: "bg-amber-50 text-amber-800",
  rojo: "bg-red-50 text-red-700",
  gris: "bg-neutral-100 text-neutral-600",
};

const TEXTO: Record<MarcaAuditada["tono"], string> = { verde: "text-green-700", azul: "text-sky-700", ambar: "text-amber-700", rojo: "text-red-700", gris: "text-neutral-500" };
const CATEGORIAS = [
  { id: "GANADA", titulo: "Ganadas · registradas", borde: "border-green-600" },
  { id: "PROCESO", titulo: "En proceso", borde: "border-sky-600" },
  { id: "PERDIDA", titulo: "Abandonadas, negadas o vencidas", borde: "border-red-600" },
];

export default async function Auditoria({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requerirPermisoPagina("reporte2")]);
  const a = await db.auditoria.findUnique({ where: { id } });
  if (!a) notFound();
  const cliente = a.clienteId ? await db.cliente.findUnique({ where: { id: a.clienteId }, select: { id: true, nombre: true } }) : null;
  const nombres = JSON.parse(a.nombres) as string[];
  const r: ResultadoAuditoria = a.resultado ? JSON.parse(a.resultado) : { busquedas: [], marcas: [] };
  const lista = a.estado === "LISTA";

  // Agrupadas en ganadas, en proceso y perdidas; dentro, por titular y por marca
  const titularDe = (m: MarcaAuditada) => m.encontradaComo.find((x) => x.como === "TITULAR")?.nombre ?? m.encontradaComo[0]?.nombre ?? "";
  const ordenar = (ms: MarcaAuditada[]) => ms.sort((p, q) => titularDe(p).localeCompare(titularDe(q), "es") || p.denominacion.localeCompare(q.denominacion, "es") || p.expediente.localeCompare(q.expediente));
  const ordenados = CATEGORIAS.map((c) => [c, ordenar(r.marcas.filter((m) => categoriaDe(m) === c.id))] as const).filter(([, ms]) => ms.length);
  const cuentaCat = (id: string) => r.marcas.filter((m) => categoriaDe(m) === id).length;
  const hoy = a.terminado ?? new Date();
  const texto = lista ? redactarAuditoria(r) : null;

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

      <div className="mb-4 print:hidden"><RelojAuditoria p={progresoAuditoria(a)} /></div>

      <article className="mx-auto max-w-7xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-carbon px-4 py-5 sm:px-8 sm:py-6 text-white print:[print-color-adjust:exact]">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-32 sm:w-44" />
          <div className="sm:text-right">
            <p className="text-lg font-semibold">Auditoría de marcas</p>
            <p className="text-sm text-white/70">{hoy.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-8 sm:py-6">
          {cliente && <><p className="text-xs uppercase tracking-wide text-neutral-500">Cliente</p><h1 className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{cliente.nombre}</h1></>}
          <p className="mt-1 text-sm text-neutral-600">Búsqueda en el IMPI (MARCanet) por titular y por apoderado de: <b className="font-medium">{nombres.join(" · ")}</b></p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {[
              { t: "Marcas encontradas", n: r.marcas.length, cls: "" },
              { t: "Ganadas (registradas)", n: cuentaCat("GANADA"), cls: "text-green-700" },
              { t: "En proceso", n: cuentaCat("PROCESO"), cls: "text-sky-700" },
              { t: "Abandonadas, negadas o vencidas", n: cuentaCat("PERDIDA"), cls: "text-red-700" },
              { t: "No contratadas con nosotros", n: oportunidades(r).length, cls: "text-violet-700" },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-black/[0.07] px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="text-xs text-neutral-500">{x.t}</p>
                <p className={`text-2xl font-semibold ${x.cls}`}>{x.n}</p>
              </div>
            ))}
          </div>

          {texto && (
            <section className="mt-6 break-inside-avoid rounded-xl border border-black/[0.07] px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-700">Estatus general y recomendaciones</h2>
              <div className="space-y-2.5 text-sm leading-relaxed text-neutral-700">
                {texto.parrafos.map((t) => <p key={t}>{t}</p>)}
                {texto.recomendaciones.length > 0 && (
                  <>
                    <p>{texto.introRecomendaciones}</p>
                    <ul className="space-y-1.5">
                      {texto.recomendaciones.map((x) => (
                        <li key={x.marca} className="rounded-lg bg-neutral-50 px-3 py-2 print:[print-color-adjust:exact]">
                          <b className="font-semibold">{x.marca}</b> <span className="text-neutral-500">(hoy en clase{x.clases.length > 1 ? "s" : ""} {x.clases.join(", ")})</span>
                          <span className="block text-[13px]">Sugerimos: {x.sugeridas.map((c) => `clase ${c.clase} – ${c.descripcion}`).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p>{texto.cierre}</p>
              </div>
            </section>
          )}

          {lista && oportunidades(r).length > 0 && (
            <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50/50 px-5 py-4 print:[print-color-adjust:exact]">
              <h2 className="text-sm font-semibold text-violet-900">Marcas no contratadas con Arriola Abogados · {oportunidades(r).length}</h2>
              <p className="mt-0.5 break-words text-xs text-violet-800">{oportunidades(r).map((m) => `${m.denominacion} (exp. ${m.expediente}${m.clase ? `, clase ${m.clase}` : ""})`).join(" · ")}</p>
            </section>
          )}

          {ordenados.map(([cat, marcas]) => (
            <section key={cat.id} className="mt-8">
              <h2 className={`mb-2 border-b-2 pb-1 text-sm font-semibold uppercase tracking-wide ${cat.borde}`}>{cat.titulo} <span className="font-normal text-neutral-400">· {marcas.length} {marcas.length === 1 ? "marca" : "marcas"}</span></h2>
              {/* Teléfono: una tarjeta por marca */}
              <ul className="divide-y divide-black/5 md:hidden print:hidden">
                {marcas.map((m) => (
                  <li key={m.expediente} className="space-y-1.5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-semibold">{m.denominacion}</p>
                      <span className="shrink-0 text-xs text-neutral-500">Clase {m.clase ?? "—"}</span>
                    </div>
                    <p className="text-[11px] text-neutral-500">Exp. {m.expediente}{m.registro && ` · Reg. ${m.registro}`}{m.tipoMarca && ` · ${m.tipoMarca}`}</p>
                    {m.estatus ? <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${TONO[m.tono]}`}>{m.estatus}</span> : <span className="text-xs text-neutral-400">Consultando…</span>}
                    <p className="text-[11px] text-neutral-600">
                      Presentación {m.fechaPresentacion ? fmtFecha(m.fechaPresentacion) : "—"} · Concesión {m.fechaConcesion ? fmtFecha(m.fechaConcesion) : "—"} · Vigencia {m.vigencia ? fmtFecha(m.vigencia) : "—"}
                    </p>
                    {[m.ddu, m.renovacion].filter(Boolean).map((j) => <p key={j!.texto} className={`text-[11px] ${TEXTO[j!.tono]}`}>{j!.texto}</p>)}
                    {m.contestaciones?.map((c) => <p key={c.texto} className={`text-[11px] ${TEXTO[c.tono]}`}>{c.texto}</p>)}
                    {m.ultimo && <p className="text-[11px] text-neutral-500">Último movimiento: {fmtFecha(m.ultimo.fecha)} · {m.ultimo.texto}</p>}
                    <p className="text-[11px] text-neutral-400">{m.encontradaComo.map((x) => `${x.como === "TITULAR" ? "Titular" : "Apoderado"}: ${x.nombre}`).join(" · ")}</p>
                    {m.enApp ? <Link href={`/clientes/${m.enApp.clienteId}?marca=${m.enApp.id}`} className="text-[11px] text-marca-oscuro hover:underline">Contratada con nosotros →</Link> : <span className="text-[11px] font-medium text-violet-700">No contratada con nosotros</span>}
                  </li>
                ))}
              </ul>
              {/* Computadora e impresión: tabla */}
              <table className="hidden w-full text-sm md:table print:table">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                    <th className="py-2 pr-3">Marca</th>
                    <th className="py-2 pr-3">Expediente · clase</th>
                    <th className="py-2 pr-3">Presentación · concesión · vigencia</th>
                    <th className="py-2 pr-3">Estatus actual</th>
                    <th className="py-2 pr-3">Declaración de uso · renovación</th>
                    <th className="py-2">Oficios y contestaciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 align-top">
                  {marcas.map((m) => (
                    <tr key={m.expediente} className="break-inside-avoid">
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold">{m.denominacion}</p>
                        <p className="text-[11px] text-neutral-500">{m.tipoMarca}</p>
                        <p className="text-[11px] text-neutral-400">{m.encontradaComo.map((x) => `${x.como === "TITULAR" ? "Titular" : "Apoderado"}: ${x.nombre}`).join(" · ")}</p>
                        {m.enApp ? <Link href={`/clientes/${m.enApp.clienteId}?marca=${m.enApp.id}`} className="text-[11px] text-marca-oscuro hover:underline print:hidden">Contratada con nosotros →</Link> : <span className="text-[11px] font-medium text-violet-700">No contratada con nosotros</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs">
                        <p>Exp. {m.expediente}</p>
                        {m.registro && <p>Reg. {m.registro}</p>}
                        <p className="text-neutral-500">Clase {m.clase ?? "—"}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-neutral-600">
                        <p>Presentación: {m.fechaPresentacion ? fmtFecha(m.fechaPresentacion) : "—"}</p>
                        <p>Concesión: {m.fechaConcesion ? fmtFecha(m.fechaConcesion) : "—"}</p>
                        <p>Vigencia: {m.vigencia ? fmtFecha(m.vigencia) : "—"}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        {m.estatus ? <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium print:[print-color-adjust:exact] ${TONO[m.tono]}`}>{m.estatus}</span> : <span className="text-xs text-neutral-400">Consultando…</span>}
                        {m.ultimo && <p className="mt-1 text-[11px] text-neutral-500">Último movimiento: {fmtFecha(m.ultimo.fecha)} · {m.ultimo.texto}</p>}
                      </td>
                      <td className="py-2.5 pr-3 text-[11px]">
                        {[m.ddu, m.renovacion].filter(Boolean).map((j) => <p key={j!.texto} className={TEXTO[j!.tono]}>{j!.texto}</p>)}
                        {!m.ddu && !m.renovacion && <span className="text-neutral-400">{categoriaDe(m) === "GANADA" ? "Sin fecha de concesión" : "No aplica (no registrada)"}</span>}
                      </td>
                      <td className="py-2.5 text-[11px]">
                        {m.contestaciones?.length ? m.contestaciones.map((c) => <p key={c.texto} className={TEXTO[c.tono]}>{c.texto}</p>) : <span className="text-neutral-400">Sin oficios que contestar</span>}
                      </td>
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
              <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead><tr className="text-left text-neutral-500"><th className="py-1.5 pr-3">Nombre buscado</th><th className="py-1.5 pr-3">Como</th><th className="py-1.5 pr-3">Marcas</th><th className="py-1.5">Nombres parecidos en el IMPI (no incluidos)</th></tr></thead>
                <tbody className="divide-y divide-black/5 align-top">
                  {r.busquedas.map((b) => (
                    <tr key={b.nombre + b.como}>
                      <td className="py-1.5 pr-3">
                        {b.nombre}
                        {b.consulta && b.consulta !== b.nombre && <span className="block text-neutral-400">encontrado como «{b.consulta}»</span>}
                        {b.aproximadas?.length ? <span className="block text-amber-700">incluidos por parecido: {b.aproximadas.join(" · ")}</span> : null}
                      </td>
                      <td className="py-1.5 pr-3">{b.como === "TITULAR" ? "Titular" : "Apoderado"}</td>
                      <td className="py-1.5 pr-3">
                        {b.error && !b.marcas ? <span className="text-red-600">No se pudo buscar</span> : b.marcas}
                        {b.error && b.marcas > 0 && <span className="block text-red-600">{b.error}</span>}
                      </td>
                      <td className="py-1.5 text-neutral-500">{b.parecidos.length ? b.parecidos.join(" · ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
