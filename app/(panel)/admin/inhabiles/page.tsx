import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { cargarInhabiles } from "@/lib/inhabiles";
import { agregarDiaInhabil, eliminarDiaInhabil } from "@/app/actions";
import { Encabezado } from "@/components/ui";

export const metadata = { title: "Días inhábiles" };

export default async function Inhabiles({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await requerirAdmin();
  const { ok } = await searchParams;
  await cargarInhabiles();
  const dias = await db.diaInhabil.findMany({ orderBy: { fecha: "desc" } });
  const porAnio = dias.reduce<Record<string, typeof dias>>((a, d) => {
    const y = String(d.fecha.getUTCFullYear());
    (a[y] ??= []).push(d);
    return a;
  }, {});
  const ultimo = dias[0]?.fecha;

  return (
    <>
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-black"><ChevronLeft size={15} /> Admin</Link>
      <Encabezado
        titulo="Días inhábiles del IMPI"
        subtitulo="Se descuentan de los plazos en días hábiles (5 y 15 días) y recorren al siguiente día hábil los plazos en meses. Sábados y domingos ya se descuentan solos."
      />
      {ok && <p className="mb-4 rounded-lg bg-marca-claro px-4 py-2.5 text-sm text-marca-oscuro">Calendario actualizado. Se recalcularon {ok} plazos.</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {Object.entries(porAnio).sort((a, b) => Number(b[0]) - Number(a[0])).map(([anio, lista]) => (
            <section key={anio} className="card">
              <h2 className="border-b border-black/5 px-4 py-3 text-sm font-semibold">{anio} <span className="font-normal text-neutral-400">· {lista.length} días</span></h2>
              <ul className="divide-y divide-black/5">
                {lista.map((d) => (
                  <li key={d.fecha.toISOString()} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-28 shrink-0 font-medium first-letter:uppercase">{d.fecha.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}</span>
                    <span className="min-w-0 flex-1">
                      {d.motivo}
                      {d.fuente && <span className="block text-xs text-neutral-400">{d.fuente}</span>}
                    </span>
                    <form action={eliminarDiaInhabil}>
                      <input type="hidden" name="fecha" value={d.fecha.toISOString().slice(0, 10)} />
                      <button title="Quitar" className="rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-1 text-sm font-semibold">Agregar día inhábil</h2>
            <p className="mb-4 text-xs text-neutral-500">Cuando el IMPI publique en el DOF un acuerdo nuevo (calendario anual o suspensión de plazos), agrégalo aquí. Los plazos se recalculan solos.</p>
            <form action={agregarDiaInhabil} className="space-y-3">
              <label className="block"><span className="label">Fecha</span><input type="date" name="fecha" required className="input" /></label>
              <label className="block"><span className="label">Motivo</span><input name="motivo" required placeholder="Suspensión de plazos por fuerza mayor" className="input" /></label>
              <label className="block"><span className="label">Fuente</span><input name="fuente" placeholder="DOF 09/10/2026" className="input" /></label>
              <button className="btn-primario">Agregar y recalcular</button>
            </form>
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-medium">Revisa el DOF</p>
            <p className="mt-1 text-amber-800/80">
              El último día registrado es el {ultimo?.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.
              El IMPI suele publicar en octubre o noviembre el calendario de diciembre y del año siguiente.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
