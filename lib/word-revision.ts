// Reporte de revisión de marcas en Word (.docx): mismo contenido que en pantalla, para editarlo o enviarlo.
import { readFile } from "fs/promises";
import path from "path";
import { BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { DatosRevision } from "./reporte-revision";
import { nombreModo } from "./reporte-revision";

const fecha = (d: Date | null) => (d ? d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const fh = (d: Date | null) => (d ? d.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" }) : "en curso");
const linea = { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" };
const nada = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const bordes = { top: linea, bottom: linea, left: nada, right: nada, insideHorizontal: linea, insideVertical: nada };
const t = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: "Calibri", size: o.size ?? 17, bold: o.bold, color: o.color });
const p = (...r: TextRun[]) => new Paragraph({ children: r, spacing: { after: 30 } });
const celda = (texto: string, o: { bold?: boolean; fondo?: string; color?: string; size?: number } = {}) =>
  new TableCell({ children: [p(t(texto, { bold: o.bold, color: o.color, size: o.size }))], shading: o.fondo ? { type: ShadingType.CLEAR, color: "auto", fill: o.fondo } : undefined, margins: { top: 50, bottom: 50, left: 80, right: 80 } });
const tabla = (encabezados: string[], filas: string[][]) =>
  new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: bordes,
    rows: [new TableRow({ tableHeader: true, children: encabezados.map((h) => celda(h.toUpperCase(), { bold: true, fondo: "F2F2F2", color: "555555", size: 14 })) }), ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((x, i) => celda(x, { bold: i === 0 })) }))],
  });
const titulo = (n: number, texto: string, ayuda: string) => [
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 60 }, children: [t(`${n}. ${texto}`, { bold: true, size: 26 })] }),
  new Paragraph({ spacing: { after: 140 }, children: [t(ayuda, { size: 16, color: "777777" })] }),
];
const sub = (texto: string) => new Paragraph({ spacing: { before: 200, after: 80 }, children: [t(texto, { bold: true, size: 20 })] });
const cifras = (items: [string, number | string][]) => tabla(items.map(([k]) => k), [items.map(([, v]) => String(v))]);
const marcas = (lista: DatosRevision["novedades"]["ganadas"], fechaTit = "Fecha") =>
  lista.length ? tabla(["Marca", "Cliente", "Expediente", fechaTit, "Detalle"], lista.map((m) => [m.denominacion, m.cliente, m.numeroExpediente ?? "—", fecha(m.fecha), m.detalle])) : p(t("Ninguna.", { color: "888888" }));

export async function revisionEnWord(d: DatosRevision) {
  const logo = await readFile(path.join(process.cwd(), "public", "logo.png")).catch(() => null);
  const r = d.revision;
  const n = d.novedades;
  const t3 = d.tresMeses;
  let k = 0;
  const doc = new Document({
    creator: "Arriola Abogados",
    title: "Reporte de revisión de marcas",
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        footers: { default: new Footer({ children: [p(t(`Reporte generado el ${fh(new Date())} (hora de la Ciudad de México) · Arriola Abogados`, { size: 14, color: "888888" }))] }) },
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: nada, bottom: nada, left: nada, right: nada, insideHorizontal: nada, insideVertical: nada },
            rows: [new TableRow({ children: [
              new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "1F1F1F" }, margins: { top: 120, bottom: 120, left: 160, right: 160 }, children: [new Paragraph({ children: logo ? [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: 69 } })] : [t("ARRIOLA ABOGADOS", { bold: true, color: "8DC63F", size: 30 })] })] }),
              new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill: "1F1F1F" }, margins: { top: 120, bottom: 120, left: 160, right: 160 }, children: [p(t("Reporte de revisión de marcas", { bold: true, color: "FFFFFF", size: 30 })), p(t(nombreModo(r.modo), { color: "BBBBBB", size: 20 }))] }),
            ] })],
          }),
          ...titulo(++k, "Resumen de la revisión", `Del ${fh(r.inicio)} al ${fh(r.fin)} (hora de la Ciudad de México).`),
          cifras([["Marcas revisadas", r.revisadas], ["No se pudieron consultar", d.conError.length], ["No revisadas: abandonadas o negadas", d.noRevisadas.perdidas.length], ["No revisadas: registradas", d.noRevisadas.registradas.length]]),
          ...titulo(++k, "Novedades del IMPI en esta revisión", "Lo que apareció por primera vez en MARCanet durante esta revisión."),
          cifras([["Ganadas", n.ganadas.length], ["Negadas", n.negadas.length], ["Abandonadas", n.abandonadas.length], ["Oficios nuevos", n.oficios.length], ["Contestaciones", n.contestadas.length]]),
          sub(`Marcas ganadas (${n.ganadas.length})`), marcas(n.ganadas),
          sub(`Marcas negadas (${n.negadas.length})`), marcas(n.negadas),
          sub(`Marcas abandonadas (${n.abandonadas.length})`), marcas(n.abandonadas),
          sub(`Oficios nuevos (${n.oficios.length})`), marcas(n.oficios),
          sub(`Contestaciones registradas ante el IMPI (${n.contestadas.length})`), marcas(n.contestadas),
          ...titulo(++k, "Marcas que no se revisaron y por qué", "Las registradas se revisan solo en sus periodos: declaración de uso (desde 1 semana antes del 3er aniversario de la concesión y hasta 3 meses después) y renovación (desde 6 meses antes de su vigencia y hasta 6 meses después). Las abandonadas o negadas ya no se revisan."),
          sub(`Registradas · próxima revisión programada (${d.noRevisadas.registradas.length})`),
          tabla(["Marca", "Cliente", "Expediente", "Se vuelve a revisar", "Por"], d.noRevisadas.registradas.map((o) => [o.denominacion, o.cliente, o.numeroExpediente ?? "—", o.proximaRevision ? fecha(o.proximaRevision) : "—", o.porque ?? "Sin periodos pendientes"])),
          sub(`Abandonadas, negadas o que ya no continúan (${d.noRevisadas.perdidas.length})`),
          tabla(["Marca", "Cliente", "Expediente", "Motivo"], d.noRevisadas.perdidas.map((o) => [o.denominacion, o.cliente, o.numeroExpediente ?? "—", o.porque ?? ""])),
          ...(d.conError.length ? [...titulo(++k, "Marcas que no se pudieron consultar", "Se reintentan solas en la siguiente revisión."), marcas(d.conError)] : []),
          ...titulo(++k, `Últimos 3 meses (desde el ${fecha(t3.desde)})`, "Lo contratado recientemente y lo que todavía falta."),
          cifras([["Marcas ingresadas", t3.ingresadas.length], ["Por pagar", `${t3.porPagar.cuantos} (${t3.porPagar.monto.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })})`], ["Por trabajar", t3.porTrabajar], ["Vo. Bo.", t3.voBo]]),
          cifras([["Por presentar", t3.porPresentar], ["Pagar en sistema", t3.pagarSistema], ["Oficios por avisar", t3.oficiosPorAvisar], ["Oficios esperando pago", t3.oficiosEsperandoPago]]),
          sub(`Marcas ingresadas (${t3.ingresadas.length})`), marcas(t3.ingresadas, "Contratada"),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
