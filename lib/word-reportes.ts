// Reportes en Word (.docx): el reporte rápido de un cliente y el reporte general de marcas (Admin).
// Mismo contenido que en pantalla, con el encabezado del despacho, para editarlo o enviarlo.
import { readFile } from "fs/promises";
import path from "path";
import { BorderStyle, Document, Footer, HeadingLevel, ImageRun, Packer, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, AlignmentType } from "docx";
import { TIPOS_EXPEDIENTE } from "./catalogos";
import type { DatosReporteCliente } from "./reporte-cliente";
import { conclusiones, type ReporteGeneral } from "./reporte-general";

const fecha = (d: Date | null | undefined) => (d ? d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const fh = (d: Date) => d.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" });
const linea = { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" };
const nada = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const bordes = { top: linea, bottom: linea, left: nada, right: nada, insideHorizontal: linea, insideVertical: nada };
const t = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font: "Calibri", size: o.size ?? 17, bold: o.bold, color: o.color });
const p = (...r: TextRun[]) => new Paragraph({ children: r, spacing: { after: 30 } });
const celda = (lineas: string | string[], o: { bold?: boolean; fondo?: string; color?: string; size?: number } = {}) =>
  new TableCell({
    children: (Array.isArray(lineas) ? lineas : [lineas]).map((x, i) => p(t(x, { bold: o.bold && i === 0, color: i ? "666666" : o.color, size: o.size }))),
    shading: o.fondo ? { type: ShadingType.CLEAR, color: "auto", fill: o.fondo } : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
  });
const tabla = (encabezados: string[], filas: (string | string[])[][]) =>
  filas.length
    ? new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: bordes,
        rows: [
          new TableRow({ tableHeader: true, children: encabezados.map((h) => celda(h.toUpperCase(), { bold: true, fondo: "F2F2F2", color: "555555", size: 14 })) }),
          ...filas.map((f) => new TableRow({ cantSplit: true, children: f.map((x, i) => celda(x, { bold: i === 0 })) })),
        ],
      })
    : p(t("Ninguna.", { color: "888888" }));
const titulo = (n: number, texto: string, ayuda?: string) => [
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 60 }, children: [t(`${n}. ${texto}`, { bold: true, size: 26 })] }),
  ...(ayuda ? [new Paragraph({ spacing: { after: 140 }, children: [t(ayuda, { size: 16, color: "777777" })] })] : []),
];
const sub = (texto: string) => new Paragraph({ spacing: { before: 200, after: 80 }, children: [t(texto, { bold: true, size: 20 })] });
const cifras = (items: [string, number | string][]) => tabla(items.map(([k]) => k), [items.map(([, v]) => String(v))]);

async function encabezado(tituloDoc: string, subtitulo: string) {
  const logo = await readFile(path.join(process.cwd(), "public", "logo.png")).catch(() => null);
  const fondo = { type: ShadingType.CLEAR, color: "auto", fill: "1F1F1F" } as const;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: nada, bottom: nada, left: nada, right: nada, insideHorizontal: nada, insideVertical: nada },
    rows: [new TableRow({ children: [
      new TableCell({ shading: fondo, margins: { top: 120, bottom: 120, left: 160, right: 160 }, children: [new Paragraph({ children: logo ? [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: 69 } })] : [t("ARRIOLA ABOGADOS", { bold: true, color: "8DC63F", size: 30 })] })] }),
      new TableCell({ shading: fondo, margins: { top: 120, bottom: 120, left: 160, right: 160 }, children: [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(tituloDoc, { bold: true, color: "FFFFFF", size: 30 })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [t(subtitulo, { color: "BBBBBB", size: 20 })] }),
      ] }),
    ] })],
  });
}

