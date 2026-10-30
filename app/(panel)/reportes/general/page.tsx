import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { fmtFecha } from "@/lib/catalogos";
import { estadoBarrido } from "@/lib/marcanet/estado";
import { conclusiones, datosReporteGeneral, type Ganada, type Movimiento, type Perdida } from "@/lib/reporte-general";
import { Imprimir } from "../../auditorias/[id]/cliente";

export const metadata = { title: "Reporte general de marcas" };
export const maxDuration = 60;

export default async function ReporteGeneral() {
  await requerirAdmin();
  const [r, b] = await Promise.all([datosReporteGeneral(db), estadoBarrido()]);
  const parrafos = conclusiones(r);
  const avance = b.total ? Math.round((b.revisadas / b.total) * 100) : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/admin" className="text-sm text-neutral-500 hover:text-black">← Admin</Link>
        <Imprimir />
      </div>

      {(b.activo || b.solicitada) && (
        <p className="mx-auto mb-4 max-w-6xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
          {b.solicitada && !b.activo ? "La actualización de todas las marcas empieza en unos minutos." : `Actualizando todas las marcas en MARCanet · ${avance}% (${b.revisadas.toLocaleString("es-MX")} de ${b.total.toLocaleString("es-MX")}).`}{" "}
          El reporte ya muestra lo revisado hasta ahora; vuelve a abrirlo al terminar para verlo completo.
        </p>
      )}

      <article className="mx-auto max-w-6xl overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 print:max-w-none print:rounded-none print:shadow-none print:ring-0">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-carbon px-5 py-6 text-white sm:px-8 print:[print-color-adjust:exact]">
          <Image src="/logo.png" alt="Arriola Abogados" width={1040} height={380} className="w-36 sm:w-44" />
          <div className="text-right">
            <p className="text-lg font-semibold">Reporte general de marcas</p>
            <p className="text-sm text-white/70">{new Date().toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" })}{b.termino && !b.activo ? ` · última actualización completa: ${fmtFecha(b.termino)}` : ""}</p>
          </div>
        </header>

        <div className="space-y-10 px-4 py-6 sm:px-8">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra t="Marcas en total" n={r.total} />
            <Cifra t="Ganadas (registradas)" n={r.ganadas.length} tono="text-green-700" />
            <Cifra t="En trámite" n={r.enTramite} />
            <Cifra t="Oficios en curso" n={r.oficios.length} tono="text-amber-600" />
            <Cifra t="Declaraciones de uso · próx. 12 meses" n={r.ddu12} tono="text-sky-700" />
            <Cifra t="Renovaciones · próx. 12 meses" n={r.renov12} tono="text-sky-700" />
            <Cifra t="Negadas" n={r.negadas.length} tono="text-red-600" />
            <Cifra t="Abandonadas" n={r.abandonadas.length} tono="text-red-600" />
          </div>

          <Seccion n={1} titulo="Marcas ganadas: declaración de uso y renovación" ayuda="Declaración de uso: en los 3 meses siguientes al 3er aniversario de la concesión (concedidas desde el 10/08/2018). Renovación: cada 10 años desde la concesión, con 6 meses de gracia.">
            <h3 className="mb-2 text-sm font-semibold">Les toca en los próximos 12 meses ({r.proximas.length})</h3>
            <TablaGanadas lista={r.proximas} vacio="Ninguna en los próximos 12 meses." />
            {r.vencidas.length > 0 && (
              <>
                <h3 className="mb-2 mt-6 text-sm font-semibold text-red-700">Con declaración de uso o renovación vencida sin presentar ({r.vencidas.length})</h3>
                <TablaGanadas lista={r.vencidas} vacio="" />
              </>
            )}
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-semibold">Todas las marcas ganadas ({r.ganadas.length.toLocaleString("es-MX")}){r.sinFecha > 0 && <span className="font-normal text-neutral-400"> · {r.sinFecha} sin fecha de concesión en la app</span>}</summary>
              <div className="mt-2"><TablaGanadas lista={r.ganadas} vacio="" /></div>
            </details>
          </Seccion>

          <Seccion n={2} titulo="Marcas negadas y por qué" ayuda="El motivo se toma del oficio que el IMPI emitió antes de la negativa (anterioridad, impedimento o requisitos).">
            <Motivos lista={r.motivosNegadas} />
            <TablaPerdidas lista={r.negadas} />
          </Seccion>

          <Seccion n={3} titulo="Marcas abandonadas y por qué" ayuda="Abandonadas por no contestar un oficio a tiempo o porque el cliente ya no quiso continuar.">
            <Motivos lista={r.motivosAbandonadas} />
            <TablaPerdidas lista={r.abandonadas} />
          </Seccion>

          <Seccion n={4} titulo="Oficios en curso" ayuda="Oficios en plazo y el paso en el que van (avisar al cliente, esperar su pago, trabajar o presentar).">
            {r.oficios.length === 0 ? <p className="text-xs text-neutral-400">Sin oficios en curso.</p> : (
              <Tabla cabeza={["Marca", "Cliente", "Oficio", "Notificado", "Paso", "Vence"]}>
                {r.oficios.map((o, i) => (
                  <tr key={o.id + i}>
                    <TdMarca m={o} />
                    <td className="px-3 py-1.5 text-neutral-600">{o.cliente}</td>
                    <td className="px-3 py-1.5">{o.tipo}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtFecha(o.notificado)}</td>
                    <td className="px-3 py-1.5">{o.paso}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${o.vencido ? "font-medium text-red-600" : ""}`}>{fmtFecha(o.limite)}{o.vencido && " · vencido"}</td>
                  </tr>
                ))}
              </Tabla>
            )}
          </Seccion>

          <Seccion n={5} titulo="En espera de respuesta del IMPI" ayuda="Lo último en MARCanet es algo que presentamos nosotros: falta que el IMPI responda.">
            <TablaMovimientos lista={r.enEspera} vacio="Ninguna marca en espera." />
          </Seccion>

          <Seccion n={6} titulo="El IMPI ya nos contestó (últimos 3 meses)" ayuda="Marcas en trámite cuya última actualización en MARCanet es una respuesta del IMPI.">
            <TablaMovimientos lista={r.contestaron} vacio="Sin respuestas del IMPI en los últimos 3 meses." />
          </Seccion>

          <section className="rounded-2xl bg-neutral-50 p-5 print:[print-color-adjust:exact]">
            <h2 className="mb-3 text-base font-semibold">Qué nos dice este reporte</h2>
            <div className="space-y-2.5 text-sm leading-relaxed text-neutral-700">
              {parrafos.map((p) => <p key={p}>{p}</p>)}
            </div>
          </section>
        </div>
      </article>
    </>
  );
}

function Cifra({ t, n, tono = "" }: { t: string; n: number; tono?: string }) {
  return (
    <div className="rounded-xl border border-black/[0.07] px-4 py-3">
      <p className={`text-2xl font-semibold ${n === 0 ? "text-neutral-300" : tono}`}>{n.toLocaleString("es-MX")}</p>
      <p className="text-xs leading-tight text-neutral-500">{t}</p>
    </div>
  );
}

function Seccion({ n, titulo, ayuda, children }: { n: number; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2 border-b-2 border-carbon pb-1 text-base font-semibold"><span className="text-neutral-400">{n}.</span> {titulo}</h2>
      <p className="mb-4 mt-1 text-xs text-neutral-500">{ayuda}</p>
      {children}
    </section>
  );
}

function Tabla({ cabeza, children }: { cabeza: string[]; children: React.ReactNode }) {
  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border border-black/[0.07] print:max-h-none print:overflow-visible">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500"><tr>{cabeza.map((h) => <th key={h} className="px-3 py-1.5 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-black/5">{children}</tbody>
      </table>
    </div>
  );
}

const TdMarca = ({ m }: { m: { id: string; clienteId: string; denominacion: string; numeroExpediente: string | null } }) => (
  <td className="px-3 py-1.5">
    <Link href={`/clientes/${m.clienteId}?marca=${m.id}`} className="font-medium hover:underline">{m.denominacion}</Link>
    <span className="block text-[11px] text-neutral-400">Exp. {m.numeroExpediente ?? "s/n"}</span>
  </td>
);

function TablaGanadas({ lista, vacio }: { lista: Ganada[]; vacio: string }) {
  if (!lista.length) return <p className="text-xs text-neutral-400">{vacio}</p>;
  return (
    <Tabla cabeza={["Marca", "Cliente", "Registro", "Concesión", "Declaración de uso", "Renovación"]}>
      {lista.map((g) => (
        <tr key={g.id}>
          <TdMarca m={g} />
          <td className="px-3 py-1.5 text-neutral-600">{g.cliente}</td>
          <td className="px-3 py-1.5">{g.registro ?? "—"}</td>
          <td className="px-3 py-1.5 whitespace-nowrap">{g.concesion ? fmtFecha(g.concesion) : "—"}</td>
          <td className="px-3 py-1.5">
            {!g.concesion ? "—" : !g.ddu ? <span className="text-neutral-400">No aplica (antes de 2018)</span>
              : g.ddu.presentada ? <span className="text-green-700">Presentada</span>
              : <span className={g.ddu.fin < new Date() ? "font-medium text-red-600" : g.proximo?.que === "Declaración de uso" ? "font-medium text-sky-700" : ""}>{fmtFecha(g.ddu.inicio)} al {fmtFecha(g.ddu.fin)}</span>}
          </td>
          <td className="px-3 py-1.5 whitespace-nowrap">
            {!g.renovacion ? "—" : g.renovacion.presentada ? <span className="text-green-700">Renovada</span>
              : <span className={g.vencida === "Registro vencido sin renovar" ? "font-medium text-red-600" : g.proximo?.que === "Renovación" ? "font-medium text-sky-700" : ""}>{fmtFecha(g.renovacion.vence)}</span>}
          </td>
        </tr>
      ))}
    </Tabla>
  );
}

function Motivos({ lista }: { lista: [string, number][] }) {
  if (!lista.length) return null;
  const total = lista.reduce((a, [, n]) => a + n, 0);
  return (
    <ul className="mb-4 space-y-1.5">
      {lista.map(([m, n]) => (
        <li key={m} className="text-xs">
          <div className="flex justify-between gap-3"><span>{m}</span><b className="font-semibold">{n}</b></div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 print:[print-color-adjust:exact]"><div className="h-full rounded-full bg-red-400" style={{ width: `${(n / total) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function TablaPerdidas({ lista }: { lista: Perdida[] }) {
  if (!lista.length) return <p className="text-xs text-neutral-400">Ninguna.</p>;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold">Ver la lista ({lista.length.toLocaleString("es-MX")})</summary>
      <div className="mt-2">
        <Tabla cabeza={["Marca", "Cliente", "Fecha", "Motivo", "Nota"]}>
          {lista.map((p) => (
            <tr key={p.id}>
              <TdMarca m={p} />
              <td className="px-3 py-1.5 text-neutral-600">{p.cliente}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{p.fecha ? fmtFecha(p.fecha) : "—"}</td>
              <td className="px-3 py-1.5">{p.motivo}</td>
              <td className="px-3 py-1.5 text-neutral-500">{p.detalle ?? ""}</td>
            </tr>
          ))}
        </Tabla>
      </div>
    </details>
  );
}

function TablaMovimientos({ lista, vacio }: { lista: Movimiento[]; vacio: string }) {
  if (!lista.length) return <p className="text-xs text-neutral-400">{vacio}</p>;
  return (
    <Tabla cabeza={["Marca", "Cliente", "Fecha", "Qué hay en MARCanet"]}>
      {lista.map((m) => (
        <tr key={m.id}>
          <TdMarca m={m} />
          <td className="px-3 py-1.5 text-neutral-600">{m.cliente}</td>
          <td className="px-3 py-1.5 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
          <td className="px-3 py-1.5 text-neutral-600">{m.texto}</td>
        </tr>
      ))}
    </Tabla>
  );
}
