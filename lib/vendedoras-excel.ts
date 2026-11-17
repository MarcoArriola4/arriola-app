// Lectura de los contactos que el gerente asigna a una vendedora: Excel (.xlsx) o texto pegado.
// Columnas: Cliente, Marca, Expediente, Teléfono, Correo, Estatus (y Observaciones, opcional).
import ExcelJS from "exceljs";

type Campo = "nombre" | "marca" | "expediente" | "telefono" | "email" | "estatus" | "observaciones";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Encabezados → campo del contacto
export const COLUMNAS: [RegExp, Campo][] = [
  [/^(cliente|nombre|contacto|titular)/, "nombre"],
  [/^(marca|denominacion)/, "marca"],
  [/^(expediente|exp\b|no\.? de expediente|num(ero)? de expediente)/, "expediente"],
  [/^(telefono|tel\b|celular|cel\b|whatsapp|movil)/, "telefono"],
  [/^(correo|email|e-mail|mail)/, "email"],
  [/^(estatus|status|estado|situacion)/, "estatus"],
  [/^(observaciones|observacion|notas?|comentarios?)/, "observaciones"],
];
// Orden de las columnas del Excel del gerente (para pegar filas sin encabezados)
const ORDEN: Campo[] = ["nombre", "marca", "expediente", "telefono", "email", "estatus", "observaciones"];

export type ContactoExcel = { nombre: string; telefono: string; marca: string | null; expediente: string | null; email: string | null; estatus: string | null; observaciones: string | null };
export type Lectura = { contactos: ContactoExcel[]; sinTelefono: number; descartados: number };

const limpio = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const esCorreo = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());
const digitos = (s: string) => s.replace(/\D/g, "").length;
// Teléfono: 10 dígitos o más, escrito solo con números, espacios, guiones, paréntesis o +
const esTelefono = (s: string) => digitos(s) >= 10 && /^[\d\s()+.-]+$/.test(s.trim());
// Expediente del IMPI: número de 5 a 8 dígitos
const esExpediente = (s: string) => /^\d{5,8}$/.test(s.trim());

/** Arma el contacto: necesita al menos nombre o teléfono; si no trae teléfono se agrega igual (se cuenta para avisar). */
function armar(d: Partial<Record<Campo, string>>): ContactoExcel | null {
  const c = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, limpio(v)])) as Partial<Record<Campo, string>>;
  if (!c.nombre && !c.telefono && !c.email) return null;
  return {
    nombre: c.nombre || "Sin nombre", telefono: c.telefono ?? "",
    marca: c.marca || null, expediente: c.expediente || null, email: c.email || null, estatus: c.estatus || null, observaciones: c.observaciones || null,
  };
}

function resumen(lista: (ContactoExcel | null)[]): Lectura {
  const contactos = lista.filter((c): c is ContactoExcel => !!c);
  return { contactos, sinTelefono: contactos.filter((c) => digitos(c.telefono) < 8).length, descartados: lista.length - contactos.length };
}

/** Reconoce los encabezados de una fila (devuelve columna → campo) o null si no lo parece. */
function encabezados(celdas: string[]) {
  const m = new Map<number, Campo>();
  celdas.forEach((t, i) => {
    const campo = COLUMNAS.find(([re]) => re.test(sinAcentos(t)))?.[1];
    if (campo && ![...m.values()].includes(campo)) m.set(i, campo);
  });
  return [...m.values()].includes("nombre") && m.size >= 2 ? m : null;
}

/** Datos sueltos de un contacto (sin columnas): se reconoce cada uno por su forma. */
function porForma(datos: string[]): Partial<Record<Campo, string>> {
  const d: Partial<Record<Campo, string>> = {};
  const textos: string[] = [];
  for (const x of datos.map(limpio).filter(Boolean)) {
    if (!d.email && esCorreo(x)) d.email = x;
    else if (!d.telefono && esTelefono(x)) d.telefono = x;
    else if (!d.expediente && esExpediente(x)) d.expediente = x;
    else textos.push(x);
  }
  // En el orden del Excel: Cliente, Marca, Estatus; lo demás va a observaciones
  [d.nombre, d.marca, d.estatus] = [textos[0], textos[1], textos[2]];
  if (textos.length > 3) d.observaciones = textos.slice(3).join(" · ");
  return d;
}

