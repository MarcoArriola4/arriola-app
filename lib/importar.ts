import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { cifrar } from "./crypto";
import { claveVendedor, normalizarNombre } from "./catalogos";
import { diasRestantes, plazosDeOficio, sumarMeses } from "./plazos";
import { cargarInhabiles } from "./inhabiles";

// Columnas de la pestaña "Pagos" (1 = A)
const C = { origen: 1, num: 2, nombre: 3, marca: 4, id: 5, tel: 6, fechaPago: 7, trabajado: 8, costo: 9, pago: 10, titulos: 11, vigencia: 12, notas: 13, banco: 14, respuesta: 24, notas2: 25, credenciales: 26 };

type Valor = string | number | Date | null;

function valor(cell: ExcelJS.CellValue): Valor {
  if (cell == null) return null;
  if (cell instanceof Date) return cell;
  if (typeof cell === "object") {
    if ("result" in cell) return valor(cell.result as ExcelJS.CellValue);
    if ("richText" in cell) return cell.richText.map((t) => t.text).join("");
    if ("text" in cell) return String(cell.text);
    if ("error" in cell) return null;
    return null;
  }
  if (typeof cell === "boolean") return cell ? "si" : "no";
  return cell as string | number;
}

function texto(v: Valor): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).replace(/\s+/g, " ").trim();
  return s || null;
}

function numero(v: Valor): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const m = v.replace(/,/g, "").match(/\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  return null;
}

