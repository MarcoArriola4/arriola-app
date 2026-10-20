// Días inhábiles del IMPI publicados en el Diario Oficial de la Federación.
// Se cargan a la base de datos la primera vez; después se administran desde Admin → Días inhábiles.

type Dia = { fecha: string; motivo: string; fuente: string };

const DOF_2025 = "DOF 04/12/2024 · Acuerdo días inhábiles dic 2024 y 2025";
const DOF_2026 = "DOF 14/10/2025 · Acuerdo días inhábiles dic 2025 y 2026";

function rango(desde: string, hasta: string, motivo: string, fuente: string): Dia[] {
  const out: Dia[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (d <= fin) {
    out.push({ fecha: d.toISOString().slice(0, 10), motivo, fuente });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const INHABILES_OFICIALES: Dia[] = [
  // Diciembre 2024 – 2025
  ...rango("2024-12-19", "2025-01-03", "Periodo vacacional de fin de año", DOF_2025),
  { fecha: "2025-02-03", motivo: "Día de la Constitución", fuente: DOF_2025 },
  { fecha: "2025-03-17", motivo: "Natalicio de Benito Juárez", fuente: DOF_2025 },
  { fecha: "2025-04-17", motivo: "Jueves Santo", fuente: DOF_2025 },
  { fecha: "2025-04-18", motivo: "Viernes Santo", fuente: DOF_2025 },
  { fecha: "2025-05-01", motivo: "Día del Trabajo", fuente: DOF_2025 },
  { fecha: "2025-05-05", motivo: "Batalla de Puebla", fuente: DOF_2025 },
  { fecha: "2025-09-01", motivo: "Informe presidencial", fuente: DOF_2025 },
  { fecha: "2025-09-16", motivo: "Día de la Independencia", fuente: DOF_2025 },
  { fecha: "2025-11-17", motivo: "Revolución Mexicana", fuente: DOF_2025 },
  { fecha: "2025-12-12", motivo: "Día de la Virgen de Guadalupe", fuente: DOF_2025 },
  // Diciembre 2025 – 2026
  ...rango("2025-12-22", "2026-01-06", "Periodo vacacional de fin de año", DOF_2026),
  { fecha: "2026-02-02", motivo: "Día de la Constitución", fuente: DOF_2026 },
  { fecha: "2026-03-16", motivo: "Natalicio de Benito Juárez", fuente: DOF_2026 },
  { fecha: "2026-04-02", motivo: "Jueves Santo", fuente: DOF_2026 },
  { fecha: "2026-04-03", motivo: "Viernes Santo", fuente: DOF_2026 },
  { fecha: "2026-05-01", motivo: "Día del Trabajo", fuente: DOF_2026 },
  { fecha: "2026-05-05", motivo: "Batalla de Puebla", fuente: DOF_2026 },
  { fecha: "2026-09-01", motivo: "Informe presidencial", fuente: DOF_2026 },
  { fecha: "2026-09-16", motivo: "Día de la Independencia", fuente: DOF_2026 },
  { fecha: "2026-11-02", motivo: "Día de Muertos", fuente: DOF_2026 },
  { fecha: "2026-11-16", motivo: "Revolución Mexicana", fuente: DOF_2026 },
  // Suspensiones extraordinarias 2026
  { fecha: "2026-02-23", motivo: "Suspensión de plazos por fuerza mayor (fallas de conectividad)", fuente: "DOF 27/02/2026" },
  { fecha: "2026-05-18", motivo: "Suspensión de plazos por fuerza mayor (intermitencias)", fuente: "DOF 26/05/2026" },
  { fecha: "2026-06-11", motivo: "Suspensión de labores y plazos (afectaciones extraordinarias)", fuente: "DOF 10/06/2026" },
  { fecha: "2026-06-30", motivo: "Suspensión de labores; no corren plazos", fuente: "DOF 07/07/2026" },
  { fecha: "2026-09-29", motivo: "Suspensión de plazos por fuerza mayor", fuente: "DOF 09/10/2026" },
];
