// Sincroniza los expedientes con MARCanet: guarda oficios, promociones y trámites, y actualiza el tablero de notificaciones.
import { textoPlazo } from "../estado-oficio";
import type { Expediente, PrismaClient } from "@prisma/client";
import { db as dbDefault } from "../db";
import { cargarInhabiles } from "../inhabiles";
import { DIA, diasRestantes, plazosDeOficio, type Inhabiles } from "../plazos";
import { TIPOS_OFICIO, TIPOS_SIGNO } from "../catalogos";
import { consultarMarcanet, MarcanetCuotaError, MarcanetError, type ExpedienteMarcanet } from "./consulta";

/** Tipo de oficio de la app a partir de la descripción del IMPI. null = no genera tarjeta (trámite interno o desconocido). */
export function tipoDesdeImpi(descripcion: string): string | null {
  const d = descripcion.toUpperCase();
  if (/ARCHIVO FON[EÉ]TICO|EXAMEN FIGURATIVO/.test(d)) return null;
  if (/CONFIRMA EL ACTO/.test(d)) return "CONFIRMA_ACTO";
  if (/NEGATIVA/.test(d)) return "NEGATIVA";
  if (/ANTERIORIDAD/.test(d)) return "ANTERIORIDAD";
  if (/IMPEDIMENTO/.test(d)) return "IMPEDIMENTO";
  if (/PAGO/.test(d) && /REQUI|REQUER/.test(d)) return "REQ_PAGO";
  if (/OPOSICI|ALEGATO/.test(d)) return "ALEGATOS";
  if (/REQUISITO|REQUERIMIENTO|SUSPENS/.test(d)) return "REQUERIMIENTO";
  return null;
}

const esConcesion = (d: string) => /CONCESI[OÓ]N|T[IÍ]TULO DE REGISTRO|SE OTORGA/i.test(d);
const VENTANA_LIGA = 20 * DIA; // tolerancia para ligar una tarjeta del Excel con el oficio real

export type ResultadoExpediente = { nuevos: number; contestados: number; porRevisar: string[] };

const INTERNO = /ARCHIVO FON[EÉ]TICO|EXAMEN FIGURATIVO/i;

/**
 * Última actualización del expediente: lo más reciente entre los oficios (lo que contestó el IMPI)
 * y las promociones / recursos (lo que presentó el despacho) de "Solicitud de registro" y "Recurso de revisión".
 */
export function ultimaActualizacion(r: ExpedienteMarcanet) {
  const items: { fecha: Date; texto: string; de: "IMPI" | "DESPACHO" }[] = [];
  for (const o of r.oficios) {
    if (INTERNO.test(o.descripcion)) continue;
    const f = o.fechaNotificacion ?? o.fechaOficio;
    if (f) items.push({ fecha: f, de: "IMPI", texto: `${o.descripcion}${o.fechaNotificacion ? "" : " (aún sin notificar)"}` });
  }
  for (const p of r.promociones) if (p.fechaPresentacion) items.push({ fecha: p.fechaPresentacion, de: "DESPACHO", texto: p.descripcion });
  for (const t of r.tramites) if (/RECURSO DE REVISI/i.test(t.descripcion) && t.fechaInicio) items.push({ fecha: t.fechaInicio, de: "DESPACHO", texto: "RECURSO DE REVISIÓN" });
  // Si hay empate de fecha, gana lo que contestó el IMPI
  return items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime() || (a.de === "IMPI" ? -1 : 1))[0] ?? null;
}

