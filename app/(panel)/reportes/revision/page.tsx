import Image from "next/image";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { fmtFecha, mxn } from "@/lib/catalogos";
import { datosRevision, listarRevisiones, nombreModo } from "@/lib/reporte-revision";
import { Encabezado, Vacio } from "@/components/ui";
import { Imprimir } from "../../auditorias/[id]/cliente";
import { ElegirRevision } from "./elegir";

export const metadata = { title: "Reporte de revisión" };
export const maxDuration = 60;

const fh = (d: Date | null) => (d ? d.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" }) : "en curso");

export default async function ReporteRevision({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const [{ r }] = await Promise.all([searchParams, requerirSesion()]);
  const revisiones = await listarRevisiones(db);
  const rev = revisiones.find((x) => x.clave === r) ?? revisiones[0];
  if (!rev) return <><Encabezado titulo="Reporte de revisión" /><div className="card"><Vacio>Aún no hay revisiones registradas.</Vacio></div></>;
  const d = await datosRevision(db, rev);
  const nov = d.novedades;
  const t3 = d.tresMeses;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/reportes" className="text-sm text-neutral-500 hover:text-black">← Reportes</Link>
          <ElegirRevision actual={rev.clave} opciones={revisiones.map((x) => ({ clave: x.clave, texto: `${nombreModo(x.modo)} · ${x.inicio.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` }))} />
        </div>
        <div className="flex gap-2">
          <a href={`/api/reportes/revision?r=${encodeURIComponent(rev.clave)}`} className="btn"><FileDown size={14} /> Descargar en Word</a>
          <Imprimir />
        </div>
      </div>

      <article className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-carbon px-8 py-6 text-white print:[print-color-adjust:exact]">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-44" />
          <div className="text-right">
            <p className="text-lg font-semibold">Reporte de revisión de marcas</p>
            <p className="text-sm text-white/70">{nombreModo(rev.modo)}</p>
          </div>
        </header>

        <div className="space-y-10 px-8 py-6">
          {/* 1. Resumen */}
          <Seccion n={1} titulo="Resumen de la revisión" ayuda="Qué se revisó en MARCanet, cuándo y con qué resultado.">
            <p className="mb-4 text-sm text-neutral-600">Del <b>{fh(rev.inicio)}</b> al <b>{fh(rev.fin)}</b> (hora de la Ciudad de México){rev.enCurso && " · aún en curso"}.</p>
            <Cifras items={[
              { t: "Marcas revisadas", n: rev.revisadas },
              { t: "No se pudieron consultar", n: d.conError.length, rojo: d.conError.length > 0 },
              { t: "No revisadas: abandonadas o negadas", n: d.noRevisadas.perdidas.length },
              { t: "No revisadas: registradas (se revisan en su periodo)", n: d.noRevisadas.registradas.length },
            ]} />
          </Seccion>

          {/* 2. Novedades */}
          <Seccion n={2} titulo="Novedades del IMPI en esta revisión" ayuda="Lo que apareció por primera vez en MARCanet durante esta revisión.">
            <Cifras items={[
              { t: "Marcas ganadas (concedidas)", n: nov.ganadas.length, verde: true },
              { t: "Marcas negadas", n: nov.negadas.length, rojo: nov.negadas.length > 0 },
              { t: "Marcas abandonadas", n: nov.abandonadas.length, rojo: nov.abandonadas.length > 0 },
              { t: "Oficios nuevos por atender", n: nov.oficios.length },
              { t: "Contestaciones registradas", n: nov.contestadas.length },
            ]} />
            <TablaMarcas titulo="Marcas ganadas" lista={nov.ganadas} vacio="Ninguna marca nueva concedida en esta revisión." />
            <TablaMarcas titulo="Marcas negadas" lista={nov.negadas} vacio="Ninguna negativa nueva." />
            <TablaMarcas titulo="Marcas abandonadas" lista={nov.abandonadas} vacio="Ningún abandono nuevo." />
            <TablaMarcas titulo="Oficios nuevos" lista={nov.oficios} vacio="Ningún oficio nuevo." />
            <TablaMarcas titulo="Contestaciones registradas ante el IMPI" lista={nov.contestadas} vacio="Ninguna contestación nueva." />
          </Seccion>

          {/* 3. No revisadas */}
          <Seccion n={3} titulo="Marcas que no se revisaron y por qué" ayuda="Para no gastar consultas: las registradas solo se revisan en sus periodos (declaración de uso: desde 1 semana antes del 3er aniversario y hasta 3 meses después; renovación: desde 6 meses antes de su vigencia y hasta 6 meses después). Las abandonadas o negadas ya no se revisan.">
            <h3 className="mb-2 text-sm font-semibold">Registradas · próxima revisión programada ({d.noRevisadas.registradas.length})</h3>
            <div className="mb-6 max-h-[420px] overflow-y-auto rounded-lg border border-black/[0.07] print:max-h-none print:overflow-visible">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500"><tr><th className="px-3 py-2">Marca</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Expediente</th><th className="px-3 py-2">Se vuelve a revisar</th><th className="px-3 py-2">Por</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.noRevisadas.registradas.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-1.5 font-medium"><Link href={`/clientes/${o.clienteId}?marca=${o.id}`} className="hover:underline">{o.denominacion}</Link></td>
                      <td className="px-3 py-1.5 text-neutral-600">{o.cliente}</td>
                      <td className="px-3 py-1.5">{o.numeroExpediente ?? "—"}</td>
                      <td className="px-3 py-1.5 font-medium">{o.proximaRevision ? fmtFecha(o.proximaRevision) : "—"}</td>
                      <td className="px-3 py-1.5 text-neutral-500">{o.porque ?? "Sin periodos pendientes"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="mb-2 text-sm font-semibold">Abandonadas, negadas o que ya no continúan ({d.noRevisadas.perdidas.length})</h3>
            <div className="max-h-[320px] overflow-y-auto rounded-lg border border-black/[0.07] print:max-h-none print:overflow-visible">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500"><tr><th className="px-3 py-2">Marca</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Expediente</th><th className="px-3 py-2">Motivo</th></tr></thead>
                <tbody className="divide-y divide-black/5">
                  {d.noRevisadas.perdidas.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-1.5 font-medium"><Link href={`/clientes/${o.clienteId}?marca=${o.id}`} className="hover:underline">{o.denominacion}</Link></td>
                      <td className="px-3 py-1.5 text-neutral-600">{o.cliente}</td>
                      <td className="px-3 py-1.5">{o.numeroExpediente ?? "—"}</td>
                      <td className="px-3 py-1.5 text-neutral-500">{o.porque}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Seccion>

          {d.conError.length > 0 && (
            <Seccion n={4} titulo="Marcas que no se pudieron consultar" ayuda="MARCanet no respondió para estas marcas; se reintentan solas en la siguiente revisión.">
              <TablaMarcas lista={d.conError} vacio="" />
            </Seccion>
          )}

          {/* 5. Últimos 3 meses */}
          <Seccion n={d.conError.length ? 5 : 4} titulo={`Últimos 3 meses (desde el ${fmtFecha(t3.desde)})`} ayuda="Lo contratado recientemente y lo que todavía falta: pagar, trabajar, presentar o avisar.">
            <Cifras items={[
              { t: "Marcas ingresadas (registros contratados)", n: t3.ingresadas.length, verde: true },
              { t: `Por pagar (${mxn.format(t3.porPagar.monto)})`, n: t3.porPagar.cuantos, rojo: t3.porPagar.cuantos > 0 },
              { t: "Por trabajar", n: t3.porTrabajar },
              { t: "En espera de Vo. Bo.", n: t3.voBo },
              { t: "Por presentar", n: t3.porPresentar },
              { t: "Pagar en sistema", n: t3.pagarSistema },
              { t: "Oficios por avisar al cliente", n: t3.oficiosPorAvisar },
              { t: "Oficios esperando pago", n: t3.oficiosEsperandoPago },
            ]} />
            <TablaMarcas titulo="Marcas ingresadas" lista={t3.ingresadas} vacio="Sin registros contratados en los últimos 3 meses." fechaTitulo="Contratada" />
          </Seccion>

          <footer className="border-t border-black/10 pt-4 text-[11px] text-neutral-500">Reporte generado el {fh(new Date())} con la información de MARCanet (IMPI) y del seguimiento de Arriola Abogados.</footer>
        </div>
      </article>
    </>
  );
}

function Seccion({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="flex items-baseline gap-2 border-b-2 border-carbon pb-1 text-base font-semibold"><span className="text-neutral-400">{n}.</span> {titulo}</h2>
      <p className="mb-4 mt-1 text-xs text-neutral-500">{ayuda}</p>
      {children}
    </section>
  );
}

function Cifras({ items }: { items: { t: string; n: number; rojo?: boolean; verde?: boolean }[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((x) => (
        <div key={x.t} className="rounded-xl border border-black/[0.07] px-4 py-3">
          <p className={`text-2xl font-semibold ${x.n === 0 ? "text-neutral-300" : x.rojo ? "text-red-600" : x.verde ? "text-green-700" : ""}`}>{x.n.toLocaleString("es-MX")}</p>
          <p className="text-xs leading-tight text-neutral-500">{x.t}</p>
        </div>
      ))}
    </div>
  );
}

type Breve = { id: string; clienteId: string; denominacion: string; numeroExpediente: string | null; cliente: string; fecha: Date | null; detalle: string };
function TablaMarcas({ titulo, lista, vacio, fechaTitulo = "Fecha" }: { titulo?: string; lista: Breve[]; vacio: string; fechaTitulo?: string }) {
  return (
    <div className="mb-5">
      {titulo && <h3 className="mb-1.5 text-sm font-semibold">{titulo} <span className="font-normal text-neutral-400">({lista.length})</span></h3>}
      {lista.length === 0 ? (
        <p className="text-xs text-neutral-400">{vacio}</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-neutral-50 text-left text-neutral-500"><tr><th className="px-3 py-1.5">Marca</th><th className="px-3 py-1.5">Cliente</th><th className="px-3 py-1.5">Expediente</th><th className="px-3 py-1.5">{fechaTitulo}</th><th className="px-3 py-1.5">Detalle</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {lista.map((m, i) => (
              <tr key={m.id + i}>
                <td className="px-3 py-1.5 font-medium"><Link href={`/clientes/${m.clienteId}?marca=${m.id}`} className="hover:underline">{m.denominacion}</Link></td>
                <td className="px-3 py-1.5 text-neutral-600">{m.cliente}</td>
                <td className="px-3 py-1.5">{m.numeroExpediente ?? "—"}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{m.fecha ? fmtFecha(m.fecha) : "—"}</td>
                <td className="px-3 py-1.5 text-neutral-500">{m.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
