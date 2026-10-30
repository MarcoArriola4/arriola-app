// Reporte de auditoría en Word (.docx) para editarlo después: mismo contenido que el reporte en pantalla.
import { readFile } from "fs/promises";
import path from "path";
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { redactarAuditoria } from "./redaccion-auditoria";
import { categoriaDe, type MarcaAuditada, type ResultadoAuditoria } from "./marcanet/auditoria";
import type { Juicio } from "./cumplimiento";

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

/** Texto formal: estatus general, puntos de atención y clases adicionales recomendadas. */
function redaccionEnWord(r: ResultadoAuditoria): Paragraph[] {
  const x = redactarAuditoria(r);
  const parrafo = (texto: string) => new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.JUSTIFIED, children: [t(texto, { size: 20, color: "333333" })] });
  return [
    new Paragraph({ spacing: { before: 300, after: 120 }, children: [t("ESTATUS GENERAL Y RECOMENDACIONES", { bold: true, size: 20, color: OSCURO })] }),
    ...x.parrafos.map(parrafo),
    ...(x.recomendaciones.length
      ? [
          parrafo(x.introRecomendaciones),
          ...x.recomendaciones.map(
            (rec) =>
              new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 80 },
                children: [
                  t(rec.marca, { bold: true, size: 20 }),
                  t(` (hoy en clase${rec.clases.length > 1 ? "s" : ""} ${rec.clases.join(", ")}): `, { size: 20, color: "666666" }),
                  t(rec.sugeridas.map((c) => `clase ${c.clase} – ${c.descripcion}`).join("; "), { size: 20, color: "333333" }),
                ],
              })
          ),
        ]
      : []),
    parrafo(x.cierre),
  ];
}

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

  const noContratadas = r.marcas.filter((m) => !m.enApp).sort((a, b) => a.denominacion.localeCompare(b.denominacion, "es"));
  const cuentaCat = (c: string) => r.marcas.filter((m) => categoriaDe(m) === c).length;
  const resumen = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordesTabla,
    rows: [
      new TableRow({ children: ["Marcas encontradas", "Ganadas (registradas)", "En proceso", "Abandonadas, negadas o vencidas", "No contratadas con nosotros"].map((x) => celda([p(t(x, { size: 16, color: "666666" }))], { fondo: "F7F7F7" })) }),
      new TableRow({ children: [r.marcas.length, cuentaCat("GANADA"), cuentaCat("PROCESO"), cuentaCat("PERDIDA"), noContratadas.length].map((n) => celda([p(t(String(n), { bold: true, size: 32 }))])) }),
    ],
  });

  // Ganadas, en proceso y perdidas; dentro, por titular y por marca
  const titularDe = (m: MarcaAuditada) => m.encontradaComo.find((x) => x.como === "TITULAR")?.nombre ?? m.encontradaComo[0]?.nombre ?? "";
  const CATS = [
    { id: "GANADA", titulo: "GANADAS · REGISTRADAS", color: "1B5E20" },
    { id: "PROCESO", titulo: "EN PROCESO", color: "0D47A1" },
    { id: "PERDIDA", titulo: "ABANDONADAS, NEGADAS O VENCIDAS", color: "B71C1C" },
  ];
  const linea = (j: Juicio) => p(t(j.texto, { size: 15, color: COLOR_TONO[j.tono].texto }));
  const secciones = CATS.flatMap((cat) => {
    const marcas = r.marcas
      .filter((m) => categoriaDe(m) === cat.id)
      .sort((a, b) => titularDe(a).localeCompare(titularDe(b), "es") || a.denominacion.localeCompare(b.denominacion, "es") || a.expediente.localeCompare(b.expediente));
    if (!marcas.length) return [];
    const encabezados = ["Marca", "Expediente · clase", "Presentación · concesión · vigencia", "Estatus actual", "Declaración de uso · renovación", "Oficios y contestaciones"];
    const anchos = [18, 11, 15, 18, 18, 20];
    return [
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 }, children: [t(cat.titulo, { bold: true, size: 22, color: cat.color }), t(`  ·  ${marcas.length} ${marcas.length === 1 ? "marca" : "marcas"}`, { size: 18, color: "888888" })] }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: bordesTabla,
        rows: [
          new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda([p(t(h.toUpperCase(), { bold: true, size: 14, color: "666666" }))], { ancho: anchos[i], fondo: "F7F7F7" })) }),
          ...marcas.map(
            (m) =>
              new TableRow({
                cantSplit: true,
                children: [
                  celda([
                    p(t(m.denominacion, { bold: true })),
                    p(t(m.tipoMarca, { size: 14, color: "777777" })),
                    p(t(m.encontradaComo.map((x) => `${x.como === "TITULAR" ? "Titular" : "Apoderado"}: ${x.nombre}`).join(" · "), { size: 14, color: "777777" })),
                    p(t(m.enApp ? "Contratada con nosotros" : "No contratada con nosotros", { size: 14, bold: !m.enApp, color: m.enApp ? "1B5E20" : "5B21B6" })),
                  ], { ancho: anchos[0] }),
                  celda([p(t(`Exp. ${m.expediente}`)), ...(m.registro ? [p(t(`Reg. ${m.registro}`))] : []), p(t(`Clase ${m.clase ?? "—"}`, { size: 15, color: "777777" }))], { ancho: anchos[1] }),
                  celda([
                    p(t(`Presentación: ${m.fechaPresentacion ? fecha(m.fechaPresentacion) : "—"}`, { size: 15 })),
                    p(t(`Concesión: ${m.fechaConcesion ? fecha(m.fechaConcesion) : "—"}`, { size: 15 })),
                    p(t(`Vigencia: ${m.vigencia ? fecha(m.vigencia) : "—"}`, { size: 15 })),
                  ], { ancho: anchos[2] }),
                  celda([
                    p(t(m.estatus || "—", { bold: true, color: COLOR_TONO[m.tono].texto })),
                    ...(m.ultimo ? [p(t(`Último movimiento: ${fecha(m.ultimo.fecha)} · ${m.ultimo.texto}`, { size: 14, color: "555555" }))] : []),
                  ], { ancho: anchos[3], fondo: COLOR_TONO[m.tono].fondo }),
                  celda([m.ddu, m.renovacion].filter(Boolean).length ? ([m.ddu, m.renovacion].filter(Boolean) as Juicio[]).map(linea) : [p(t(cat.id === "GANADA" ? "Sin fecha de concesión" : "No aplica (no registrada)", { size: 15, color: "888888" }))], { ancho: anchos[4] }),
                  celda(m.contestaciones?.length ? m.contestaciones.map(linea) : [p(t("Sin oficios que contestar", { size: 15, color: "888888" }))], { ancho: anchos[5] }),
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
            ...r.busquedas.map((b) => {
              const nombre = [b.nombre, b.consulta && b.consulta !== b.nombre ? `(encontrado como «${b.consulta}»)` : "", b.aproximadas?.length ? `· incluidos por parecido: ${b.aproximadas.join(" · ")}` : ""].filter(Boolean).join(" ");
              const marcas = b.error && !b.marcas ? "No se pudo buscar" : String(b.marcas);
              return new TableRow({ children: [nombre, b.como === "TITULAR" ? "Titular" : "Apoderado", marcas, b.parecidos.join(" · ") || "—"].map((x) => celda([p(t(x, { size: 15 }))])) });
            }),
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
          ...redaccionEnWord(r),
          ...(noContratadas.length
            ? [
                new Paragraph({ spacing: { before: 300, after: 60 }, children: [t(`MARCAS NO CONTRATADAS CON ARRIOLA ABOGADOS · ${noContratadas.length}`, { bold: true, size: 18, color: "5B21B6" })] }),
                new Paragraph({ children: [t(noContratadas.map((m) => `${m.denominacion} (exp. ${m.expediente}${m.clase ? `, clase ${m.clase}` : ""}) – ${m.estatus}`).join(" · "), { size: 16, color: "444444" })] }),
              ]
            : []),
          ...secciones,
          ...(r.marcas.length ? [] : [new Paragraph({ spacing: { before: 300 }, children: [t("El IMPI no tiene marcas registradas a nombre de estos titulares o apoderados.", { italics: true, color: "666666" })] })]),
          ...detalle,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