async function guardarDatos(db: PrismaClient, exp: Expediente, r: ExpedienteMarcanet) {
  const antes = new Set((await db.oficioImpi.findMany({ where: { expedienteId: exp.id }, select: { numero: true } })).map((o) => o.numero));
  for (const t of r.tramites) {
    await db.tramiteImpi.upsert({
      where: { expedienteId_folio_anio: { expedienteId: exp.id, folio: t.folio, anio: t.anio } },
      update: { descripcion: t.descripcion, fechaInicio: t.fechaInicio, fechaConclusion: t.fechaConclusion },
      create: { expedienteId: exp.id, ...t },
    });
  }
  for (const o of r.oficios) {
    const data = { descripcion: o.descripcion, tramite: o.tramite, fechaOficio: o.fechaOficio, estadoNotificacion: o.estadoNotificacion || null, fechaNotificacion: o.fechaNotificacion };
    await db.oficioImpi.upsert({ where: { numero: o.numero }, update: data, create: { expedienteId: exp.id, numero: o.numero, ...data } });
  }
  for (const p of r.promociones) {
    await db.promocionImpi.upsert({
      where: { expedienteId_folio_anio: { expedienteId: exp.id, folio: p.folio, anio: p.anio } },
      update: { fechaPresentacion: p.fechaPresentacion, oficioRelacionado: p.oficioRelacionado, descripcion: p.descripcion, tramite: p.tramite },
      create: { expedienteId: exp.id, ...p },
    });
  }
  return antes;
}

