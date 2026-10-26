// Reporte de auditoría en Word (.docx) para editarlo después: mismo contenido que el reporte en pantalla.
import { readFile } from "fs/promises";
import path from "path";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { MarcaAuditada, ResultadoAuditoria } from "./marcanet/auditoria";

const OSCURO = "1F1F1F";
const VERDE_MARCA = "8DC63F";
const COLOR_TONO: Record<MarcaAuditada["tono"], { fondo: string; texto: string }> = {
  verde: { fondo: "E8F5E9", texto: "1B5E20" },
  azul: { fondo: "E3F2FD", texto: "0D47A1" },
  ambar: { fondo: "FFF8E1", texto: "8D6E00" },
  rojo: { fondo: "FFEBEE", texto: "B71C1C" },
  gris: { fondo: "F2F2F2", texto: "555555" },
};

const fecha = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const sinBordes = { top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };
const linea = { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" };
const bordesTabla = { top: linea, bottom: linea, left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }, insideHorizontal: linea, insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } };

const t = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) => new TextRun({ text, font: "Calibri", size: o.size ?? 18, bold: o.bold, color: o.color, italics: o.italics });
const celda = (hijos: Paragraph[], o: { ancho?: number; fondo?: string } = {}) =>
  new TableCell({ children: hijos, width: o.ancho ? { size: o.ancho, type: WidthType.PERCENTAGE } : undefined, shading: o.fondo ? { type: ShadingType.CLEAR, color: "auto", fill: o.fondo } : undefined, margins: { top: 60, bottom: 60, left: 80, right: 80 } });
const p = (...runs: TextRun[]) => new Paragraph({ children: runs, spacing: { after: 40 } });

