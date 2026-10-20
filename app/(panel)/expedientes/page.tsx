import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ETAPAS, TIPOS_EXPEDIENTE } from "@/lib/catalogos";
import { Encabezado, Etapa, Vacio, VistaClientesMarcas } from "@/components/ui";
import { ActualizarTodas } from "@/components/actualizar-todas";
import { estadoBarrido } from "@/lib/marcanet/estado";
import { fmtFecha } from "@/lib/catalogos";

export const metadata = { title: "Marcas" };
// El botón "Actualizar todas" consulta MARCanet marca por marca (~15 s cada una)
export const maxDuration = 60;
const POR_PAGINA = 50;

export default async function Expedientes({ searchParams }: { searchParams: Promise<{ q?: string; etapa?: string; tipo?: string; p?: string }> }) {
  const { q = "", etapa = "", tipo = "", p = "1" } = await searchParams;
  const pagina = Math.max(1, Number(p) || 1);
  const t = q.trim();
  const where: Prisma.ExpedienteWhereInput = {
    ...(etapa && { etapa }),
    ...(tipo && { tipo }),
    ...(t && {
      OR: [
        { denominacion: { contains: t, mode: "insensitive" as const } },
        { numeroExpediente: { contains: t, mode: "insensitive" as const } },
        { numeroRegistro: { contains: t, mode: "insensitive" as const } },
        { cliente: { nombre: { contains: t, mode: "insensitive" as const } } },
      ],
    }),
  };
  const [total, items, conteo] = await Promise.all([
    db.expediente.count({ where }),
    db.expediente.findMany({
      where,
      include: { cliente: { select: { id: true, nombre: true } } },
      orderBy: [{ actualizado: "desc" }, { numeroExpediente: "desc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    db.expediente.groupBy({ by: ["etapa"], _count: true }),
  ]);
  const porEtapa = Object.fromEntries(conteo.map((c) => [c.etapa, c._count]));
  const paginas = Math.ceil(total / POR_PAGINA);
  const url = (cambios: Record<string, string>) => {
    const s = new URLSearchParams({ q, etapa, tipo, p: String(pagina), ...cambios });
    for (const [k, v] of [...s.entries()]) if (!v || (k === "p" && v === "1")) s.delete(k);
    return `/expedientes${s.size ? `?${s}` : ""}`;
  };

  return (
    <>
      <Encabezado titulo="Clientes y marcas" subtitulo={`${total.toLocaleString("es-MX")} marcas · da clic en una para abrir el perfil del cliente`}>
        <VistaClientesMarcas activa="marcas" />
        <ActualizarTodas barrido={await estadoBarrido()} />
      </Encabezado>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        <Link href={url({ etapa: "", p: "1" })} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${!etapa ? "bg-carbon text-white" : "bg-white text-neutral-600 ring-1 ring-black/10"}`}>Todas</Link>
        {Object.entries(ETAPAS).map(([k, v]) => (
          <Link key={k} href={url({ etapa: k, p: "1" })} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${etapa === k ? "bg-carbon text-white" : "bg-white text-neutral-600 ring-1 ring-black/10"}`}>
            {v} <span className="opacity-50">{porEtapa[k] ?? 0}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por marca, cliente, expediente o registro" className="input max-w-md" />
        <select name="tipo" defaultValue={tipo} className="input w-auto">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_EXPEDIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {etapa && <input type="hidden" name="etapa" value={etapa} />}
        <button className="btn">Buscar</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-black/5 bg-neutral-50/60">
            <tr><th className="th">Marca</th><th className="th">Cliente</th><th className="th">Expediente</th><th className="th">Etapa</th><th className="th">Última actualización IMPI</th></tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {items.map((e) => (
              <tr key={e.id} className="hover:bg-neutral-50">
                <td className="td">
                  <Link href={`/clientes/${e.cliente.id}?marca=${e.id}`} className="font-medium hover:underline">{e.denominacion}</Link>
                  {e.tipo !== "MARCA" && <span className="ml-1.5 text-xs text-neutral-400">{TIPOS_EXPEDIENTE[e.tipo]}</span>}
                </td>
                <td className="td"><Link href={`/clientes/${e.cliente.id}`} className="text-neutral-600 hover:underline">{e.cliente.nombre}</Link></td>
                <td className="td whitespace-nowrap text-neutral-600">
                  {e.numeroExpediente ?? <span className="text-neutral-300">s/n</span>}
                  {e.numeroRegistro && <span className="block text-xs text-neutral-400">Reg. {e.numeroRegistro}</span>}
                </td>
                <td className="td"><Etapa etapa={e.etapa} desistio={e.desistio} /></td>
                <td className="td max-w-[280px] text-xs">
                  {e.ultimaActImpi && e.ultimaActImpiFecha ? (
                    <>
                      <span className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${e.ultimaActImpiDe === "IMPI" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
                        {e.ultimaActImpiDe === "IMPI" ? "IMPI contestó" : "Ingresado"}
                      </span>
                      <span className="text-neutral-500">{fmtFecha(e.ultimaActImpiFecha)}</span>
                      <span className="block truncate text-neutral-600" title={e.ultimaActImpi}>{e.ultimaActImpi}</span>
                    </>
                  ) : (
                    <span className="block truncate text-neutral-400">{e.ultimoEstatus ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Vacio>No hay marcas con esos filtros.</Vacio>}
      </div>

      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-500">Página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            {pagina > 1 && <Link href={url({ p: String(pagina - 1) })} className="btn">← Anterior</Link>}
            {pagina < paginas && <Link href={url({ p: String(pagina + 1) })} className="btn">Siguiente →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