export async function sincronizarExpediente(db: PrismaClient, exp: Expediente, inhabiles: Inhabiles, hoy = new Date()): Promise<ResultadoExpediente> {
  const r = await consultarMarcanet(exp.numeroExpediente!);
  const conocidos = await guardarDatos(db, exp, r);
  const res: ResultadoExpediente = { nuevos: 0, contestados: 0, porRevisar: [] };

  // Datos del expediente
  const ultima = ultimaActualizacion(r);
  const concedida = r.fechaConcesion || r.numeroRegistro || r.oficios.some((o) => esConcesion(o.descripcion) && o.fechaNotificacion);
  // "Se considera abandonado el trámite…" notificado (y sin concesión): la marca queda abandonada
  const abandonada = !concedida && r.oficios.some((o) => /ABANDONAD/i.test(o.descripcion) && o.fechaNotificacion);
  await db.expediente.update({
    where: { id: exp.id },
    data: {
      marcanetSync: new Date(),
      marcanetError: null,
      ...(ultima && { ultimaActImpi: ultima.texto, ultimaActImpiFecha: ultima.fecha, ultimaActImpiDe: ultima.de }),
      ...(r.numeroRegistro && { numeroRegistro: r.numeroRegistro }),
      ...(r.fechaConcesion && { fechaConcesion: r.fechaConcesion }),
      ...(!exp.fechaPresentacion && r.fechaPresentacion && { fechaPresentacion: r.fechaPresentacion }),
      ...(concedida && exp.etapa !== "CONCEDIDA" && { etapa: "CONCEDIDA" }),
      ...(abandonada && !exp.etapaManual && exp.etapa !== "ABANDONADA" && { etapa: "ABANDONADA" }),
    },
  });

  // Oficios notificados → tablero
  for (const o of r.oficios) {
    const tipo = tipoDesdeImpi(o.descripcion);
    if (!o.fechaNotificacion) {
      // Emitido pero sin notificar: si el Excel ya tenía la tarjeta, se liga y se marca que el plazo aún no corre
      if (!tipo || !o.fechaOficio) continue;
      const ya = await db.notificacion.findUnique({ where: { numeroOficio: o.numero } });
      const candidata = ya ?? (await db.notificacion.findMany({ where: { expedienteId: exp.id, tipo, numeroOficio: null } }))
        .find((c) => c.fechaNotificacion.getTime() >= o.fechaOficio!.getTime() - VENTANA_LIGA && c.fechaNotificacion.getTime() <= o.fechaOficio!.getTime() + 2 * VENTANA_LIGA);
      if (candidata) await db.notificacion.update({ where: { id: candidata.id }, data: { numeroOficio: o.numero, pendienteNotificar: true, notas: `IMPI: oficio ${o.numero} del ${o.fechaOficio.toISOString().slice(0, 10)}, aún sin notificar · ${o.estadoNotificacion}` } });
      continue;
    }
    if (!tipo) {
      if (!conocidos.has(o.numero) && !esConcesion(o.descripcion) && !/ABANDONAD/i.test(o.descripcion)) res.porRevisar.push(o.descripcion);
      continue;
    }
    const fNotif = o.fechaNotificacion;

    // ¿Ya se contestó ante el IMPI? (promoción ligada al oficio; en negativas, también un recurso de revisión posterior)
    const promo = r.promociones
      .filter((p) => p.oficioRelacionado === o.numero && p.fechaPresentacion)
      .sort((a, b) => a.fechaPresentacion!.getTime() - b.fechaPresentacion!.getTime())[0];
    const revision = tipo === "NEGATIVA" ? r.tramites.find((t) => /RECURSO DE REVISI/i.test(t.descripcion) && t.fechaInicio && t.fechaInicio >= fNotif) : undefined;
    const contestacion = promo
      ? { fecha: promo.fechaPresentacion!, detalle: `${promo.descripcion} (folio ${promo.folio}/${promo.anio})`, medio: null as string | null }
      : revision
        ? { fecha: revision.fechaInicio!, detalle: `Recurso de revisión (folio ${revision.folio}/${revision.anio})`, medio: "REVISION" }
        : null;

    // Tarjeta existente: ligada por número de oficio o, si viene del Excel, por tipo y fecha cercana
    let n = await db.notificacion.findUnique({ where: { numeroOficio: o.numero } });
    if (!n) {
      const candidatas = await db.notificacion.findMany({ where: { expedienteId: exp.id, tipo, numeroOficio: null } });
      n = candidatas
        .filter((c) => Math.abs(c.fechaNotificacion.getTime() - fNotif.getTime()) <= VENTANA_LIGA)
        .sort((a, b) => Math.abs(a.fechaNotificacion.getTime() - fNotif.getTime()) - Math.abs(b.fechaNotificacion.getTime() - fNotif.getTime()))[0] ?? null;
    }
    const plazos = plazosDeOficio(tipo, fNotif, inhabiles);

    if (n) {
      const cambios: Record<string, unknown> = { numeroOficio: o.numero, fechaNotificacion: fNotif, pendienteNotificar: false, ...(n.limiteManual ? {} : plazos) };
      if (contestacion && n.estado !== "CONTESTADA") {
        Object.assign(cambios, { estado: "CONTESTADA", fechaContestacion: contestacion.fecha, ...(contestacion.medio && { medioDefensa: contestacion.medio }) });
        res.contestados++;
        await db.evento.create({ data: { expedienteId: exp.id, fecha: contestacion.fecha, titulo: `IMPI registra la contestación de ${TIPOS_OFICIO[tipo].toLowerCase()}`, detalle: contestacion.detalle, autor: "MARCanet" } });
      }
      await db.notificacion.update({ where: { id: n.id }, data: cambios });
      // El cobro de esa contestación también queda como trabajado (mismo estatus en toda la app)
      if (contestacion) await db.servicio.updateMany({ where: { notificacionId: n.id, estadoTrabajo: { in: ["PENDIENTE", "PRESENTAR", "PAGAR_SISTEMA"] } }, data: { estadoTrabajo: "HECHO" } });
      continue;
    }

    // Oficio que la app no tenía
    if (contestacion) {
      if (diasRestantes(contestacion.fecha, hoy) < -60) continue; // historia vieja: no hace falta tarjeta
      await db.notificacion.create({
        data: {
          expedienteId: exp.id, tipo, fechaNotificacion: fNotif, ...plazos, numeroOficio: o.numero, fuente: "MARCANET",
          estado: "CONTESTADA", fechaContestacion: contestacion.fecha, medioDefensa: contestacion.medio,
          notas: `MARCanet: ${o.descripcion} · oficio ${o.numero} · ${contestacion.detalle}`,
        },
      });
      continue;
    }
    if (diasRestantes(plazos.fechaLimite, hoy) < -15) continue; // vencido hace tiempo y sin contestación: no se crea tarjeta
    // El cliente ya no quiere continuar: se registra el oficio, pero no entra al tablero
    if (exp.desistio) {
      await db.notificacion.create({
        data: {
          expedienteId: exp.id, tipo, fechaNotificacion: fNotif, ...plazos, numeroOficio: o.numero, fuente: "MARCANET", estado: "CERRADA",
          notas: `MARCanet: ${o.descripcion} · oficio ${o.numero} · el cliente ya no quiere continuar`,
        },
      });
      await db.evento.create({ data: { expedienteId: exp.id, fecha: fNotif, titulo: `MARCanet: ${TIPOS_OFICIO[tipo]} (no se atiende: el cliente ya no quiere continuar)`, detalle: `${o.descripcion} · oficio ${o.numero}`, autor: "MARCanet" } });
      continue;
    }
    await db.notificacion.create({
      data: {
        expedienteId: exp.id, tipo, fechaNotificacion: fNotif, ...plazos, numeroOficio: o.numero, fuente: "MARCANET",
        notas: `MARCanet: ${o.descripcion} · oficio ${o.numero} del ${o.fechaOficio?.toISOString().slice(0, 10) ?? "s/f"} · ${o.estadoNotificacion}`,
      },
    });
    await db.expediente.update({ where: { id: exp.id }, data: { etapa: tipo === "NEGATIVA" || tipo === "CONFIRMA_ACTO" ? "NEGATIVA" : "CON_OFICIO", ultimoEstatus: `${TIPOS_OFICIO[tipo]} notificado ${fNotif.toISOString().slice(0, 10)} (MARCanet)` } });
    await db.evento.create({ data: { expedienteId: exp.id, fecha: fNotif, titulo: `Nuevo oficio detectado en MARCanet: ${TIPOS_OFICIO[tipo]}`, detalle: `${o.descripcion} · oficio ${o.numero} · ${textoPlazo({ tipo, fechaNotificacion: fNotif, ...plazos })}`, autor: "MARCanet" } });
    res.nuevos++;
  }
  return res;
}

