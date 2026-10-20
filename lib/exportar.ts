// Exporta la app a un Excel con el mismo formato de la pestaña "Pagos" (columnas A–Z, encabezado en la fila 5,
// datos desde la fila 6 y los mismos colores), para seguir usándolo como el Excel actual.
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { claveVendedor } from "./catalogos";
import { descifrar } from "./crypto";

const VERDE = "FF00FF00";
const ROJO = "FFFF0000";
const MORADO = "FFFF66FF";
const AMARILLO = "FFFFFF00";
const AZUL = "FF00FFFF";
const VERDE_BANCO = "FF66FF33";
const ENCABEZADO = "FFDEEAF6";
const MONEDA = '_-"$"* #,##0.00_-;\\-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@';

// Color de la col. H según el estatus del trabajo (lo mismo que lee el importador)
const COLOR_TRABAJO: Record<string, string> = { HECHO: VERDE, PENDIENTE: MORADO, PRESENTAR: MORADO, PAGAR_SISTEMA: AMARILLO, CLIENTE: AZUL, PROBLEMA: ROJO };

// Encabezados y anchos de la fila 5 del Excel original (A–Z)
const COLUMNAS: [string | null, number][] = [
  [null, 16], ["#", 7], ["Nombre ", 45], ["Marca ", 46], ["ID", 13], ["Telefono ", 29], ["Fecha de pago ", 14], ["Trabajado Si/no", 39],
  ["Costo ", 14], ["Pago si / no ", 15], ["TITULOS", 4], [null, 11], [null, 40], ["Banco", 12], ["Salario Christian ", 12], ["Montse ", 12],
  ["Zaira ", 15], ["IMPI otros ", 12], [null, 12], ["Marco ", 12], [null, 12], [null, 12], ["Marco ", 13], ["¿Qué contesto la autoridad?", 44], [null, 26], [null, 21],
];
// Columnas O–V: quien vendió lleva un 1 en su columna
const COL_VENDEDOR: Record<string, number> = { CHRISTIAN: 15, MONTSE: 16, ZAIRA: 17, "IMPI OTROS": 18, "COLUMNA S": 19, MARCO: 20, "COLUMNA U": 21, "COLUMNA V": 22 };

