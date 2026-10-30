import { db } from "@/lib/db";
import { requerirSesion } from "@/lib/auth";
import { Encabezado } from "@/components/ui";
import { NotaPersonal, NuevaNota } from "./nota";

export const metadata = { title: "Mis notas" };

export default async function Notas() {
  const s = await requerirSesion();
  const notas = await db.recordatorio.findMany({ where: { usuarioId: s.id }, orderBy: [{ hecho: "asc" }, { recordarEn: { sort: "asc", nulls: "last" } }, { creado: "desc" }] });
  const ahora = new Date();
  const tocan = notas.filter((n) => !n.hecho && n.recordarEn && n.recordarEn <= ahora);
  const proximas = notas.filter((n) => !n.hecho && !(n.recordarEn && n.recordarEn <= ahora));
  const hechas = notas.filter((n) => n.hecho).slice(0, 30);
  const datos = (n: (typeof notas)[number]) => ({ id: n.id, texto: n.texto, recordarEn: n.recordarEn?.toISOString() ?? null, hecho: n.hecho, creado: n.creado.toISOString() });

  return (
    <>
      <Encabezado titulo="Mis notas" subtitulo="Tu bloc personal: anota lo que te piden y ponle día y hora para que la app te lo recuerde. Solo tú lo ves." />
      <section className="card mb-6 p-5">
        <NuevaNota />
      </section>

      {tocan.length > 0 && (
        <Grupo titulo="Ya toca" cls="text-amber-700">
          {tocan.map((n) => <NotaPersonal key={n.id} n={datos(n)} />)}
        </Grupo>
      )}
      <Grupo titulo="Pendientes">
        {proximas.length ? proximas.map((n) => <NotaPersonal key={n.id} n={datos(n)} />) : <p className="px-1 text-sm text-neutral-400">Nada pendiente.</p>}
      </Grupo>
      {hechas.length > 0 && (
        <Grupo titulo="Hechas" cls="text-neutral-400">
          {hechas.map((n) => <NotaPersonal key={n.id} n={datos(n)} />)}
        </Grupo>
      )}
    </>
  );
}

function Grupo({ titulo, cls = "text-neutral-500", children }: { titulo: string; cls?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className={`mb-2 px-1 text-xs font-semibold uppercase tracking-wide ${cls}`}>{titulo}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