/**
 * Expedientes a consultar, en orden de prioridad:
 * 1) con oficios en curso, 2) en trámite / con oficio / en juicio / negativas recientes (los que llevan más tiempo sin revisar primero),
 * 3) el resto por turnos. La corrida se corta por tiempo, así que lo prioritario siempre entra.
 */
export async function expedientesParaHoy(db: PrismaClient, rotacion = 150) {
  const hace2Anios = new Date(Date.now() - 730 * DIA);
  const conNumero = { numeroExpediente: { not: null }, tipo: { in: TIPOS_SIGNO } }; // patentes y diseños no están en MARCanet
  const enCurso = await db.expediente.findMany({
    where: { ...conNumero, notificaciones: { some: { estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] } } } },
    orderBy: { marcanetSync: { sort: "asc", nulls: "first" } },
  });
  const idsEnCurso = new Set(enCurso.map((e) => e.id));
  const activos = [
    ...enCurso,
    ...(
      await db.expediente.findMany({
        where: {
          ...conNumero,
          OR: [
            { etapa: { in: ["EN_TRAMITE", "CON_OFICIO", "EN_JUICIO"] } },
            { etapa: "NEGATIVA", OR: [{ fechaPresentacion: { gte: hace2Anios } }, { fechaPresentacion: null }] },
          ],
        },
        orderBy: { marcanetSync: { sort: "asc", nulls: "first" } },
      })
    ).filter((e) => !idsEnCurso.has(e.id)),
  ];
  const ids = new Set(activos.map((e) => e.id));
  const resto = (
    await db.expediente.findMany({ where: conNumero, orderBy: { marcanetSync: { sort: "asc", nulls: "first" } }, take: ids.size + rotacion })
  )
    .filter((e) => !ids.has(e.id))
    .slice(0, rotacion);
  return [...activos, ...resto].filter((e) => /^\d{5,8}$/.test(e.numeroExpediente ?? ""));
}

const ESPERA_CUOTA_MS = 11 * 60 * 1000; // MARCanet pide esperar 10 minutos

