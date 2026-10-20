import Link from "next/link";
import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/catalogos";
import { Encabezado, Vacio, VistaClientesMarcas } from "@/components/ui";
import { ActualizarTodas } from "@/components/actualizar-todas";

export const metadata = { title: "Clientes" };
export const maxDuration = 60;
const POR_PAGINA = 50;

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const { q = "", p = "1" } = await searchParams;
  const pagina = Math.max(1, Number(p) || 1);
  const t = q.trim();
  const where = t
    ? { OR: [{ nombreNorm: { contains: normalizarNombre(t), mode: "insensitive" as const } }, { telefono: { contains: t, mode: "insensitive" as const } }, { email: { contains: t.toLowerCase(), mode: "insensitive" as const } }, { expedientes: { some: { denominacion: { contains: t, mode: "insensitive" as const } } } }] }
    : {};
  const [total, clientes] = await Promise.all([
    db.cliente.count({ where }),
    db.cliente.findMany({
      where,
      include: { expedientes: { select: { etapa: true } } },
      orderBy: { nombre: "asc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
  ]);
  const paginas = Math.ceil(total / POR_PAGINA);
  const url = (n: number) => `/clientes?${new URLSearchParams({ ...(q && { q }), p: String(n) })}`;

  return (
    <>
      <Encabezado titulo="Clientes y marcas" subtitulo={`${total.toLocaleString("es-MX")} clientes · también puedes usar el buscador de arriba`}>
        <VistaClientesMarcas activa="clientes" />
        <ActualizarTodas />
      </Encabezado>
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, teléfono, correo o marca" className="input max-w-md" />
        <button className="btn">Buscar</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-black/5 bg-neutral-50/60"><tr><th className="th">Cliente</th><th className="th">Teléfono</th><th className="th">Correo</th><th className="th text-right">Marcas</th><th className="th text-right">Concedidas</th></tr></thead>
          <tbody className="divide-y divide-black/5">
            {clientes.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="td"><Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.nombre}</Link></td>
                <td className="td whitespace-nowrap text-neutral-600">{c.telefono ?? "—"}</td>
                <td className="td max-w-[220px] truncate text-neutral-600">{c.email ?? "—"}</td>
                <td className="td text-right">{c.expedientes.length}</td>
                <td className="td text-right text-marca-oscuro">{c.expedientes.filter((e) => e.etapa === "CONCEDIDA").length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {clientes.length === 0 && <Vacio>No se encontraron clientes.</Vacio>}
      </div>
      {paginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-neutral-500">Página {pagina} de {paginas}</span>
          <div className="flex gap-2">
            {pagina > 1 && <Link href={url(pagina - 1)} className="btn">← Anterior</Link>}
            {pagina < paginas && <Link href={url(pagina + 1)} className="btn">Siguiente →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
