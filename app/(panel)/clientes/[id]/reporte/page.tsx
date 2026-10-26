import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { cargarInhabiles } from "@/lib/inhabiles";
import { ACTIVAS } from "@/lib/consultas";
import { TIPOS_EXPEDIENTE, TIPOS_OFICIO, esSigno, fmtFecha, normalizarNombre } from "@/lib/catalogos";
import { diasRestantes, esperandoImpi, fechaLimiteDDU, fechaRenovacion, siguientePlazo } from "@/lib/plazos";
import { AccionesReporte } from "./acciones";

export const metadata = { title: "Reporte de marcas" };

// Estatus explicado para el cliente (sin términos internos del despacho)
const ESTATUS: Record<string, { txt: string; cls: string }> = {
  POR_PRESENTAR: { txt: "Por presentar", cls: "bg-neutral-100 text-neutral-700" },
  EN_TRAMITE: { txt: "En trámite ante el IMPI", cls: "bg-sky-50 text-sky-800" },
  CON_OFICIO: { txt: "Requerimiento del IMPI en atención", cls: "bg-amber-50 text-amber-800" },
  CONCEDIDA: { txt: "Registrada", cls: "bg-green-50 text-green-800" },
  NEGATIVA: { txt: "Negativa del IMPI", cls: "bg-red-50 text-red-700" },
  CONFIRMA_ACTO: { txt: "Negativa confirmada", cls: "bg-red-50 text-red-700" },
  EN_JUICIO: { txt: "En recurso de revisión / juicio", cls: "bg-violet-50 text-violet-800" },
  ABANDONADA: { txt: "Abandonada", cls: "bg-neutral-100 text-neutral-500" },
};

const clave = (t: string) => normalizarNombre(t).replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export default async function ReporteCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ titular?: string }> }) {
  const [{ id }, { titular }] = await Promise.all([params, searchParams, requerirSesion()]);
  const c = await db.cliente.findUnique({
    where: { id },
    include: {
      expedientes: {
        include: {
          notificaciones: { where: { estado: { in: [...ACTIVAS, "NO_PAGO"] } }, orderBy: { fechaNotificacion: "desc" } },
          oficiosImpi: { orderBy: { fechaOficio: "desc" }, take: 1 },
        },
      },
    },
  });
  if (!c) notFound();
  const inhabiles = await cargarInhabiles();
  const hoy = new Date();

  // Agrupadas por titular, ordenadas por titular y luego por marca
  const todas = c.expedientes.map((e) => ({ ...e, tit: (e.titular ?? c.nombre).replace(/\s+/g, " ").trim() }));
  const titulares = [...new Map(todas.map((e) => [clave(e.tit), e.tit])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const elegidas = titular ? todas.filter((e) => clave(e.tit) === titular) : todas;
  const grupos = titulares
    .filter(([k]) => !titular || k === titular)
    .map(([k, nombre]) => ({ nombre, marcas: elegidas.filter((e) => clave(e.tit) === k).sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es")) }))
    .filter((g) => g.marcas.length);

  const filas = (e: (typeof elegidas)[number]) => {
    const signo = esSigno(e.tipo);
    const ddu = signo && e.fechaConcesion ? fechaLimiteDDU(e.fechaConcesion, inhabiles) : null;
    const renov = signo && e.fechaConcesion ? fechaRenovacion(e.fechaConcesion) : null;
    const oficio = e.notificaciones.find((n) => ACTIVAS.includes(n.estado));
    const proximos: string[] = [];
    if (e.desistio) proximos.push("Sin seguimiento (el titular decidió no continuar)");
    else if (oficio) {
      if (esperandoImpi(oficio)) proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: en espera de la resolución del IMPI`);
      else if (oficio.pendienteNotificar) proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: emitido, pendiente de notificación`);
      else {
        const p = siguientePlazo(oficio);
        proximos.push(`${TIPOS_OFICIO[oficio.tipo]}: responder a más tardar el ${fmtFecha(p.fecha)}${p.etiqueta ? ` (${p.etiqueta.toLowerCase()})` : ""}`);
      }
    }
    if (ddu && diasRestantes(ddu, hoy) >= -30 && diasRestantes(ddu, hoy) <= 365) proximos.push(`Declaración de uso: a más tardar el ${fmtFecha(ddu)}`);
    if (renov && diasRestantes(renov, hoy) <= 365 && diasRestantes(renov, hoy) >= -180) proximos.push(`Renovación: vence el ${fmtFecha(renov)}`);
    if (!proximos.length && renov && e.etapa === "CONCEDIDA") proximos.push(`Vigente hasta el ${fmtFecha(renov)}`);
    return { ddu, renov, proximos };
  };

  const etapa = (e: (typeof elegidas)[number]) => (e.desistio ? "ABANDONADA" : e.etapa);
  const cuenta = (et: string[]) => elegidas.filter((e) => et.includes(etapa(e))).length;
  const resumen = [
    { t: "Marcas", n: elegidas.length },
    { t: "Registradas", n: cuenta(["CONCEDIDA"]) },
    { t: "En trámite", n: cuenta(["POR_PRESENTAR", "EN_TRAMITE", "CON_OFICIO"]) },
    { t: "Negativa / juicio", n: cuenta(["NEGATIVA", "CONFIRMA_ACTO", "EN_JUICIO"]) },
  ];
  const consultaMasVieja = elegidas.map((e) => e.marcanetSync).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/clientes/${c.id}`} className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> {c.nombre}</Link>
        <AccionesReporte
          clienteId={c.id}
          titular={titular ?? ""}
          titulares={titulares.map(([k, n]) => ({ clave: k, nombre: n }))}
          ids={elegidas.filter((e) => e.numeroExpediente && esSigno(e.tipo)).map((e) => e.id)}
        />
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
          <h1 className="text-2xl font-semibold tracking-tight">{c.nombre}</h1>
          {titular && <p className="text-sm text-neutral-600">Titular: {grupos[0]?.nombre}</p>}

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
                    const f = filas(e);
                    const est = ESTATUS[etapa(e)] ?? { txt: etapa(e), cls: "" };
                    const ultimo = e.ultimaActImpi && e.ultimaActImpiFecha ? `${fmtFecha(e.ultimaActImpiFecha)} · ${e.ultimaActImpi}` : e.oficiosImpi[0] ? `${fmtFecha(e.oficiosImpi[0].fechaOficio)} · ${e.oficiosImpi[0].descripcion}` : null;
                    return (
                      <tr key={e.id} className="break-inside-avoid">
                        <td className="py-2.5 pr-3"><p className="font-semibold">{e.denominacion}</p><p className="text-xs text-neutral-500">{TIPOS_EXPEDIENTE[e.tipo]}</p></td>
                        <td className="py-2.5 pr-3 text-xs"><p>Exp. {e.numeroExpediente ?? "—"}</p>{e.numeroRegistro && <p>Reg. {e.numeroRegistro}</p>}</td>
                        <td className="py-2.5 pr-3 text-xs text-neutral-600">
                          {e.fechaPresentacion && <p>Presentada: {fmtFecha(e.fechaPresentacion)}</p>}
                          {e.fechaConcesion && <p>Concesión: {fmtFecha(e.fechaConcesion)}</p>}
                        </td>
                        <td className="py-2.5 pr-3"><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium print:[print-color-adjust:exact] ${est.cls}`}>{est.txt}</span></td>
                        <td className="py-2.5 text-xs">
                          {ultimo && <p className="text-neutral-600">{ultimo}</p>}
                          {f.proximos.map((p) => <p key={p} className="font-medium text-neutral-900">→ {p}</p>)}
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