/** Corre la sincronización y deja registro en SyncMarcanet. `horasMax` corta la corrida (la nocturna dura de 1 a 6 a.m. aprox.). */
export async function sincronizarMarcanet(opciones: { modo: string; expedientes?: Expediente[]; db?: PrismaClient; horasMax?: number; barrido?: Date; alAvanzar?: (i: number, total: number) => void }) {
  const limite = Date.now() + (opciones.horasMax ?? 5) * 3600 * 1000;
  const db = opciones.db ?? dbDefault;
  // Corrida en curso (las de GitHub duran máx. 5.5 h; una que lleva más de 6 h se da por terminada)
  const enCurso = await db.syncMarcanet.findFirst({ where: { fin: null, inicio: { gte: new Date(Date.now() - 6 * 3600 * 1000) } } });
  if (enCurso && opciones.modo !== "EXPEDIENTE") throw new MarcanetError("Ya hay una actualización con MARCanet en curso");

  const lista = opciones.expedientes ?? (await expedientesParaHoy(db));
  const inhabiles = await cargarInhabiles(db);
  const sync = await db.syncMarcanet.create({ data: { modo: opciones.modo, total: lista.length, barrido: opciones.barrido ?? null } });
  const porRevisar = new Set<string>();
  let consecutivos = 0;
  const t = { consultados: 0, errores: 0, nuevos: 0, contestados: 0, total: lista.length };
  let mensaje: string | null = null;

  let esperas = 0;
  for (let i = 0; i < lista.length; i++) {
    const exp = lista[i];
    if (Date.now() > limite) {
      mensaje = `Se alcanzó el tiempo máximo; ${lista.length - i} expedientes quedan para la próxima corrida`;
      break;
    }
    // El administrador detuvo la búsqueda completa con el tache, o pidió revisar ya los oficios en curso (se atiende y luego sigue)
    if (opciones.modo === "BARRIDO" && i % 5 === 0 && i > 0) {
      const c = await db.configuracion.findUnique({ where: { id: "main" }, select: { barridoPausa: true, solicitudActivos: true, solicitudMarcas: true } });
      if (c?.barridoPausa) {
        mensaje = `Detenida por el administrador; ${lista.length - i} marcas quedan pendientes`;
        break;
      }
      if (c?.solicitudActivos || c?.solicitudMarcas) {
        mensaje = `Pausa para revisar los oficios en curso que se pidieron desde la app; sigue en el siguiente bloque (${lista.length - i} pendientes)`;
        break;
      }
    }
    try {
      const r = await sincronizarExpediente(db, exp, inhabiles);
      t.consultados++;
      t.nuevos += r.nuevos;
      t.contestados += r.contestados;
      r.porRevisar.forEach((d) => porRevisar.add(d));
      consecutivos = 0;
    } catch (e) {
      // Cuota de MARCanet: se respeta esperando lo que pide y se reintenta el mismo expediente
      if (e instanceof MarcanetCuotaError) {
        if (opciones.modo === "EXPEDIENTE" || Date.now() + ESPERA_CUOTA_MS > limite) {
          mensaje = e.message;
          break;
        }
        esperas++;
        await db.syncMarcanet.update({ where: { id: sync.id }, data: { ...t, mensaje: `Esperando cuota de MARCanet (${esperas})…` } });
        await new Promise((r) => setTimeout(r, ESPERA_CUOTA_MS));
        i--;
        continue;
      }
      t.errores++;
      consecutivos++;
      const msg = e instanceof Error ? e.message : String(e);
      await db.expediente.update({ where: { id: exp.id }, data: { marcanetError: msg, marcanetSync: new Date() } });
      if (/captcha/i.test(msg) || consecutivos >= 10) {
        mensaje = `Se detuvo: ${msg}${consecutivos >= 10 ? " (10 errores seguidos; MARCanet podría estar caído)" : ""}`;
        break;
      }
    }
    if (i % 10 === 9) await db.syncMarcanet.update({ where: { id: sync.id }, data: t });
    t.total = lista.length;
    opciones.alAvanzar?.(i + 1, lista.length);
  }
  if (esperas) mensaje = [mensaje, `Se esperó ${esperas} vez/veces por la cuota de MARCanet`].filter(Boolean).join(" — ");
  if (porRevisar.size) mensaje = [mensaje, `Oficios nuevos sin clasificar: ${[...porRevisar].join(" · ")}`].filter(Boolean).join(" — ");
  return db.syncMarcanet.update({ where: { id: sync.id }, data: { ...t, fin: new Date(), mensaje } });
}
