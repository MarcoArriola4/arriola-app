import { FileDown, KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { Encabezado } from "@/components/ui";

export const metadata = { title: "Exportar Excel" };

export default async function Exportar() {
  await requerirAdmin();
  const [cobros, marcas, sinCobro] = await Promise.all([
    db.servicio.count(),
    db.expediente.count(),
    db.expediente.count({ where: { servicios: { none: {} } } }),
  ]);
  return (
    <>
      <Encabezado titulo="Exportar a Excel" subtitulo="Descarga la pestaña «Pagos» con todo lo que hay en la app, en el mismo formato del Excel que usas." />
      <section className="card max-w-3xl p-6">
        <p className="text-sm text-neutral-600">
          Sale igual que tu Excel: encabezados en la fila 5, datos desde la fila 6, columnas A–Z (Nombre, Marca, ID, Teléfono, Fecha de pago,
          Trabajado, Costo, Pago, Banco, quién vendió con un 1 en su columna y «¿Qué contestó la autoridad?») y los mismos colores:
          <span className="mx-1 rounded bg-[#00FF00] px-1">verde</span> trabajado o pagado,
          <span className="mx-1 rounded bg-[#FF66FF] px-1">morado</span> por trabajar,
          <span className="mx-1 rounded bg-[#FFFF00] px-1">amarillo</span> pagar en sistema,
          <span className="mx-1 rounded bg-[#00FFFF] px-1">azul</span> lo sube el cliente y
          <span className="mx-1 rounded bg-[#FF0000] px-1 text-white">rojo</span> pendiente de pago o con problema.
        </p>
        <p className="mt-3 text-sm text-neutral-600">
          Incluye {cobros.toLocaleString("es-MX")} cobros de {marcas.toLocaleString("es-MX")} marcas
          {sinCobro > 0 && ` (${sinCobro.toLocaleString("es-MX")} marcas sin cobro van en una fila sin pago, para no perder ninguna)`}. Lo que diste de alta en la app
          se acomoda por fecha entre las filas del Excel. Puedes seguir usando este archivo como tu Excel actual y volver a importarlo.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/api/exportar" className="btn-primario"><FileDown size={16} /> Descargar Excel</a>
          <a href="/api/exportar?claves=1" className="btn"><KeyRound size={15} /> Descargar con contraseñas del IMPI</a>
        </div>
        <p className="mt-3 text-xs text-neutral-400">El archivo con contraseñas guárdalo solo en tu computadora; no lo compartas.</p>
      </section>
    </>
  );
}