const documento = (tituloDoc: string, horizontal: boolean, children: (Paragraph | Table)[]) =>
  Packer.toBuffer(
    new Document({
      creator: "Arriola Abogados",
      title: tituloDoc,
      sections: [{
        properties: { page: { size: { orientation: horizontal ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        footers: { default: new Footer({ children: [p(t(`Reporte generado el ${fh(new Date())} (hora de la Ciudad de México) · Arriola Abogados`, { size: 14, color: "888888" }))] }) },
        children,
      }],
    })
  );

/** Reporte rápido de un cliente (estatus de sus marcas) en Word. */
export async function reporteClienteEnWord(d: DatosReporteCliente) {
  const children: (Paragraph | Table)[] = [
    await encabezado("Reporte de estatus de marcas", d.hoy.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })),
    new Paragraph({ spacing: { before: 240 }, children: [t("CLIENTE", { size: 14, color: "777777" })] }),
    new Paragraph({ spacing: { after: 60 }, children: [t(d.cliente.nombre, { bold: true, size: 34 })] }),
    ...(d.titularNombre ? [p(t(`Titular: ${d.titularNombre}`, { color: "555555" }))] : []),
    p(t(d.consultaMasNueva ? `Última actualización en MARCanet: ${fecha(d.consultaMasNueva)}` : "Aún sin consultar en MARCanet", { size: 15, color: "777777" })),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
    cifras(d.resumen.map((r) => [r.t, r.n])),
  ];
  for (const g of d.grupos) {
    children.push(sub(`${g.nombre} · ${g.marcas.length} ${g.marcas.length === 1 ? "marca" : "marcas"}`));
    children.push(
      tabla(
        ["Marca", "Expediente / registro", "Fechas", "Estatus actual", "Último movimiento y próximos pasos"],
        g.marcas.map((m) => [
          [m.denominacion, TIPOS_EXPEDIENTE[m.tipo] ?? m.tipo, m.marcanetSync ? `MARCanet: ${fecha(m.marcanetSync)}` : "Sin consultar en MARCanet"],
          [`Exp. ${m.numeroExpediente ?? "—"}`, ...(m.numeroRegistro ? [`Reg. ${m.numeroRegistro}`] : [])],
          [...(m.fechaPresentacion ? [`Presentada: ${fecha(m.fechaPresentacion)}`] : []), ...(m.fechaConcesion ? [`Concesión: ${fecha(m.fechaConcesion)}`] : [])].concat(m.fechaPresentacion || m.fechaConcesion ? [] : ["—"]),
          m.estatus.txt,
          [...(m.ultimo ? [m.ultimo] : []), ...m.proximos.map((x) => `→ ${x}`)].concat(m.ultimo || m.proximos.length ? [] : ["—"]),
        ])
      )
    );
  }
  children.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [t(`Información con base en los expedientes públicos del IMPI (MARCanet)${d.consultaMasVieja ? `, consultados desde el ${fecha(d.consultaMasVieja)}` : ""}, y en el seguimiento de Arriola Abogados. Las fechas límite consideran los días inhábiles publicados por el IMPI.`, { size: 15, color: "777777" })],
    })
  );
  return documento("Reporte de estatus de marcas", true, children);
}