/** Excel (.xlsx). La fila de encabezados puede estar en cualquiera de las primeras 10 filas. */
export async function leerExcelContactos(datos: ArrayBuffer): Promise<Lectura> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(datos);
  } catch {
    throw new Error("No pude leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.");
  }
  const hoja = libro.worksheets.find((h) => h.rowCount > 0);
  if (!hoja) throw new Error("El Excel está vacío");
  const texto = (v: ExcelJS.CellValue): string => {
    if (v == null) return "";
    if (v instanceof Date) return v.toLocaleDateString("es-MX", { timeZone: "UTC" });
    if (typeof v === "object") {
      if ("richText" in v) return v.richText.map((r) => r.text).join("");
      if ("text" in v && v.text != null) return typeof v.text === "string" ? v.text : (v.text as { richText?: { text: string }[] }).richText?.map((r) => r.text).join("") ?? "";
      if ("result" in v) return String(v.result ?? "");
      if ("error" in v) return "";
    }
    return String(v);
  };
  const fila = (r: number) => {
    const row = hoja.getRow(r);
    return Array.from({ length: Math.max(row.cellCount, hoja.columnCount) }, (_, i) => texto(row.getCell(i + 1).value));
  };

  let filaEnc = 0;
  let mapa: Map<number, Campo> | null = null;
  for (let r = 1; r <= Math.min(10, hoja.rowCount) && !mapa; r++) {
    mapa = encabezados(fila(r));
    if (mapa) filaEnc = r;
  }
  const lista: (ContactoExcel | null)[] = [];
  for (let r = filaEnc + 1; r <= hoja.rowCount; r++) {
    const celdas = fila(r);
    if (!celdas.some((c) => c.trim())) continue; // fila vacía
    if (mapa) {
      const d: Partial<Record<Campo, string>> = {};
      for (const [i, campo] of mapa) d[campo] = celdas[i];
      lista.push(armar(d));
    } else {
      // Sin encabezados: cada dato se reconoce por su forma
      lista.push(armar(porForma(celdas)));
    }
  }
  return resumen(lista);
}

/**
 * Texto pegado. Sirve:
 * - Filas copiadas del Excel (columnas separadas por tabulador), con o sin la fila de encabezados.
 * - Un contacto por línea separado por comas: "Juan Pérez, Bonafont, 3123456, 5512345678, j@correo.com, Negativa".
 * - Cada dato en su propio renglón (como al copiar una ficha), con una línea en blanco entre contactos.
 */
export function leerTextoContactos(texto: string): Lectura {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const llenas = lineas.map((l) => l.trim()).filter(Boolean);
  if (!llenas.length) return { contactos: [], sinTelefono: 0, descartados: 0 };

  // 1) Filas con columnas (tabulador, punto y coma o barra; coma solo si no hay otro separador)
  // Se usa el separador si la mayoría de los renglones lo trae (si no, son datos sueltos por renglón)
  const mayoria = (re: RegExp) => llenas.filter((l) => re.test(l)).length * 2 > llenas.length;
  const sep = mayoria(/\t/) ? "\t" : mayoria(/;|\|/) ? /;|\|/ : mayoria(/,/) ? "," : null;
  if (sep) {
    const filas = llenas.map((l) => l.split(sep).map((x) => x.trim()));
    const mapa = encabezados(filas[0]);
    const datos = mapa ? filas.slice(1) : filas;
    // Con tabuladores y 5+ columnas (copiado del Excel): mismo orden que el Excel del gerente
    const porColumna = !mapa && sep === "\t" && filas.every((f) => f.length >= 5);
    return resumen(
      datos.map((f) => {
        if (mapa) {
          const d: Partial<Record<Campo, string>> = {};
          for (const [i, campo] of mapa) d[campo] = f[i];
          return armar(d);
        }
        if (porColumna) return armar(Object.fromEntries(ORDEN.map((c, i) => [c, f[i]])));
        return armar(porForma(f));
      })
    );
  }

  // 2) Un contacto por línea con su teléfono ("Juan Pérez 5512345678")
  if (llenas.length > 1 && llenas.every((l) => digitos(l) >= 10 && /[a-záéíóúñ]/i.test(l))) {
    return resumen(llenas.map((l) => {
      const tel = l.match(/[+(]?\d[\d\s()-]{8,}\d/)?.[0] ?? "";
      return armar(porForma([l.replace(tel, " ").trim(), tel]));
    }));
  }

  // 3) Cada dato en su renglón; los contactos se separan con una línea en blanco
  const bloques: string[][] = [];
  let actual: string[] = [];
  for (const l of lineas) {
    if (l.trim()) actual.push(l);
    else if (actual.length) { bloques.push(actual); actual = []; }
  }
  if (actual.length) bloques.push(actual);
  // Un bloque de un solo renglón con comas es un contacto completo en una línea ("Ana, Marca, 3111111, 5512345678…")
  return resumen(bloques.map((b) => armar(porForma(b.length === 1 ? b[0].split(/\t|;|\||,/) : b.flatMap((l) => l.split(/\t|;|\|/))))));
}