const relleno = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export async function exportarExcel(db: PrismaClient, { conClaves = false } = {}) {
  const [exps, alias] = await Promise.all([
    db.expediente.findMany({
      include: { cliente: { select: { nombre: true, telefono: true } }, servicios: true },
    }),
    db.aliasVendedor.findMany(),
  ]);
  // Vendedores renombrados en la app (p. ej. "Columna S" → "Gabriel") siguen en su columna original
  const colPorClave = new Map(Object.entries(COL_VENDEDOR).map(([k, c]) => [claveVendedor(k), c]));
  for (const a of alias) {
    const c = colPorClave.get(a.clave);
    if (c) colPorClave.set(claveVendedor(a.nombre), c);
  }

  type Fila = { exp: (typeof exps)[number]; s: (typeof exps)[number]["servicios"][number] | null; orden: number; desempate: number };
  const filas: Fila[] = [];
  // Orden: las filas que vienen del Excel conservan su lugar; lo dado de alta en la app se acomoda por fecha
  const delExcel = exps.flatMap((e) => e.servicios.filter((s) => s.filaExcel != null && s.filaExcel > 0).map((s) => ({ e, s }))).sort((a, b) => a.s.filaExcel! - b.s.filaExcel!);
  let fechaCorrida = 0;
  for (const { e, s } of delExcel) {
    fechaCorrida = Math.max(fechaCorrida, s.fechaContratacion?.getTime() ?? 0);
    filas.push({ exp: e, s, orden: fechaCorrida, desempate: s.filaExcel! });
  }
  for (const e of exps) {
    // (las filas negativas vienen de la pestaña de patentes: también se acomodan por fecha)
    for (const s of e.servicios.filter((x) => x.filaExcel == null || x.filaExcel <= 0)) {
      filas.push({ exp: e, s, orden: (s.fechaContratacion ?? s.creado).getTime(), desempate: 1e9 + s.creado.getTime() / 1e3 });
    }
    // Marcas sin ningún cobro: también van, para no perder ninguna
    if (e.servicios.length === 0) filas.push({ exp: e, s: null, orden: e.creado.getTime(), desempate: 2e9 + e.creado.getTime() / 1e3 });
  }
  filas.sort((a, b) => a.orden - b.orden || a.desempate - b.desempate);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Arriola Abogados";
  const ws = wb.addWorksheet("Pagos ", { views: [{ state: "frozen", ySplit: 5 }] });
  ws.columns = COLUMNAS.map(([, w]) => ({ width: w }));
  const enc = ws.getRow(5);
  COLUMNAS.forEach(([t], i) => {
    const c = enc.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, name: "Calibri", size: 11 };
    if (i >= 2 && i <= 22) c.fill = relleno(ENCABEZADO);
  });
  for (const c of [9, 15, 16, 17, 18, 19, 20, 21, 22, 23]) ws.getColumn(c).numFmt = MONEDA;

  const conAcceso = new Set<string>();
  filas.forEach(({ exp, s }, i) => {
    const r = ws.getRow(6 + i);
    const set = (col: number, v: ExcelJS.CellValue, color?: string, fmt?: string) => {
      const c = r.getCell(col);
      c.value = v;
      if (color) c.fill = relleno(color);
      if (fmt) c.numFmt = fmt;
    };
    const tel = exp.cliente.telefono?.trim() ?? null;
    set(1, s?.origenVenta ?? null);
    set(2, i + 1);
    set(3, exp.titular ?? exp.cliente.nombre);
    set(4, exp.denominacion);
    set(5, exp.numeroExpediente && /^\d+$/.test(exp.numeroExpediente) ? Number(exp.numeroExpediente) : exp.numeroExpediente);
    set(6, tel && /^\d{7,13}$/.test(tel) ? Number(tel) : tel);
    if (!s) return;

    if (s.fechaContratacion) set(7, s.fechaContratacion, VERDE, "mm-dd-yy");
    // H: lo trabajado (texto o fecha) con el color de su estatus
    const avance = s.avance?.trim() || null;
    const hValor: ExcelJS.CellValue = avance && /^\d{4}-\d{2}-\d{2}$/.test(avance) ? new Date(`${avance}T00:00:00Z`) : avance;
    set(8, hValor, s.estadoTrabajo ? COLOR_TRABAJO[s.estadoTrabajo] : undefined, hValor instanceof Date ? "mm-dd-yy" : undefined);

    // I y J: un solo pago ("si") o dos parcialidades; verde = pagado, rojo = pendiente
    const pagadoTodo = (s.costo ?? 0) > 0 && s.pagado >= (s.costo ?? 0);
    if (s.parcialidad2 != null) {
      set(9, s.parcialidad1 ?? (s.costo ?? 0) - s.parcialidad2, s.parcialidad1Pagada ? VERDE : ROJO);
      set(10, s.parcialidad2, s.parcialidad2Pagada ? VERDE : ROJO);
    } else {
      set(9, s.costo, s.costo ? (s.parcialidad1Pagada || pagadoTodo ? VERDE : ROJO) : undefined);
      // El texto original de la col. J ("Si", "Faltan", "x3"…) se respeta mientras siga cuadrando con lo pagado
      const textoJ = s.textoPago && (pagadoTodo || !/^s[ií]/i.test(s.textoPago)) ? s.textoPago : pagadoTodo ? "si" : null;
      set(10, textoJ && /^\d+$/.test(textoJ) ? Number(textoJ) : textoJ, pagadoTodo && textoJ ? VERDE : undefined);
    }

    // K = títulos; M = el resto de las notas
    const notas = (s.notas ?? "").split("\n").map((t) => t.trim()).filter(Boolean);
    const titulos = notas.find((t) => /^Títulos:/i.test(t));
    if (titulos) set(11, titulos.replace(/^Títulos:\s*/i, ""));
    const vendedor = s.vendedor ?? null;
    const colV = vendedor ? colPorClave.get(claveVendedor(vendedor)) : undefined;
    const resto = [...notas.filter((t) => t !== titulos), vendedor && !colV ? `Vendió: ${vendedor}` : null].filter(Boolean);
    if (resto.length) set(13, resto.join(" · "));
    if (s.banco) set(14, s.banco, VERDE_BANCO);
    // Varias personas marcadas en el Excel (p. ej. Christian y Marco): se conservan mientras no se cambie quién vendió
    const columnas = s.columnasVenta?.split(",").map(Number).filter(Boolean) ?? [];
    if (colV && columnas.includes(colV)) for (const c of columnas) set(c, 1);
    else if (colV) set(colV, 1);
    if (s.respuestaImpi) set(24, s.respuestaImpi);
    // Z: acceso al IMPI, una vez por marca (la contraseña solo si se pidió)
    if (exp.impiUsuario && !conAcceso.has(exp.id)) {
      conAcceso.add(exp.id);
      let clave = "";
      if (conClaves && exp.impiPasswordEnc) {
        try { clave = descifrar(exp.impiPasswordEnc); } catch { clave = ""; }
      }
      set(26, clave ? `${exp.impiUsuario} ${clave}` : exp.impiUsuario);
    }
  });

  return { buffer: await wb.xlsx.writeBuffer(), filas: filas.length };
}