/** Primera fecha dd/mm/aa(aa) dentro de un texto. */
export function fechaEnTexto(s: string | null): Date | null {
  if (!s) return null;
  const iso = s.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/); // celdas con fecha (AAAA-MM-DD)
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const m = s.match(/(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2060) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

function fechaDe(v: Valor): Date | null {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  return fechaEnTexto(texto(v));
}

/** Detecta el tipo de oficio en un texto libre. */
export function tipoOficio(t: string): string | null {
  const s = t.toLowerCase();
  if (/req(uerimiento)?\.?\s*de\s*pago/.test(s)) return "REQ_PAGO";
  if (/se\s*confirma|confirma\s*el\s*acto/.test(s)) return "CONFIRMA_ACTO";
  if (/negat|^neg\b/.test(s)) return "NEGATIVA";
  if (/\bant\b|anterior/.test(s)) return "ANTERIORIDAD";
  if (/\bimp\b|impedimento|2° imp/.test(s)) return "IMPEDIMENTO";
  if (/(\b|\d)req\b|requerim|requisitos/.test(s)) return "REQUERIMIENTO";
  if (/alegato|oposici/.test(s)) return "ALEGATOS";
  if (/oficio/.test(s)) return "OTRO";
  return null;
}

function etapaDesdeTexto(t: string): string | null {
  const s = t.toLowerCase();
  if (/abandon/.test(s)) return "ABANDONADA";
  if (/num(ero|\.)?\s*de\s*registro|número de registro|registrada|concesi|vigencia|favorable/.test(s)) return "CONCEDIDA";
  if (/juicio|recurso|revisi[oó]n|se confirma|fundado|\bj\.\s?n\b|\br\.\s?r\b/.test(s)) return "EN_JUICIO";
  if (/negat|^neg\b|perdida/.test(s)) return "NEGATIVA";
  if (tipoOficio(s)) return "CON_OFICIO";
  return null;
}

function tipoServicio(t: string, esPrimera: boolean): string {
  const s = t.toLowerCase();
  if (/\bddu\b|declaraci[oó]n de uso/.test(s)) return "DDU";
  if (/renova/.test(s)) return "RENOVACION";
  if (esPrimera) return "REGISTRO";
  if (tipoOficio(s) || /contest|juicio|recurso|revisi/.test(s)) return "CONTESTACION";
  return "OTRO";
}

/** Trabajo que hace el despacho para atender un oficio (texto de la columna H). */
function esTrabajoDeOficio(t: string) {
  return !!tipoOficio(t) || /contest|\br\.?\s?r\b|\bj\.?\s?n\b|revisi[oó]n|nulidad|recurso|juicio/i.test(t);
}

/**
 * Color de relleno de la columna H ("Trabajado Si/no"):
 * verde = ya se trabajó (trae la fecha) · morado/rosa = falta trabajarlo · azul cielo = lo sube el cliente · rojo = problema.
 */
export function estadoPorColor(argb?: string | null): string | null {
  if (!argb || argb.length < 6) return null;
  const hex = argb.slice(-6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.15) return null; // blanco, gris, negro
  let h = 0;
  if (max === r) h = 60 * (((g - b) / (max - min)) % 6);
  else if (max === g) h = 60 * ((b - r) / (max - min) + 2);
  else h = 60 * ((r - g) / (max - min) + 4);
  if (h < 0) h += 360;
  if (h >= 75 && h < 165) return "HECHO";
  if (h >= 165 && h < 200) return "CLIENTE";
  if (h >= 255 && h < 335) return "PENDIENTE";
  if (h >= 335 || h < 15) return "PROBLEMA";
  if (h >= 45 && h < 75) return "PENDIENTE"; // amarillo: "Pagar en sistema…"
  return null;
}

/**
 * Pagos de una fila del Excel. Col. I = costo (primer pago); col. J = "si" o un segundo pago.
 * Si J trae otra cantidad, el servicio se pagó en 2 partes: costo total = I + J.
 * Cada parte está pagada si su celda está en verde; en blanco o en rojo = no se ha pagado.
 */
export function calcularPagos(f: { costo: number | null; pago: Valor; verdeCosto: boolean; verdePago: boolean }) {
  const txtJ = (texto(f.pago) ?? "").toLowerCase();
  const esSi = /^s[ií]/.test(txtJ);
  const p1 = f.costo ?? 0;
  const montoJ = !esSi && !/^no\b/.test(txtJ) ? numero(f.pago) : null;
  // Segunda parcialidad ("1600", "Faltan $3,600", "Debe $4,200"…). Números chicos (1, 3…) son marcas, no dinero: cuentan como "si".
  const p2 = montoJ != null && montoJ >= 100 ? montoJ : null;
  const marcaJ = montoJ != null && montoJ < 100;
  const p1ok = f.verdeCosto || ((esSi || marcaJ) && f.verdePago);
  const p2ok = p2 != null && f.verdePago;
  const costo = p1 + (p2 ?? 0);
  const pagado = (p1ok ? p1 : 0) + (p2ok ? p2! : 0);
  return {
    costo: costo || null,
    pagado,
    estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
    parcialidad1: f.costo,
    parcialidad1Pagada: p1ok,
    parcialidad2: p2,
    parcialidad2Pagada: p2 != null ? p2ok : null,
  };
}

/** Afina el estado: amarillo = "Pagar en sistema"; morado que dice "PRESENTAR…" = "Presentar". */
function estadoTrabajoDe(base: string | null, argb: string | null | undefined, txt: string | null) {
  const hex = (argb ?? "").slice(-6).toUpperCase();
  if (hex === "FFFF00" || /pagar en sistema/i.test(txt ?? "")) return base === "HECHO" ? "HECHO" : "PAGAR_SISTEMA";
  if (base === "PENDIENTE" && /^\s*presentar/i.test(txt ?? "")) return "PRESENTAR";
  return base;
}

function credenciales(...vals: (string | null)[]) {
  for (const v of vals) {
    if (!v || !v.includes("@")) continue;
    const email = v.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0];
    if (!email) continue;
    const resto = v.replace(email, "").replace(/^[\s/|:-]+|[\s/|:-]+$/g, "").trim();
    return { email: email.toLowerCase(), password: resto || null };
  }
  return null;
}