export async function auditoriaEnWord(datos: { cliente: string | null; nombres: string[]; terminado: Date | null; resultado: ResultadoAuditoria }) {
  const { resultado: r } = datos;
  const logo = await readFile(path.join(process.cwd(), "public", "logo.png")).catch(() => null);
  const hoy = (datos.terminado ?? new Date()).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

  // Encabezado oscuro con el logo
  const encabezado = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { ...sinBordes, insideHorizontal: sinBordes.top, insideVertical: sinBordes.top },
    rows: [
      new TableRow({
        children: [
          celda([new Paragraph({ children: logo ? [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: 69 } })] : [t("ARRIOLA ABOGADOS", { bold: true, size: 32, color: VERDE_MARCA })] })], { ancho: 50, fondo: OSCURO }),
          celda([
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [t("Auditoría de marcas", { bold: true, size: 30, color: "FFFFFF" })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(hoy, { size: 20, color: "BBBBBB" })] }),
          ], { ancho: 50, fondo: OSCURO }),
        ],
      }),
    ],
  });

  const cuenta = (tonos: MarcaAuditada["tono"][]) => r.marcas.filter((m) => tonos.includes(m.tono)).length;
  const resumen = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordesTabla,
    rows: [
      new TableRow({ children: ["Marcas encontradas", "Registradas", "En trámite", "Requieren atención", "Abandonadas"].map((x) => celda([p(t(x, { size: 16, color: "666666" }))], { fondo: "F7F7F7" })) }),
      new TableRow({ children: [r.marcas.length, cuenta(["verde"]), cuenta(["azul"]), cuenta(["ambar", "rojo"]), cuenta(["gris"])].map((n) => celda([p(t(String(n), { bold: true, size: 32 }))])) }),
    ],
  });

  // Agrupadas por titular (o apoderado) y luego por marca
  const grupoDe = (m: MarcaAuditada) => m.encontradaComo.find((x) => x.como === "TITULAR")?.nombre ?? `Apoderado: ${m.encontradaComo[0]?.nombre ?? "—"}`;
  const grupos = new Map<string, MarcaAuditada[]>();
  for (const m of r.marcas) grupos.set(grupoDe(m), [...(grupos.get(grupoDe(m)) ?? []), m]);
  const secciones = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).flatMap(([grupo, marcas]) => {
    marcas.sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es") || a.expediente.localeCompare(b.expediente));
    const encabezados = ["Marca", "Expediente / registro", "Clase", "Estatus actual", "Último movimiento", "Encontrada como"];
    const anchos = [20, 16, 6, 18, 24, 16];
    return [
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 }, children: [t(grupo.toUpperCase(), { bold: true, size: 22 }), t(`  ·  ${marcas.length} ${marcas.length === 1 ? "marca" : "marcas"}`, { size: 18, color: "888888" })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: bordesTabla,
        rows: [
          new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda([p(t(h.toUpperCase(), { bold: true, size: 15, color: "666666" }))], { ancho: anchos[i], fondo: "F7F7F7" })) }),
          ...marcas.map(
            (m) =>
              new TableRow({
                cantSplit: true,
                children: [
                  celda([p(t(m.denominacion, { bold: true })), p(t(m.tipoMarca, { size: 15, color: "777777" }))], { ancho: anchos[0] }),
                  celda([
                    p(t(`Exp. ${m.expediente}`)),
                    ...(m.registro ? [p(t(`Reg. ${m.registro}`))] : []),
                    ...(m.fechaPresentacion ? [p(t(`Presentada ${fecha(m.fechaPresentacion)}`, { size: 15, color: "777777" }))] : []),
                    ...(m.fechaConcesion ? [p(t(`Concesión ${fecha(m.fechaConcesion)}`, { size: 15, color: "777777" }))] : []),
                  ], { ancho: anchos[1] }),
                  celda([p(t(m.clase ?? "—"))], { ancho: anchos[2] }),
                  celda([p(t(m.estatus || "—", { bold: true, color: COLOR_TONO[m.tono].texto }))], { ancho: anchos[3], fondo: COLOR_TONO[m.tono].fondo }),
                  celda([p(t(m.ultimo ? `${fecha(m.ultimo.fecha)} · ${m.ultimo.texto}` : "—", { size: 16 }))], { ancho: anchos[4] }),
                  celda(m.encontradaComo.map((x) => p(t(`${x.como === "TITULAR" ? "Titular" : "Apoderado"}: ${x.nombre}`, { size: 15, color: "555555" }))), { ancho: anchos[5] }),
                ],
              })
          ),
        ],
      }),
    ];
  });

  const detalle = r.busquedas.length
    ? [
        new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 400, after: 100 }, children: [t("DETALLE DE LAS BÚSQUEDAS", { bold: true, size: 18, color: "666666" })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: bordesTabla,
          rows: [
            new TableRow({ children: ["Nombre buscado", "Como", "Marcas", "Nombres parecidos en el IMPI (no incluidos)"].map((h) => celda([p(t(h, { bold: true, size: 15, color: "666666" }))], { fondo: "F7F7F7" })) }),
            ...r.busquedas.map((b) => new TableRow({ children: [b.nombre, b.como === "TITULAR" ? "Titular" : "Apoderado", b.error ? "No se pudo buscar" : String(b.marcas), b.parecidos.join(" · ") || "—"].map((x) => celda([p(t(x, { size: 15 }))])) })),
          ],
        }),
      ]
    : [];

  const doc = new Document({
    creator: "Arriola Abogados",
    title: `Auditoría de marcas${datos.cliente ? ` · ${datos.cliente}` : ""}`,
    styles: { default: { document: { run: { font: "Calibri", size: 18 } } } },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        footers: { default: new Footer({ children: [new Paragraph({ children: [t(`Información obtenida de la consulta pública del IMPI (MARCanet). Elaborado por Arriola Abogados · ${hoy}.`, { size: 14, color: "888888" })] })] }) },
        children: [
          encabezado,
          new Paragraph({ spacing: { before: 300 }, children: [t("CLIENTE", { size: 15, color: "888888" })] }),
          ...(datos.cliente ? [new Paragraph({ children: [t(datos.cliente, { bold: true, size: 36 })] })] : []),
          new Paragraph({ spacing: { after: 200 }, children: [t("Búsqueda en el IMPI (MARCanet) por titular y por apoderado de: ", { color: "555555" }), t(datos.nombres.join(" · "), { bold: true })] }),
          resumen,
          ...secciones,
          ...(r.marcas.length ? [] : [new Paragraph({ spacing: { before: 300 }, children: [t("El IMPI no tiene marcas registradas a nombre de estos titulares o apoderados.", { italics: true, color: "666666" })] })]),
          ...detalle,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
