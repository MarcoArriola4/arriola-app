// Importa la pestaña "Patente - Modelos de Utilidad" del Excel (patentes, modelos y diseños industriales).
// Uso: npx tsx --env-file=.env.production.local scripts/importar-patentes.ts "../Pagos 2026 Actual.xlsx"
import ExcelJS from "exceljs";
import { db } from "../lib/db";
import { normalizarNombre, tipoPorExpediente } from "../lib/catalogos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function texto(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("result" in v) return texto(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return null;
  }
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s !== "-" ? s : null;
}

/** "10 de junio 2025", fecha de Excel o dd/mm/aaaa → Date UTC */
function fecha(v: ExcelJS.CellValue): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const t = texto(v)?.toLowerCase();
  if (!t) return null;
  const m = t.match(/(\d{1,2})\s*de\s*([a-záéíóú]+)\s*(?:de\s*)?(\d{4})/);
  if (m) {
    const mes = MESES.indexOf(m[2]);
    if (mes >= 0) return new Date(Date.UTC(Number(m[3]), mes, Number(m[1])));
  }
  const d = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return d ? new Date(Date.UTC(Number(d[3]), Number(d[2]) - 1, Number(d[1]))) : null;
}

const numero = (v: ExcelJS.CellValue) => {
  if (typeof v === "number") return v;
  const m = texto(v)?.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function etapaDe(status: string | null, numeroExp: string | null) {
  const s = (status ?? "").toLowerCase();
  if (/t[ií]tulo|concedid|otorg/.test(s)) return "CONCEDIDA";
  if (/no contestamos|abandon/.test(s)) return "ABANDONADA";
  if (/contestar oficio|oficio notificado|requerim/.test(s)) return "CON_OFICIO";
  if (/negativa|negad/.test(s)) return "NEGATIVA";
  return numeroExp ? "EN_TRAMITE" : "POR_PRESENTAR";
}

async function main() {
  const archivo = process.argv[2] ?? "../Pagos 2026 Actual.xlsx";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets.find((w) => /patente/i.test(w.name));
  if (!ws) throw new Error("No se encontró la pestaña de patentes");

  let creados = 0;
  let actualizados = 0;
  const omitidos: string[] = [];

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const g = (c: number) => row.getCell(c).value;
    const denominacion = texto(g(3));
    if (!denominacion) continue;
    const titular = texto(g(2));
    if (!titular) {
      omitidos.push(`Fila ${r}: "${denominacion}" (sin titular)`);
      continue;
    }
    const numeroExp = texto(g(4))?.toUpperCase().replace(/\s+/g, "") ?? null;
    const status = texto(g(11));
    const notificacion = texto(g(12));
    const anualidades = texto(g(14));
    const tipo = tipoPorExpediente(numeroExp) ?? "DISENO_INDUSTRIAL";

    const nombreNorm = normalizarNombre(titular);
    const cliente = await db.cliente.upsert({
      where: { nombreNorm },
      update: {},
      create: { nombre: titular, nombreNorm, email: texto(g(6))?.toLowerCase() ?? null, telefono: texto(g(5)) },
    });

    const data = {
      clienteId: cliente.id,
      tipo,
      denominacion,
      etapa: etapaDe(status, numeroExp),
      ultimoEstatus: status,
      notas: [notificacion && `Notificación: ${notificacion}`, anualidades && `Anualidades: ${anualidades}`].filter(Boolean).join("\n") || null,
    };
    const existente = numeroExp
      ? await db.expediente.findUnique({ where: { numeroExpediente: numeroExp } })
      : await db.expediente.findFirst({ where: { clienteId: cliente.id, numeroExpediente: null, denominacion: { equals: denominacion, mode: "insensitive" } } });
    const exp = existente
      ? await db.expediente.update({ where: { id: existente.id }, data })
      : await db.expediente.create({ data: { ...data, numeroExpediente: numeroExp } });
    if (existente) actualizados++;
    else creados++;

    // Cobro: parcialidad 1 y 2 (si trae fecha de pago, se considera pagada)
    const p1 = numero(g(8));
    const p2 = numero(g(10));
    if (p1 || p2) {
      const f1 = fecha(g(7));
      const f2 = fecha(g(9));
      const p1ok = !!p1 && !!f1;
      const p2ok = !!p2 && !!f2;
      const costo = (p1 ?? 0) + (p2 ?? 0);
      const pagado = (p1ok ? p1! : 0) + (p2ok ? p2! : 0);
      await db.servicio.deleteMany({ where: { expedienteId: exp.id, filaExcel: -r, editadoEnApp: false } });
      const yaEditado = await db.servicio.count({ where: { expedienteId: exp.id, filaExcel: -r, editadoEnApp: true } });
      if (!yaEditado) {
        await db.servicio.create({
          data: {
            expedienteId: exp.id,
            tipo: "REGISTRO",
            fechaContratacion: f1 ?? f2,
            costo,
            pagado,
            estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
            parcialidad1: p1,
            parcialidad1Pagada: p1 ? p1ok : null,
            parcialidad2: p2,
            parcialidad2Pagada: p2 ? p2ok : null,
            avance: status,
            filaExcel: -r, // negativo = fila de la pestaña de patentes
          },
        });
      }
    }
  }
  console.log({ creados, actualizados, omitidos });
}

main().finally(() => db.$disconnect());
