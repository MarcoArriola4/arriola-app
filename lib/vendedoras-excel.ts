// Lectura del Excel de contactos que el gerente sube para una vendedora.
import ExcelJS from "exceljs";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
// Encabezados del Excel → campo del contacto
export const COLUMNAS: [RegExp, "nombre" | "marca" | "expediente" | "telefono" | "email" | "estatus" | "observaciones"][] = [
  [/^(cliente|nombre|contacto)/, "nombre"],
  [/^marca/, "marca"],
  [/^(expediente|exp\b|no\.? de expediente)/, "expediente"],
  [/^(telefono|tel\b|celular|whatsapp)/, "telefono"],
  [/^(correo|email|e-mail|mail)/, "email"],
  [/^(estatus|status|estado)/, "estatus"],
  [/^(observaciones|observacion|notas?|comentarios?)/, "observaciones"],
];

export type ContactoExcel = { nombre: string; telefono: string; marca: string | null; expediente: string | null; email: string | null; estatus: string | null; observaciones: string | null };

/** Columnas: Cliente, Marca, Expediente, Teléfono, Correo, Estatus (y Observaciones). Encabezados en las primeras 10 filas. */
export async function leerExcelContactos(datos: ArrayBuffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new Error("No pude leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.");
  }
  const hoja = libro.worksheets[0];
  if (!hoja) throw new Error("El Excel no tiene hojas");
  const texto = (v: ExcelJS.CellValue): string => {
    if (v == null) return "";
    if (typeof v === "object") {
      if ("text" in v && v.text != null) return String(typeof v.text === "object" ? (v.text as { richText?: { text: string }[] }).richText?.map((r) => r.text).join("") ?? "" : v.text);
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
      if ("result" in v) return String(v.result ?? "");
      if (v instanceof Date) return v.toLocaleDateString("es-MX");
    }
    return String(v);
  };

  // Fila de encabezados y qué columna es cada dato
  let filaEnc = 0;
  let mapa = new Map<number, (typeof COLUMNAS)[number][1]>();
  for (let r = 1; r <= Math.min(10, hoja.rowCount) && !filaEnc; r++) {
    const m = new Map<number, (typeof COLUMNAS)[number][1]>();
    hoja.getRow(r).eachCell((c, col) => {
      const t = sinAcentos(texto(c.value));
      const campo = COLUMNAS.find(([re]) => re.test(t))?.[1];
      if (campo && ![...m.values()].includes(campo)) m.set(col, campo);
    });
    if ([...m.values()].includes("telefono") && [...m.values()].includes("nombre")) { filaEnc = r; mapa = m; }
  }
  if (!filaEnc) throw new Error("No encontré los encabezados. La primera fila debe decir: Cliente, Marca, Expediente, Teléfono, Correo, Estatus");

  const contactos: ContactoExcel[] = [];
  let sinTelefono = 0;
  for (let r = filaEnc + 1; r <= hoja.rowCount; r++) {
    const fila = hoja.getRow(r);
    const d: Record<string, string> = {};
    for (const [col, campo] of mapa) d[campo] = texto(fila.getCell(col).value).replace(/\s+/g, " ").trim();
    if (!Object.values(d).some(Boolean)) continue; // fila vacía
    if ((d.telefono ?? "").replace(/\D/g, "").length < 8) { sinTelefono++; continue; }
    contactos.push({
      nombre: d.nombre || "Sin nombre", telefono: d.telefono,
      marca: d.marca || null, expediente: d.expediente || null, email: d.email || null, estatus: d.estatus || null, observaciones: d.observaciones || null,
    });
  }
  return { contactos, sinTelefono };
}