/** Reporte general de todas las marcas (Admin) en Word. */
export async function reporteGeneralEnWord(r: ReporteGeneral, ultimaActualizacion: Date | null) {
  let k = 0;
  const ganadas = (lista: ReporteGeneral["ganadas"]) =>
    tabla(
      ["Marca", "Cliente", "Registro", "Concesión", "Declaración de uso", "Renovación"],
      lista.map((g) => [
        [g.denominacion, `Exp. ${g.numeroExpediente ?? "s/n"}`],
        g.cliente,
        g.registro ?? "—",
        fecha(g.concesion),
        !g.concesion ? "—" : !g.ddu ? "No aplica (antes de 2018)" : g.ddu.presentada ? "Presentada" : `${fecha(g.ddu.inicio)} al ${fecha(g.ddu.fin)}`,
        !g.renovacion ? "—" : g.renovacion.presentada ? "Renovada" : fecha(g.renovacion.vence),
      ])
    );
  const perdidas = (lista: ReporteGeneral["negadas"]) =>
    tabla(["Marca", "Cliente", "Fecha", "Motivo", "Nota"], lista.map((x) => [[x.denominacion, `Exp. ${x.numeroExpediente ?? "s/n"}`], x.cliente, fecha(x.fecha), x.motivo, x.detalle ?? ""]));
  const motivos = (lista: [string, number][]) => tabla(["Motivo", "Marcas"], lista.map(([m, n]) => [m, String(n)]));
  const movimientos = (lista: ReporteGeneral["enEspera"]) =>
    tabla(["Marca", "Cliente", "Fecha", "Qué hay en MARCanet"], lista.map((m) => [[m.denominacion, `Exp. ${m.numeroExpediente ?? "s/n"}`], m.cliente, fecha(m.fecha), m.texto]));

  const children: (Paragraph | Table)[] = [
    await encabezado("Reporte general de marcas", new Date().toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" })),
    new Paragraph({ spacing: { before: 200, after: 120 }, children: [t(ultimaActualizacion ? `Última actualización total en MARCanet: ${fecha(ultimaActualizacion)}` : "Última actualización total en MARCanet: nunca (datos de la app al día de hoy)", { size: 16, color: "777777" })] }),
    cifras([["Marcas en total", r.total], ["Ganadas", r.ganadas.length], ["En trámite", r.enTramite], ["Oficios en curso", r.oficios.length]]),
    new Paragraph({ spacing: { after: 80 }, children: [] }),
    cifras([["DDU · próx. 12 meses", r.ddu12], ["Renovaciones · próx. 12 meses", r.renov12], ["Negadas", r.negadas.length], ["Abandonadas", r.abandonadas.length]]),

    ...titulo(++k, "Marcas ganadas: declaración de uso y renovación", "Declaración de uso: en los 3 meses siguientes al 3er aniversario de la concesión (concedidas desde el 10/08/2018). Renovación: cada 10 años desde la concesión, con 6 meses de gracia."),
    sub(`Les toca en los próximos 12 meses (${r.proximas.length})`), ganadas(r.proximas),
    ...(r.vencidas.length ? [sub(`Con declaración de uso o renovación vencida sin presentar (${r.vencidas.length})`), ganadas(r.vencidas)] : []),
    sub(`Todas las marcas ganadas (${r.ganadas.length})`), ganadas(r.ganadas),

    ...titulo(++k, "Marcas negadas y por qué", "El motivo se toma del oficio que el IMPI emitió antes de la negativa."),
    motivos(r.motivosNegadas), sub(`Lista (${r.negadas.length})`), perdidas(r.negadas),

    ...titulo(++k, "Marcas abandonadas y por qué", "Abandonadas por no contestar un oficio a tiempo o porque el cliente ya no quiso continuar."),
    motivos(r.motivosAbandonadas), sub(`Lista (${r.abandonadas.length})`), perdidas(r.abandonadas),

    ...titulo(++k, "Oficios en curso", "Oficios en plazo y el paso en el que van."),
    tabla(["Marca", "Cliente", "Oficio", "Notificado", "Paso", "Vence"], r.oficios.map((o) => [[o.denominacion, `Exp. ${o.numeroExpediente ?? "s/n"}`], o.cliente, o.tipo, fecha(o.notificado), o.paso, `${fecha(o.limite)}${o.vencido ? " · vencido" : ""}`])),

    ...titulo(++k, "En espera de respuesta del IMPI", "Lo último en MARCanet es algo que presentamos nosotros."),
    movimientos(r.enEspera),

    ...titulo(++k, "El IMPI ya nos contestó (últimos 3 meses)"),
    movimientos(r.contestaron),

    ...titulo(++k, "Qué nos dice este reporte"),
    ...conclusiones(r).map((x) => new Paragraph({ spacing: { after: 120 }, children: [t(x, { size: 20 })] })),
  ];
  return documento("Reporte general de marcas", true, children);
}
