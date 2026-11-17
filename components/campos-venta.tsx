"use client";
// Campos de una venta: los llena la vendedora al reportarla y el administrador los revisa antes de aprobar.

export type DatosVenta = {
  clienteNombre: string; telefono: string; email: string; servicio: string; denominacion: string; numeroExpediente: string;
  pagado: string; debe: string; fechaCobro: string; banco: string; notas: string;
};

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
export const SERVICIOS: Record<string, string> = {
  MARCA: "Registro de marca", CONTESTACION: "Contestación de oficio", DDU: "Declaración de uso", RENOVACION: "Renovación", TITULO: "Título de concesión", OTRO: "Otro",
};

/** Campos de una venta (los usan la vendedora al reportarla y el administrador al revisarla). */
export function CamposVenta({ d, set }: { d: DatosVenta; set: (d: DatosVenta) => void }) {
  const campo = (k: keyof DatosVenta, t: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label className="block">
      <span className="label">{t}</span>
      <input value={d[k]} onChange={(e) => set({ ...d, [k]: e.target.value })} className="input min-h-10" {...extra} />
    </label>
  );
  const total = (Number(d.pagado.replace(/[$,\s]/g, "")) || 0) + (Number(d.debe.replace(/[$,\s]/g, "")) || 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("clienteNombre", "Cliente (nombre completo)", { required: true })}
        <label className="block">
          <span className="label">¿Qué se le vendió?</span>
          <select value={d.servicio} onChange={(e) => set({ ...d, servicio: e.target.value })} className="input min-h-10">
            {Object.entries(SERVICIOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        {campo("telefono", "Teléfono", { inputMode: "tel" })}
        {campo("email", "Correo", { type: "email" })}
        {campo("denominacion", "Marca")}
        {campo("numeroExpediente", "Expediente (si ya tiene)", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {campo("pagado", "¿Cuánto pagó? $", { inputMode: "decimal", placeholder: "0" })}
        {campo("debe", "¿Cuánto debe? $", { inputMode: "decimal", placeholder: "0" })}
        {campo("fechaCobro", "Fecha del cobro", { type: "date", required: true })}
      </div>
      <p className="cifra -mt-1 text-xs text-neutral-500">Total de la venta: <b className="text-carbon">{mxn(total)}</b></p>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("banco", "¿A dónde pagó? (cuenta, transferencia, efectivo…)")}
        {campo("notas", "Notas")}
      </div>
    </div>
  );
}

export const aFormData = (d: DatosVenta) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(d)) f.set(k, v);
  return f;
};