type Fila = {
  fila: number;
  origen: string | null;
  nombre: string;
  marca: string;
  id: string | null;
  tel: string | null;
  fechaPago: Date | null;
  trabajado: Valor;
  trabajadoTxt: string | null;
  estadoTrabajo: string | null;
  costo: number | null;
  pago: Valor;
  verdeCosto: boolean; // col. I en verde = ese pago está hecho
  verdePago: boolean; // col. J en verde = el segundo pago (o el "si") está hecho
  vendedor: string | null;
  banco: string | null;
  respuesta: string | null;
  notas: string[];
  cred: { email: string; password: string | null } | null;
};

export type ResumenImportacion = {
  filas: number;
  clientes: number;
  expedientes: number;
  servicios: number;
  notificaciones: number;
  conCredenciales: number;
};

export async function importarExcel(db: PrismaClient, archivo: string | Buffer, hoy = new Date()): Promise<ResumenImportacion> {
  const wb = new ExcelJS.Workbook();
  if (typeof archivo === "string") await wb.xlsx.readFile(archivo);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else await wb.xlsx.load(archivo as any);
  const inhabiles = await cargarInhabiles(db);
  const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === "pagos");
  if (!ws) throw new Error('No se encontró la pestaña "Pagos"');

  // Columnas por persona (O–V): la que tiene marca es quien vendió. El encabezado está en la fila 5.
  const encabezados = ws.getRow(5);
  const COLS_VENDEDOR = [15, 16, 17, 18, 19, 20, 21, 22];
  const nombreVendedor = (c: number) => texto(valor(encabezados.getCell(c).value))?.replace(/^Salario\s+/i, "") ?? `Columna ${String.fromCharCode(64 + c)}`;

  const alias = new Map((await db.aliasVendedor.findMany()).map((a) => [a.clave, a.nombre]));
  const conAlias = (v: string | null) => (v ? alias.get(claveVendedor(v)) ?? v : null);

  const filas: Fila[] = [];
  ws.eachRow((row, n) => {
    const g = (c: number) => valor(row.getCell(c).value);
    const num = g(C.num);
    const nombre = texto(g(C.nombre));
    const marca = texto(g(C.marca));
    const idV = g(C.id);
    const id = typeof idV === "number" ? String(Math.round(idV)) : texto(idV)?.match(/^\d{6,8}$/)?.[0] ?? null;
    // Fila válida: con número consecutivo y (cliente + marca) o número de expediente;
    // sin consecutivo, solo si trae número de expediente y algo en la col. H (filas de trabajo agregadas después)
    const conNumero = typeof num === "number" && ((nombre && marca) || id);
    const deTrabajo = !!id && row.getCell(C.trabajado).value != null;
    if (!conNumero && !deTrabajo) return;
    const trabajado = g(C.trabajado);
    const fillH = row.getCell(C.trabajado).fill;
    const argbH = fillH && fillH.type === "pattern" && fillH.pattern === "solid" ? fillH.fgColor?.argb : null;
    const notas2 = texto(g(C.notas2));
    const verde = (c: number) => {
      const fl = row.getCell(c).fill;
      return estadoPorColor(fl && fl.type === "pattern" && fl.pattern === "solid" ? fl.fgColor?.argb : null) === "HECHO";
    };
    filas.push({
      fila: n,
      origen: (texto(g(C.origen))?.length ?? 99) <= 20 ? texto(g(C.origen)) : null, // códigos cortos: T, Y, G…
      nombre: nombre ?? "",
      marca: marca ?? "",
      id,
      tel: texto(g(C.tel)),
      fechaPago: fechaDe(g(C.fechaPago)),
      trabajado,
      trabajadoTxt: texto(trabajado),
      estadoTrabajo: texto(trabajado) ? estadoTrabajoDe(estadoPorColor(argbH), argbH, texto(trabajado)) : null,
      costo: numero(g(C.costo)),
      pago: g(C.pago),
      vendedor: (() => {
        const c = COLS_VENDEDOR.find((col) => {
          const v = valor(row.getCell(col).value);
          return v != null && v !== "" && v !== 0;
        });
        return c ? conAlias(nombreVendedor(c)) : null;
      })(),
      verdeCosto: verde(C.costo),
      verdePago: verde(C.pago),
      banco: texto(g(C.banco))?.toUpperCase() ?? null,
      respuesta: texto(g(C.respuesta)),
      notas: [texto(g(C.titulos)) && `Títulos: ${texto(g(C.titulos))}`, texto(g(C.vigencia)), texto(g(C.notas)), notas2 && !notas2.includes("@") ? notas2 : null].filter(Boolean) as string[],
      cred: credenciales(texto(g(C.credenciales)), notas2),
    });
  });

  // Agrupar filas por expediente (número del IMPI, o cliente+marca si aún no tiene)
  const grupos = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = f.id ?? `${normalizarNombre(f.nombre)}|${normalizarNombre(f.marca)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }

  const resumen: ResumenImportacion = { filas: filas.length, clientes: 0, expedientes: 0, servicios: 0, notificaciones: 0, conCredenciales: 0 };

  // Clientes: se crean todos de una vez (mucho más rápido con la base en internet)
  const nuevosClientes = new Map<string, { nombre: string; nombreNorm: string; telefono: string | null; email: string | null }>();
  for (const grupo of grupos.values()) {
    const nombre = grupo.find((f) => f.nombre)?.nombre;
    if (!nombre) continue;
    const nombreNorm = normalizarNombre(nombre);
    if (!nuevosClientes.has(nombreNorm)) {
      const cred = grupo.map((f) => f.cred).filter(Boolean).pop() ?? null;
      nuevosClientes.set(nombreNorm, { nombre, nombreNorm, telefono: grupo.map((f) => f.tel).find(Boolean) ?? null, email: cred?.email ?? null });
    }
  }
  const creados = await db.cliente.createMany({ data: [...nuevosClientes.values()], skipDuplicates: true });
  resumen.clientes = creados.count;
  const clientes = new Map((await db.cliente.findMany({ select: { id: true, nombreNorm: true } })).map((c) => [c.nombreNorm, c.id]));

  const procesar = async (grupo: Fila[]) => {
    const primera = grupo[0];
    const nombreCliente = grupo.find((f) => f.nombre)?.nombre;
    const denominacion = grupo.find((f) => f.marca)?.marca;
    if (!nombreCliente || !denominacion) return; // expediente sin cliente o sin marca identificable
    const nombreNorm = normalizarNombre(nombreCliente);
    const cred = grupo.map((f) => f.cred).filter(Boolean).pop() ?? null;
    const clienteId = clientes.get(nombreNorm)!;

    // Fechas y estatus del expediente
    let fechaPresentacion: Date | null = null;
    let fechaConcesion: Date | null = null;
    let numeroRegistro: string | null = null;
    const eventos: { fecha: Date; titulo: string; detalle?: string }[] = [];

    for (const f of grupo) {
      const tt = f.trabajadoTxt ?? "";
      for (const t of [tt, f.respuesta ?? ""]) {
        const reg = t.match(/(?:registro|reg\.?)\s*(?:no\.?|num\.?|#)?\s*(\d{6,8})/i);
        if (reg) numeroRegistro = reg[1];
        const fc = fechaEnTexto(t);
        if (fc && /concesi|\bcon\b/i.test(t)) fechaConcesion = fc;
        if (fc && /vigencia/i.test(t)) fechaConcesion = sumarMeses(fc, -120);
      }
      if (!fechaPresentacion && f === primera) {
        if (f.trabajado instanceof Date) fechaPresentacion = fechaDe(f.trabajado);
        else if (!/concesi|vigencia/i.test(tt)) fechaPresentacion = fechaEnTexto(tt);
      }
      if (f.fechaPago) eventos.push({ fecha: f.fechaPago, titulo: "Contratación / pago", detalle: f.costo ? `$${f.costo}` : undefined });
      if (f.trabajado instanceof Date) eventos.push({ fecha: fechaDe(f.trabajado)!, titulo: "Trámite presentado" });
      else if (tt && fechaEnTexto(tt)) eventos.push({ fecha: fechaEnTexto(tt)!, titulo: tt });
      if (f.respuesta && fechaEnTexto(f.respuesta)) eventos.push({ fecha: fechaEnTexto(f.respuesta)!, titulo: f.respuesta });
    }

    // Último estatus: lo que contestó la autoridad (col. X); la col. H solo si no es un trabajo de contestación
    const ultimoTexto =
      [...grupo].reverse()
        .map((f) => f.respuesta ?? (f.trabajadoTxt && !(f !== primera && esTrabajoDeOficio(f.trabajadoTxt)) ? f.trabajadoTxt : null))
        .find((t) => t && !/^\d{4}-\d{2}-\d{2}$/.test(t)) ?? null;
    let etapa = (ultimoTexto && etapaDesdeTexto(ultimoTexto)) ?? null;
    if ((!etapa || etapa === "CON_OFICIO") && (numeroRegistro || fechaConcesion) && ultimoTexto && /ddu|renova|vigencia|registro/i.test(ultimoTexto)) etapa = "CONCEDIDA";
    if (!etapa) etapa = numeroRegistro || fechaConcesion ? "CONCEDIDA" : fechaPresentacion || primera.id ? "EN_TRAMITE" : "POR_PRESENTAR";

    const data = {
      clienteId,
      denominacion,
      numeroRegistro,
      etapa,
      fechaPresentacion,
      fechaConcesion,
      ultimoEstatus: ultimoTexto,
      impiUsuario: cred?.email ?? null,
      impiPasswordEnc: cred?.password ? cifrar(cred.password) : null,
      notas: [...new Set(grupo.flatMap((f) => f.notas))].join("\n") || null,
    };
    if (cred) resumen.conCredenciales++;

    // Sin número del IMPI: se identifica por cliente + denominación (antes se duplicaba en cada importación)
    const sinNumero = primera.id
      ? null
      : await db.expediente.findFirst({ where: { clienteId, numeroExpediente: null, denominacion: { equals: denominacion, mode: "insensitive" } }, orderBy: { creado: "asc" } });
    const exp = primera.id
      ? await (async () => {
          // Estatus fijado a mano por el admin: se respeta
          const previo = await db.expediente.findUnique({ where: { numeroExpediente: primera.id! }, select: { etapa: true, etapaManual: true } });
          const d = previo?.etapaManual ? { ...data, etapa: previo.etapa } : data;
          return db.expediente.upsert({ where: { numeroExpediente: primera.id! }, update: d, create: { ...data, numeroExpediente: primera.id } });
        })()
      : sinNumero
        ? await db.expediente.update({ where: { id: sinNumero.id }, data: sinNumero.etapaManual ? { ...data, etapa: sinNumero.etapa } : data })
        : await db.expediente.create({ data });
    resumen.expedientes++;

    // Reimportar sin duplicar: se reemplazan servicios y eventos que vienen del Excel
    // (lo editado en la app se conserva)
    await db.servicio.deleteMany({ where: { expedienteId: exp.id, filaExcel: { not: null }, editadoEnApp: false } });
    await db.evento.deleteMany({ where: { expedienteId: exp.id, importado: true } });
    const editados = await db.servicio.findMany({ where: { expedienteId: exp.id, filaExcel: { not: null }, editadoEnApp: true } });
    // Cobros dados de alta en la app: si el Excel trae el mismo (misma marca y fecha), se queda el de la app
    const deLaApp = await db.servicio.findMany({ where: { expedienteId: exp.id, filaExcel: null }, select: { fechaContratacion: true, costo: true } });
    const mismaFecha = (a: Date | null, b: Date | null) => !!a && !!b && a.getTime() === b.getTime();

    for (const [i, f] of grupo.entries()) {
      if (editados.some((s) => s.filaExcel === f.fila || mismaFecha(s.fechaContratacion, f.fechaPago))) continue;
      // (si la fila del Excel no trae fecha, se compara por costo)
      if (deLaApp.some((s) => mismaFecha(s.fechaContratacion, f.fechaPago) || (!f.fechaPago && s.costo != null && s.costo === calcularPagos(f).costo))) continue;
      const pagos = calcularPagos(f);
      await db.servicio.create({
        data: {
          expedienteId: exp.id,
          tipo:
            i > 0 && f.trabajado instanceof Date && grupo.slice(0, i).some((p) => p.respuesta && tipoOficio(p.respuesta))
              ? "CONTESTACION"
              : tipoServicio(`${f.trabajadoTxt ?? ""} ${f.respuesta ?? ""}`, i === 0),
          fechaContratacion: f.fechaPago,
          ...pagos,
          banco: f.banco,
          origenVenta: f.origen,
          vendedor: f.vendedor,
          avance: f.trabajadoTxt,
          estadoTrabajo: f.estadoTrabajo,
          respuestaImpi: f.respuesta,
          notas: f.notas.join("\n") || null,
          filaExcel: f.fila,
        },
      });
      resumen.servicios++;
    }

    if (eventos.length) {
      await db.evento.createMany({ data: eventos.map((e) => ({ ...e, expedienteId: exp.id, importado: true })) });
    }

    // ── Notificaciones (oficios) ──
    // El oficio sale de la col. X ("¿Qué contestó la autoridad?"). Su avance sale de la fila de
    // contestación (col. H): verde = contestada, morado = pagada y por trabajar, azul = la sube el cliente,
    // rojo = problema / no se presentó. Lo creado o movido en la app no se toca.
    // Se conservan las tarjetas movidas en la app y las verificadas con MARCanet (tienen número de oficio)
    await db.notificacion.deleteMany({ where: { expedienteId: exp.id, editadoEnApp: false, numeroOficio: null } });
    const conservadas = await db.notificacion.findMany({ where: { expedienteId: exp.id }, select: { tipo: true, fechaNotificacion: true, numeroOficio: true } });
    const yaEnApp = (tipo: string, f: Date) =>
      conservadas.some((n) => n.tipo === tipo && Math.abs(n.fechaNotificacion.getTime() - f.getTime()) <= (n.numeroOficio ? 20 : 3) * 864e5);
    const pagadoDe = (f: Fila) => calcularPagos(f).pagado;
    const usadas = new Set<number>();

    const crear = async (tipo: string, fNotif: Date, origen: string, trabajo: Fila | null) => {
      if (etapa === "ABANDONADA" || yaEnApp(tipo, fNotif)) return;
      const plazos = plazosDeOficio(tipo, fNotif, inhabiles);
      let estado = "RECIBIDA";
      let fechaContestacion: Date | null = null;
      let fechaPago: Date | null = null;
      let nota = `Importado del Excel: "${origen}"`;
      if (trabajo) {
        usadas.add(trabajo.fila);
        // pendientes o con problema cuyo plazo venció hace más de 4 meses: ya no se muestran
        if (trabajo.estadoTrabajo !== "HECHO" && trabajo.estadoTrabajo !== "CLIENTE" && diasRestantes(plazos.fechaLimite, hoy) < -120) return;
        const t = trabajo.trabajadoTxt ?? "";
        nota += ` · col. H: "${t}"`;
        fechaPago = pagadoDe(trabajo) > 0 ? trabajo.fechaPago : null;
        if (trabajo.estadoTrabajo === "HECHO") {
          estado = "CONTESTADA";
          const ft = fechaEnTexto(t) ?? (trabajo.trabajado instanceof Date ? fechaDe(trabajo.trabajado) : null);
          fechaContestacion = ft && ft >= fNotif ? ft : trabajo.fechaPago;
        } else if (trabajo.estadoTrabajo === "CLIENTE") {
          estado = "CONTESTADA";
          nota += " · lo presenta el cliente";
        } else if (trabajo.estadoTrabajo === "PROBLEMA") {
          estado = "NO_PAGO";
        } else if (trabajo.estadoTrabajo === "PAGAR_SISTEMA") {
          estado = "PAGAR_SISTEMA";
        } else {
          estado = fechaPago ? "EN_TRABAJO" : "AVISADO";
        }
      } else if (etapa === "CONCEDIDA" || diasRestantes(plazos.fechaLimite, hoy) < -15) {
        return; // oficio viejo sin trabajo registrado: no se crea tarjeta
      }
      const medio = estado === "CONTESTADA" && trabajo && (tipo === "NEGATIVA" || tipo === "CONFIRMA_ACTO")
        ? (/j\.?\s?n|nulidad|juicio/i.test(trabajo.trabajadoTxt ?? "") ? "NULIDAD" : /r\.?\s?r|revisi|recurso/i.test(trabajo.trabajadoTxt ?? "") ? "REVISION" : null)
        : null;
      await db.notificacion.create({
        data: { expedienteId: exp.id, tipo, fechaNotificacion: fNotif, ...plazos, estado, fechaPago, fechaContestacion, medioDefensa: medio, notas: nota },
      });
      resumen.notificaciones++;
    };

    // a) El oficio más reciente que contestó la autoridad (col. X) y la fila de trabajo que le corresponde
    const conOficio = grupo.filter((f) => f.respuesta && tipoOficio(f.respuesta) && fechaEnTexto(f.respuesta) && !/contest|ya se/i.test(f.respuesta));
    const oficio = conOficio[conOficio.length - 1];
    const oficioVigente = oficio && ultimoTexto && (ultimoTexto === oficio.respuesta || !etapaDesdeTexto(ultimoTexto) || etapaDesdeTexto(ultimoTexto) === "CON_OFICIO" || etapaDesdeTexto(ultimoTexto) === "NEGATIVA" || etapaDesdeTexto(ultimoTexto) === "EN_JUICIO");
    if (oficio && oficioVigente) {
      const fNotif = fechaEnTexto(oficio.respuesta)!;
      const tipo = tipoOficio(oficio.respuesta!)!;
      const claveFecha = (d: Date) => [d.getUTCDate(), d.getUTCMonth() + 1].map((n) => String(n).padStart(2, "0")).join("/");
      const trabajos = grupo.filter(
        (f) =>
          f !== primera &&
          f.trabajadoTxt &&
          f.estadoTrabajo &&
          // texto de contestación ("Hacer Ant…", "R.R.", "J.N.") o solo la fecha en que se presentó
          (esTrabajoDeOficio(f.trabajadoTxt) || f.trabajado instanceof Date || /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/.test(f.trabajadoTxt)) &&
          !/\bddu\b|renova|marca\b/i.test(f.trabajadoTxt) &&
          (f.trabajadoTxt.includes(claveFecha(fNotif)) ||
            [f.fechaPago, f.trabajado instanceof Date ? fechaDe(f.trabajado) : fechaEnTexto(f.trabajadoTxt)].some((d) => d && d.getTime() >= fNotif.getTime() - 3 * 864e5))
      );
      await crear(tipo, fNotif, oficio.respuesta!, trabajos[trabajos.length - 1] ?? null);
    }

    // b) Trabajos pendientes (morado) de otros oficios que no quedaron ligados arriba
    for (const f of grupo) {
      if (usadas.has(f.fila) || f.estadoTrabajo !== "PENDIENTE" || !f.trabajadoTxt || /\bddu\b|renova/i.test(f.trabajadoTxt)) continue;
      const tipo = tipoOficio(f.trabajadoTxt);
      const fNotif = fechaEnTexto(f.trabajadoTxt);
      if (tipo && fNotif) await crear(tipo, fNotif, f.trabajadoTxt, f);
    }
  };

  // Varias marcas a la vez (cada una es independiente)
  const lista = [...grupos.values()];
  let siguiente = 0;
  let hechos = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (siguiente < lista.length) {
        const g = lista[siguiente++];
        await procesar(g);
        if (++hechos % 250 === 0) console.log(`  ${hechos}/${lista.length}`);
      }
    })
  );

  return resumen;
}
