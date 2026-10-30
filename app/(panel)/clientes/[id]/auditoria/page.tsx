import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, SearchCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { crearAuditoria } from "@/app/actions";
import { claveNombre } from "@/lib/marcanet/busqueda-nombre";
import { Encabezado } from "@/components/ui";

export const metadata = { title: "Reporte 2" };

const ESTADO: Record<string, string> = { PENDIENTE: "En espera", BUSCANDO: "Buscando…", DETENIDA: "Detenida", LISTA: "Lista", ERROR: "Con error" };

export default async function NuevaAuditoria({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams, requerirAdmin()]);
  const c = await db.cliente.findUnique({ where: { id }, include: { expedientes: { select: { titular: true } } } });
  if (!c) notFound();
  const previas = await db.auditoria.findMany({ where: { clienteId: id }, orderBy: { creado: "desc" }, take: 10 });

  // Nombres sugeridos: el cliente y cada titular / razón social con que tiene marcas
  const vistos = new Set<string>();
  const sugeridos: string[] = [];
  for (const t of [c.nombre, ...c.expedientes.flatMap((e) => (e.titular ?? "").split("/"))]) {
    const n = t.replace(/\s+/g, " ").trim();
    if (n.length < 4 || /^cliente de|^cont\.|^hijo/i.test(n)) continue;
    const k = claveNombre(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    sugeridos.push(n);
  }

  return (
    <>
      <Link href={`/clientes/${c.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> {c.nombre}</Link>
      <Encabezado titulo="Reporte 2" subtitulo="Busca en MARCanet todas las marcas de cada nombre, como titular y como apoderado, y arma un reporte con el estatus actual de cada una. No agrega nada a la app." />
      {error === "nombres" && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">Elige o escribe al menos un nombre.</p>}

      <form action={crearAuditoria} className="card mb-6 max-w-3xl space-y-4 p-5">
        <input type="hidden" name="clienteId" value={c.id} />
        <fieldset>
          <legend className="label">Titulares (cada uno se busca como titular y como apoderado)</legend>
          <div className="space-y-1.5">
            {sugeridos.map((n) => (
              <label key={n} className="flex items-center gap-2 rounded-lg border border-black/[0.07] px-3 py-2 text-sm">
                <input type="checkbox" name="nombres" value={n} defaultChecked className="accent-marca-oscuro" /> {n}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="label">Apoderados u otros nombres (uno por renglón · también se buscan como titular y como apoderado)</span>
          <textarea name="otros" rows={3} placeholder={"Ej. JUAN PÉREZ LÓPEZ\nEMPRESA EJEMPLO, S.A. DE C.V."} className="input" />
        </label>
        <p className="text-xs text-neutral-500">
          Escribe el nombre lo más completo posible. Si MARCanet no lo encuentra tal cual, se prueba sin «S.A. de C.V.», sin puntuación, sin acentos y por apellidos.
          Se toman los nombres iguales (sin importar acentos, comas o tipo de sociedad) y, si no hay ninguno idéntico, los que solo difieren en un apellido o son cotitulares (se marcan en el reporte). Los parecidos se listan aparte.
          Corre sola en segundo plano: empieza en unos minutos y tarda según cuántas marcas tenga (aprox. 1–2 min por nombre y ~20 s por marca). Puedes cerrar la app.
        </p>
        <button className="btn-primario"><SearchCheck size={15} /> Hacer Reporte 2</button>
      </form>

      {previas.length > 0 && (
        <section className="card max-w-3xl">
          <h2 className="border-b border-black/5 px-5 py-3 text-sm font-semibold">Reportes 2 anteriores</h2>
          <ul className="divide-y divide-black/5">
            {previas.map((a) => (
              <li key={a.id}>
                <Link href={`/auditorias/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-neutral-50">
                  <span className="min-w-0 truncate">{(JSON.parse(a.nombres) as string[]).join(" · ")}</span>
                  <span className="text-xs text-neutral-500">{a.creado.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} · {ESTADO[a.estado] ?? a.estado}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
