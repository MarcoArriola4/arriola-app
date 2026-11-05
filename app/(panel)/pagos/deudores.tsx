import Link from "next/link";
import { db } from "@/lib/db";
import { SEGUIMIENTOS_DEUDA, TIPOS_SERVICIO, fmtFecha, mxn } from "@/lib/catalogos";
import { EstadoPago, Metrica, Vacio } from "@/components/ui";
import { FilaDeudor, type Deudor } from "@/components/seguimiento-deuda";
import { Abono } from "@/components/ficha";

const FILTROS: { id: string; txt: string }[] = [
  { id: "activos", txt: "Por cobrar" },
  { id: "SIN", txt: "Sin seguimiento" },
  ...Object.entries(SEGUIMIENTOS_DEUDA).map(([id, v]) => ({ id, txt: v.txt })),
  { id: "todos", txt: "Todos" },
];

/**
 * "Te deben": todos los clientes con saldo, agrupados, con su seguimiento (va a pagar, dejó de contestar, ya no quiere,
 * ya no se cobrará) y una nota. Los que se apartan (no activos) ya no cuentan en "Te deben" de Inicio.
 */
export async function Deudores({ filtro = "activos", cobros }: { filtro?: string; cobros: boolean }) {
  const servicios = await db.servicio.findMany({
    where: { estadoPago: { in: ["PENDIENTE", "PARCIAL"] }, costo: { gt: 0 } },
    include: { expediente: { select: { id: true, denominacion: true, clienteId: true, cliente: { select: { nombre: true, seguimiento: true, seguimientoNota: true, seguimientoFecha: true, seguimientoAutor: true } } } } },
    orderBy: { fechaContratacion: "asc" },
  });

  type Grupo = Deudor & { desde: Date | null; servicios: typeof servicios };
  const grupos = new Map<string, Grupo>();
  for (const s of servicios) {
    const saldo = Math.max(0, (s.costo ?? 0) - s.pagado);
    if (saldo <= 0) continue;
    const cl = s.expediente.cliente;
    const g = grupos.get(s.expediente.clienteId) ?? {
      id: s.expediente.clienteId, nombre: cl.nombre, debe: 0, desde: null, servicios: [],
      seguimiento: cl.seguimiento, nota: cl.seguimientoNota, fecha: cl.seguimientoFecha?.toISOString() ?? null, autor: cl.seguimientoAutor,
    };
    g.debe += saldo;
    g.servicios.push(s);
    const f = s.fechaContratacion ?? s.creado;
    if (!g.desde || f < g.desde) g.desde = f;
    grupos.set(g.id, g);
  }
  const todos = [...grupos.values()];
  const activo = (g: Grupo) => !g.seguimiento || SEGUIMIENTOS_DEUDA[g.seguimiento]?.activo !== false;
  const coincide = (g: Grupo) =>
    filtro === "todos" ? true : filtro === "activos" ? activo(g) : filtro === "SIN" ? !g.seguimiento : g.seguimiento === filtro;
  const lista = todos.filter(coincide).sort((a, b) => Number(b.seguimiento === "VA_A_PAGAR") - Number(a.seguimiento === "VA_A_PAGAR") || b.debe - a.debe);
  const suma = (l: Grupo[]) => l.reduce((a, g) => a + g.debe, 0);
  const activos = todos.filter(activo);
  const apartados = todos.filter((g) => !activo(g));
  const hace12 = new Date(Date.now() - 365 * 864e5);
  const viejos = activos.filter((g) => g.desde && g.desde < hace12);
  const cuenta = (id: string) => todos.filter((g) => (id === "todos" ? true : id === "activos" ? activo(g) : id === "SIN" ? !g.seguimiento : g.seguimiento === id)).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica label="Por cobrar (activos)" valor={mxn.format(suma(activos))} tono={activos.length ? "rojo" : undefined} nota={`${activos.length} clientes`} />
        <Metrica label="De hace más de un año" valor={mxn.format(suma(viejos))} nota={`${viejos.length} clientes · decide si aún se cobran`} />
        <Metrica label="Apartados" valor={mxn.format(suma(apartados))} nota={`${apartados.length} clientes · dejaron de contestar, ya no quieren o ya no se cobrará`} />
        <Metrica label="Total con saldo" valor={mxn.format(suma(todos))} nota={`${todos.length} clientes`} />
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        Usa <b>¿Qué pasó?</b> en cada cliente: «Va a pagar» lo deja arriba; «Dejó de contestar», «Ya no quiere» o «Ya no se cobrará» lo apartan y deja de contar en «Te deben» de Inicio (la deuda no se borra; puedes regresarlo cuando quieras).
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link key={f.id} href={`/pagos?estado=pendientes&seg=${f.id}`} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${filtro === f.id ? "bg-carbon text-white ring-carbon" : "bg-white text-neutral-600 ring-black/10 hover:bg-neutral-50"}`}>
            {f.txt} <span className="opacity-60">{cuenta(f.id)}</span>
          </Link>
        ))}
      </div>

      {lista.length === 0 ? <div className="card"><Vacio>Ningún cliente en este grupo.</Vacio></div> : (
        <ul className="space-y-2">
          {lista.map((g) => (
            <li key={g.id} className="card overflow-hidden">
              <FilaDeudor d={{ id: g.id, nombre: g.nombre, debe: g.debe, seguimiento: g.seguimiento, nota: g.nota, fecha: g.fecha, autor: g.autor }} />
              <details className="border-t border-black/5">
                <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500 hover:text-black">
                  {g.servicios.length} {g.servicios.length === 1 ? "servicio" : "servicios"} con saldo · debe desde {fmtFecha(g.desde)}
                </summary>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <tbody className="divide-y divide-black/5">
                      {g.servicios.map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-2">
                            <Link href={`/clientes/${g.id}?marca=${s.expediente.id}`} className="font-medium hover:underline">{s.expediente.denominacion}</Link>
                            <span className="block text-neutral-500">{TIPOS_SERVICIO[s.tipo] ?? s.tipo} · {fmtFecha(s.fechaContratacion)}</span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">Pagado {mxn.format(s.pagado)} de {mxn.format(s.costo ?? 0)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-medium text-red-600">Debe {mxn.format((s.costo ?? 0) - s.pagado)}</td>
                          <td className="px-3 py-2"><EstadoPago estado={s.estadoPago} /></td>
                          <td className="px-4 py-2 text-right">{cobros && <Abono servicioId={s.id} restante={(s.costo ?? 0) - s.pagado} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
