"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requerirAdmin, requerirSesion } from "@/lib/auth";
import { cifrar, descifrar } from "@/lib/crypto";
import { plazosDeOficio } from "@/lib/plazos";
import { cargarInhabiles, recalcularPlazos } from "@/lib/inhabiles";
import { ESTADOS_TRABAJO, ETAPAS, claveVendedor, normalizarNombre, TIPOS_OFICIO } from "@/lib/catalogos";
import { enviarResumen } from "@/lib/alertas";
import { expedientesParaHoy, sincronizarExpediente, sincronizarMarcanet } from "@/lib/marcanet/sincronizar";
import { MarcanetCuotaError } from "@/lib/marcanet/consulta";
import { estadoBarrido } from "@/lib/marcanet/estado";
import { PASOS_OFICIO, aplicarPasoOficio, sincronizarDesdeCobro, textoPlazo } from "@/lib/estado-oficio";

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v || null;
};
const num = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? Number(v.replace(/[$,\s]/g, "")) : null;
};
/** "2026-10-13" → medianoche UTC */
const fecha = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? new Date(`${v}T00:00:00Z`) : null;
};
const hoyUTC = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

function refrescar(expedienteId?: string) {
  revalidatePath("/", "layout");
  if (expedienteId) revalidatePath(`/expedientes/${expedienteId}`);
}

// ───────────── Notificaciones ─────────────

export async function crearNotificacion(form: FormData) {
  await requerirSesion();
  const expedienteId = str(form, "expedienteId");
  const tipo = str(form, "tipo") ?? "OTRO";
  const fNotif = fecha(form, "fechaNotificacion");
  if (!expedienteId || !fNotif) throw new Error("Faltan datos");
  const plazos = plazosDeOficio(tipo, fNotif, await cargarInhabiles());
  const manual = fecha(form, "fechaLimite");
  const nueva = await db.notificacion.create({
    data: { editadoEnApp: true, expedienteId, tipo, fechaNotificacion: fNotif, ...plazos, ...(manual && { fechaLimite: manual, limiteManual: true }), notas: str(form, "notas") },
  });
  await db.expediente.update({
    where: { id: expedienteId },
    data: { etapa: tipo === "NEGATIVA" || tipo === "CONFIRMA_ACTO" ? "NEGATIVA" : "CON_OFICIO", ultimoEstatus: `${TIPOS_OFICIO[tipo]} ${fNotif.toISOString().slice(0, 10)}` },
  });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId, fecha: fNotif, titulo: `Notificación IMPI: ${TIPOS_OFICIO[tipo]}`, detalle: [textoPlazo(nueva), str(form, "notas")].filter(Boolean).join(" · ") } });
  refrescar(expedienteId);
}

export async function avisarCliente(form: FormData) {
  const sesion = await requerirSesion();
  const n = await aplicarPasoOficio(db, str(form, "id")!, "AVISADO", { fecha: fecha(form, "fecha"), monto: num(form, "monto") }, sesion.nombre);
  refrescar(n.expedienteId);
}

export async function registrarPagoNotificacion(form: FormData) {
  const sesion = await requerirSesion();
  const n = await aplicarPasoOficio(db, str(form, "id")!, "EN_TRABAJO", { fecha: fecha(form, "fecha"), monto: num(form, "monto"), banco: str(form, "banco") }, sesion.nombre);
  refrescar(n.expedienteId);
}

export async function marcarContestada(form: FormData) {
  const sesion = await requerirSesion();
  const n = await aplicarPasoOficio(db, str(form, "id")!, "CONTESTADA", { fecha: fecha(form, "fecha"), medio: str(form, "medioDefensa") }, sesion.nombre);
  refrescar(n.expedienteId);
}

export async function marcarNoPago(form: FormData) {
  const sesion = await requerirSesion();
  const n = await aplicarPasoOficio(db, str(form, "id")!, "NO_PAGO", {}, sesion.nombre);
  refrescar(n.expedienteId);
}

export async function regresarNotificacion(form: FormData) {
  const sesion = await requerirSesion();
  const id = str(form, "id")!;
  const orden = ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA", "CONTESTADA"];
  const actual = await db.notificacion.findUniqueOrThrow({ where: { id } });
  const prev = actual.estado === "NO_PAGO" || actual.estado === "CERRADA" ? "AVISADO" : orden[Math.max(0, orden.indexOf(actual.estado) - 1)];
  const n = await aplicarPasoOficio(db, id, prev, {}, sesion.nombre);
  refrescar(n.expedienteId);
}

/** Pone un oficio directamente en cualquier paso (desde la ficha de la marca o Reportes). */
export async function fijarPasoOficio(id: string, estado: string, fechaISO?: string | null) {
  const sesion = await requerirSesion();
  if (!(estado in PASOS_OFICIO)) throw new Error("Paso inválido");
  const n = await aplicarPasoOficio(db, id, estado, { fecha: fechaISO ? new Date(`${fechaISO}T00:00:00Z`) : null }, sesion.nombre);
  refrescar(n.expedienteId);
}

export async function editarNotificacion(form: FormData) {
  await requerirSesion();
  const id = str(form, "id")!;
  const actual = await db.notificacion.findUniqueOrThrow({ where: { id } });
  const tipo = str(form, "tipo") ?? actual.tipo;
  const fNotif = fecha(form, "fechaNotificacion") ?? actual.fechaNotificacion;
  const manual = fecha(form, "fechaLimite");
  const n = await db.notificacion.update({
    where: { id },
    data: {
      editadoEnApp: true,
      tipo,
      fechaNotificacion: fNotif,
      ...plazosDeOficio(tipo, fNotif, await cargarInhabiles()),
      limiteManual: !!manual,
      ...(manual && { fechaLimite: manual }),
      notas: str(form, "notas"),
    },
  });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: n.expedienteId, fecha: hoyUTC(), titulo: `Se corrigió la notificación (${TIPOS_OFICIO[n.tipo] ?? n.tipo})`, detalle: textoPlazo(n) } });
  refrescar(n.expedienteId);
}

export async function eliminarNotificacion(form: FormData) {
  await requerirSesion();
  const id = str(form, "id")!;
  const n = await db.notificacion.findUniqueOrThrow({ where: { id }, include: { servicio: true } });
  if (n.servicio) await db.servicio.update({ where: { id: n.servicio.id }, data: { notificacionId: null } });
  await db.notificacion.delete({ where: { id } });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: n.expedienteId, fecha: hoyUTC(), titulo: `Se eliminó la notificación (${TIPOS_OFICIO[n.tipo] ?? n.tipo} del ${n.fechaNotificacion.toISOString().slice(0, 10)})` } });
  refrescar(n.expedienteId);
}

// ───────────── Expedientes ─────────────

export async function crearExpediente(form: FormData) {
  await requerirSesion();
  let clienteId = str(form, "clienteId");
  if (!clienteId) {
    const nombre = str(form, "clienteNombre");
    if (!nombre) throw new Error("Falta el cliente");
    const c = await db.cliente.upsert({
      where: { nombreNorm: normalizarNombre(nombre) },
      update: {},
      create: { nombre, nombreNorm: normalizarNombre(nombre), telefono: str(form, "telefono"), email: str(form, "email") },
    });
    clienteId = c.id;
  }
  const e = await db.expediente.create({
    data: {
      clienteId,
      tipo: str(form, "tipo") ?? "MARCA",
      denominacion: str(form, "denominacion")!,
      numeroExpediente: str(form, "numeroExpediente"),
      etapa: str(form, "numeroExpediente") ? "EN_TRAMITE" : "POR_PRESENTAR",
      fechaPresentacion: fecha(form, "fechaPresentacion"),
    },
  });
  const costo = num(form, "costo");
  if (costo) {
    const pagado = num(form, "pagado") ?? 0;
    await db.servicio.create({
      data: {
        expedienteId: e.id,
        tipo: "REGISTRO",
        fechaContratacion: fecha(form, "fechaContratacion") ?? hoyUTC(),
        costo,
        pagado,
        estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
        banco: str(form, "banco"),
        origenVenta: str(form, "origenVenta"),
      vendedor: str(form, "vendedor"),
      },
    });
  }
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: e.id, fecha: hoyUTC(), titulo: "Expediente creado en la app" } });
  refrescar();
  redirect(`/clientes/${clienteId}?marca=${e.id}`);
}

export type ResultadoEdicion = { ok: boolean; mensaje?: string; conflicto?: { id: string; denominacion: string; cliente: string; numero: string } };

export async function actualizarExpediente(form: FormData): Promise<ResultadoEdicion> {
  await requerirSesion();
  const id = str(form, "id")!;
  const antes = await db.expediente.findUniqueOrThrow({ where: { id } });
  const etapa = str(form, "etapa") ?? antes.etapa;
  const numero = str(form, "numeroExpediente");
  // El número de expediente es único: si ya lo tiene otra marca, se avisa en lugar de fallar
  if (numero && numero !== antes.numeroExpediente) {
    const otra = await db.expediente.findUnique({ where: { numeroExpediente: numero }, include: { cliente: { select: { nombre: true } } } });
    if (otra) {
      return {
        ok: false,
        mensaje: `El expediente ${numero} ya existe en la app: "${otra.denominacion}" (${otra.cliente.nombre}).`,
        conflicto: { id: otra.id, denominacion: otra.denominacion, cliente: otra.cliente.nombre, numero },
      };
    }
  }
  await db.expediente.update({
    where: { id },
    data: {
      denominacion: str(form, "denominacion") ?? antes.denominacion,
      tipo: str(form, "tipo") ?? antes.tipo,
      numeroExpediente: str(form, "numeroExpediente"),
      numeroRegistro: str(form, "numeroRegistro"),
      etapa,
      ...(etapa !== antes.etapa && { etapaManual: true }),
      fechaPresentacion: fecha(form, "fechaPresentacion"),
      fechaConcesion: fecha(form, "fechaConcesion"),
      notas: str(form, "notas"),
    },
  });
  if (etapa !== antes.etapa) {
    await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: id, fecha: hoyUTC(), titulo: `Cambio de etapa: ${etapa.replace("_", " ").toLowerCase()}` } });
  }
  refrescar(id);
  return { ok: true };
}

/**
 * Une dos registros que en realidad son la misma marca: pasa cobros, notificaciones, historial y datos del IMPI
 * de `origenId` a `destinoId` y borra el origen. Solo admin.
 */
export async function unirExpedientes(origenId: string, destinoId: string) {
  const sesion = await requerirAdmin();
  if (origenId === destinoId) return { ok: false };
  const [origen, destino] = await Promise.all([
    db.expediente.findUniqueOrThrow({ where: { id: origenId } }),
    db.expediente.findUniqueOrThrow({ where: { id: destinoId } }),
  ]);
  await db.$transaction(async (tx) => {
    await tx.servicio.updateMany({ where: { expedienteId: origenId }, data: { expedienteId: destinoId } });
    await tx.notificacion.updateMany({ where: { expedienteId: origenId }, data: { expedienteId: destinoId } });
    await tx.evento.updateMany({ where: { expedienteId: origenId }, data: { expedienteId: destinoId } });
    // Datos de MARCanet del origen: se descartan (los del destino son los de su número real)
    await tx.oficioImpi.deleteMany({ where: { expedienteId: origenId } });
    await tx.promocionImpi.deleteMany({ where: { expedienteId: origenId } });
    await tx.tramiteImpi.deleteMany({ where: { expedienteId: origenId } });
    await tx.expediente.update({
      where: { id: destinoId },
      data: {
        notas: [destino.notas, origen.notas, `Unido con "${origen.denominacion}" (exp. ${origen.numeroExpediente ?? "s/n"})`].filter(Boolean).join("\n"),
        impiUsuario: destino.impiUsuario ?? origen.impiUsuario,
        impiPasswordEnc: destino.impiPasswordEnc ?? origen.impiPasswordEnc,
      },
    });
    await tx.expediente.delete({ where: { id: origenId } });
    await tx.evento.create({
      data: { autor: sesion.nombre, expedienteId: destinoId, fecha: hoyUTC(), titulo: `Se unió el registro "${origen.denominacion}" (exp. ${origen.numeroExpediente ?? "s/n"}) a esta marca` },
    });
  });
  revalidatePath("/", "layout");
  return { ok: true, clienteId: destino.clienteId, destinoId };
}

export async function agregarEvento(form: FormData) {
  await requerirSesion();
  const expedienteId = str(form, "expedienteId")!;
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId, fecha: fecha(form, "fecha") ?? hoyUTC(), titulo: str(form, "titulo")!, detalle: str(form, "detalle") } });
  refrescar(expedienteId);
}

export async function guardarCredenciales(form: FormData) {
  await requerirSesion();
  const id = str(form, "id")!;
  const password = str(form, "password");
  await db.expediente.update({
    where: { id },
    data: { impiUsuario: str(form, "usuario"), ...(password ? { impiPasswordEnc: cifrar(password) } : {}) },
  });
  refrescar(id);
}

export async function verPasswordImpi(expedienteId: string) {
  await requerirSesion();
  const e = await db.expediente.findUnique({ where: { id: expedienteId }, select: { impiPasswordEnc: true } });
  return e?.impiPasswordEnc ? descifrar(e.impiPasswordEnc) : null;
}

// ───────────── Pagos ─────────────

export async function crearServicio(form: FormData) {
  await requerirSesion();
  const expedienteId = str(form, "expedienteId")!;
  const costo = num(form, "costo") ?? 0;
  const pagado = num(form, "pagado") ?? 0;
  await db.servicio.create({
    data: {
      expedienteId,
      tipo: str(form, "tipo") ?? "OTRO",
      fechaContratacion: fecha(form, "fechaContratacion") ?? hoyUTC(),
      costo,
      pagado,
      estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
      banco: str(form, "banco"),
      origenVenta: str(form, "origenVenta"),
      vendedor: str(form, "vendedor"),
      notas: str(form, "notas"),
    },
  });
  refrescar(expedienteId);
}

export async function registrarAbono(form: FormData) {
  await requerirSesion();
  const id = str(form, "id")!;
  const s = await db.servicio.findUniqueOrThrow({ where: { id } });
  const abono = num(form, "monto") ?? (s.costo ?? 0) - s.pagado;
  const pagado = s.pagado + abono;
  await db.servicio.update({
    where: { id },
    data: {
      editadoEnApp: true,
      pagado,
      estadoPago: pagado <= 0 ? "PENDIENTE" : s.costo && pagado < s.costo ? "PARCIAL" : "PAGADO",
      banco: str(form, "banco") ?? s.banco,
      ...parcialidadesSegun(s, pagado),
    },
  });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: "Pago registrado", detalle: `$${abono}` } });
  refrescar(s.expedienteId);
}

// ───────────── Configuración ─────────────

export async function guardarConfiguracion(form: FormData) {
  await requerirAdmin();
  await db.configuracion.upsert({
    where: { id: "main" },
    update: { emailAlertas: str(form, "emailAlertas"), diasAlerta: str(form, "diasAlerta") ?? "60,30,15,7,1", diasSeguimientoPago: num(form, "diasSeguimientoPago") ?? 5 },
    create: { id: "main", emailAlertas: str(form, "emailAlertas") },
  });
  revalidatePath("/admin");
}

export async function cambiarPassword(form: FormData) {
  const s = await requerirSesion();
  const actual = str(form, "actual") ?? "";
  const nueva = str(form, "nueva") ?? "";
  const u = await db.usuario.findUniqueOrThrow({ where: { id: s.id } });
  if (!(await bcrypt.compare(actual, u.passwordHash))) redirect("/cuenta?error=password");
  if (nueva.length < 8) redirect("/cuenta?error=corta");
  await db.usuario.update({ where: { id: s.id }, data: { passwordHash: await bcrypt.hash(nueva, 10) } });
  redirect("/cuenta?ok=password");
}

export async function crearUsuario(form: FormData) {
  await requerirAdmin();
  const password = str(form, "password") ?? "";
  if (password.length < 8) redirect("/admin?error=corta");
  if (await db.usuario.findUnique({ where: { email: str(form, "email")!.toLowerCase() } })) redirect("/admin?error=existe");
  await db.usuario.create({
    data: { email: str(form, "email")!.toLowerCase(), nombre: str(form, "nombre")!, rol: str(form, "rol") ?? "OPERATIVO", passwordHash: await bcrypt.hash(password, 10) },
  });
  redirect("/admin?ok=usuario");
}

export async function enviarAlertasAhora() {
  await requerirSesion();
  const r = await enviarResumen();
  redirect(`/admin?envio=${r.enviado ? "ok" : encodeURIComponent(r.motivo ?? "error")}`);
}

export async function buscarExpedientes(q: string) {
  await requerirSesion();
  const t = q.trim();
  if (t.length < 2) return [];
  return db.expediente.findMany({
    where: {
      OR: [
        { denominacion: { contains: t, mode: "insensitive" as const } },
        { numeroExpediente: { contains: t, mode: "insensitive" as const } },
        { numeroRegistro: { contains: t, mode: "insensitive" as const } },
        { cliente: { nombre: { contains: t, mode: "insensitive" as const } } },
      ],
    },
    select: { id: true, denominacion: true, numeroExpediente: true, etapa: true, cliente: { select: { nombre: true } } },
    take: 12,
    orderBy: { actualizado: "desc" },
  });
}

export async function buscarClientes(q: string) {
  await requerirSesion();
  const t = q.trim();
  if (t.length < 2) return [];
  return db.cliente.findMany({
    where: { OR: [{ nombre: { contains: t, mode: "insensitive" as const } }, { nombreNorm: { contains: normalizarNombre(t), mode: "insensitive" as const } }, { telefono: { contains: t, mode: "insensitive" as const } }] },
    select: { id: true, nombre: true, telefono: true },
    take: 10,
    orderBy: { nombre: "asc" },
  });
}

// ───────────── Búsqueda general ─────────────

export type ResultadoBusqueda = {
  clienteId: string;
  cliente: string;
  telefono: string | null;
  expedienteId: string | null;
  denominacion: string | null;
  numeroExpediente: string | null;
  numeroRegistro: string | null;
  etapa: string | null;
  marcas: number;
};

export async function buscarGlobal(q: string): Promise<ResultadoBusqueda[]> {
  await requerirSesion();
  const t = q.trim();
  if (t.length < 2) return [];
  const norm = normalizarNombre(t);
  const digitos = t.replace(/\D/g, "");
  const [exps, clientes] = await Promise.all([
    db.expediente.findMany({
      where: {
        OR: [
          { denominacion: { contains: t, mode: "insensitive" as const } },
          { numeroExpediente: { contains: t, mode: "insensitive" as const } },
          { numeroRegistro: { contains: t, mode: "insensitive" as const } },
        ],
      },
      include: { cliente: { include: { _count: { select: { expedientes: true } } } } },
      take: 15,
    }),
    db.cliente.findMany({
      where: {
        OR: [
          { nombreNorm: { contains: norm, mode: "insensitive" as const } },
          { email: { contains: t.toLowerCase(), mode: "insensitive" as const } },
          ...(digitos.length >= 4 ? [{ telefono: { contains: digitos, mode: "insensitive" as const } }] : []),
        ],
      },
      include: { _count: { select: { expedientes: true } } },
      take: 10,
    }),
  ]);
  const res: ResultadoBusqueda[] = exps.map((e) => ({
    clienteId: e.clienteId,
    cliente: e.cliente.nombre,
    telefono: e.cliente.telefono,
    expedienteId: e.id,
    denominacion: e.denominacion,
    numeroExpediente: e.numeroExpediente,
    numeroRegistro: e.numeroRegistro,
    etapa: e.etapa,
    marcas: e.cliente._count.expedientes,
  }));
  for (const c of clientes) {
    if (res.some((r) => r.clienteId === c.id)) continue;
    res.push({ clienteId: c.id, cliente: c.nombre, telefono: c.telefono, expedienteId: null, denominacion: null, numeroExpediente: null, numeroRegistro: null, etapa: null, marcas: c._count.expedientes });
  }
  return res.slice(0, 20);
}

// ───────────── Administración ─────────────

export async function actualizarCliente(form: FormData) {
  await requerirAdmin();
  const id = str(form, "id")!;
  const nombre = str(form, "nombre")!;
  await db.cliente.update({
    where: { id },
    data: { nombre, nombreNorm: normalizarNombre(nombre), telefono: str(form, "telefono"), email: str(form, "email"), rfc: str(form, "rfc"), notas: str(form, "notas") },
  });
  revalidatePath(`/clientes/${id}`);
}

export async function editarServicio(form: FormData) {
  await requerirAdmin();
  const id = str(form, "id")!;
  const costo = num(form, "costo") ?? 0;
  const pagado = num(form, "pagado") ?? 0;
  const previo = await db.servicio.findUniqueOrThrow({ where: { id } });
  const s = await db.servicio.update({
    where: { id },
    data: {
      tipo: str(form, "tipo") ?? undefined,
      fechaContratacion: fecha(form, "fechaContratacion"),
      costo,
      pagado,
      estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
      banco: str(form, "banco"),
      origenVenta: str(form, "origenVenta"),
      vendedor: str(form, "vendedor"),
      notas: str(form, "notas"),
      editadoEnApp: true,
      ...parcialidadesSegun(previo, pagado),
    },
  });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: "Se editó un cobro", detalle: `Costo $${costo} · pagado $${pagado}` } });
  refrescar(s.expedienteId);
}

export async function eliminarServicio(form: FormData) {
  await requerirAdmin();
  const id = str(form, "id")!;
  const s = await db.servicio.delete({ where: { id } });
  await db.evento.create({ data: { autor: (await requerirSesion()).nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: "Se eliminó un cobro", detalle: s.costo ? `$${s.costo}` : null } });
  refrescar(s.expedienteId);
}

const TIPO_EXP_POR_SERVICIO: Record<string, string> = {
  MARCA: "MARCA", AVISO: "AVISO", NOMBRE_COMERCIAL: "NOMBRE_COMERCIAL", PATENTE: "PATENTE", MODELO_UTILIDAD: "MODELO_UTILIDAD", DISENO_INDUSTRIAL: "DISENO_INDUSTRIAL", OBRA: "OBRA", EMPRESA: "EMPRESA",
};

/** Alta desde el apartado Admin: cliente (nuevo o existente) + servicio de cualquier tipo + cobro. */
export async function altaServicio(form: FormData) {
  const sesion = await requerirAdmin();
  let clienteId = str(form, "clienteId");
  if (!clienteId) {
    const nombre = str(form, "clienteNombre");
    if (!nombre) throw new Error("Falta el nombre del cliente");
    const c = await db.cliente.upsert({
      where: { nombreNorm: normalizarNombre(nombre) },
      update: {},
      create: { nombre, nombreNorm: normalizarNombre(nombre), telefono: str(form, "telefono"), email: str(form, "email"), rfc: str(form, "rfc") },
    });
    clienteId = c.id;
  }

  // servicio: MARCA | AVISO | NOMBRE_COMERCIAL | PATENTE | OBRA (registro nuevo) o CONTESTACION | DDU | RENOVACION | OTRO (sobre una marca)
  const servicio = str(form, "servicio") ?? "MARCA";
  const esRegistro = servicio in TIPO_EXP_POR_SERVICIO;
  let expedienteId = esRegistro ? null : str(form, "expedienteId");
  if (!expedienteId) {
    const numero = str(form, "numeroExpediente");
    const existente = numero ? await db.expediente.findUnique({ where: { numeroExpediente: numero } }) : null;
    if (existente) expedienteId = existente.id;
    else {
      const e = await db.expediente.create({
        data: {
          clienteId,
          tipo: TIPO_EXP_POR_SERVICIO[servicio] ?? "MARCA",
          denominacion: str(form, "denominacion") ?? "Sin denominación",
          numeroExpediente: numero,
          numeroRegistro: str(form, "numeroRegistro"),
          fechaConcesion: fecha(form, "fechaConcesion"),
          etapa: str(form, "numeroRegistro") ? "CONCEDIDA" : numero ? "EN_TRAMITE" : "POR_PRESENTAR",
          impiUsuario: str(form, "impiUsuario"),
          impiPasswordEnc: str(form, "impiPassword") ? cifrar(str(form, "impiPassword")!) : null,
        },
      });
      expedienteId = e.id;
    }
  }

  const costo = num(form, "costo") ?? 0;
  const pagado = num(form, "pagado") ?? 0;
  const tipoServicio = esRegistro ? "REGISTRO" : servicio;
  await db.servicio.create({
    data: {
      expedienteId,
      tipo: tipoServicio,
      fechaContratacion: fecha(form, "fechaContratacion") ?? hoyUTC(),
      costo,
      pagado,
      estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO",
      banco: str(form, "banco"),
      origenVenta: str(form, "origenVenta"),
      vendedor: str(form, "vendedor"),
      notas: str(form, "notas"),
    },
  });
  await db.evento.create({
    data: { autor: sesion.nombre, expedienteId, fecha: hoyUTC(), titulo: `Alta de servicio: ${TIPOS_SERVICIO_TXT[tipoServicio] ?? tipoServicio}`, detalle: costo ? `Costo $${costo} · pagado $${pagado}` : null },
  });
  refrescar(expedienteId);
  redirect(`/clientes/${clienteId}?marca=${expedienteId}&ok=alta`);
}

const TIPOS_SERVICIO_TXT: Record<string, string> = { REGISTRO: "registro", CONTESTACION: "contestación", DDU: "declaración de uso", RENOVACION: "renovación", OTRO: "otro" };

export async function marcasDeCliente(clienteId: string) {
  await requerirSesion();
  return db.expediente.findMany({ where: { clienteId }, select: { id: true, denominacion: true, numeroExpediente: true, numeroRegistro: true }, orderBy: { denominacion: "asc" } });
}

// ───────────── Días inhábiles y plazos ─────────────

export async function previsualizarPlazos(tipo: string, fechaNotificacion: string) {
  await requerirSesion();
  if (!fechaNotificacion) return null;
  const p = plazosDeOficio(tipo, new Date(`${fechaNotificacion}T00:00:00Z`), await cargarInhabiles());
  return { fechaLimite: p.fechaLimite.toISOString(), fechaLimiteRevision: p.fechaLimiteRevision?.toISOString() ?? null };
}

export async function agregarDiaInhabil(form: FormData) {
  await requerirAdmin();
  const f = fecha(form, "fecha");
  const motivo = str(form, "motivo");
  if (!f || !motivo) throw new Error("Faltan datos");
  await cargarInhabiles();
  await db.diaInhabil.upsert({ where: { fecha: f }, update: { motivo, fuente: str(form, "fuente") }, create: { fecha: f, motivo, fuente: str(form, "fuente") } });
  const n = await recalcularPlazos();
  revalidatePath("/", "layout");
  redirect(`/admin/inhabiles?ok=${n}`);
}

export async function eliminarDiaInhabil(form: FormData) {
  await requerirAdmin();
  const f = fecha(form, "fecha");
  if (!f) return;
  await db.diaInhabil.delete({ where: { fecha: f } });
  const n = await recalcularPlazos();
  revalidatePath("/", "layout");
  redirect(`/admin/inhabiles?ok=${n}`);
}

// ───────────── MARCanet ─────────────

export async function actualizarDesdeMarcanet(expedienteId: string) {
  await requerirSesion();
  const exp = await db.expediente.findUniqueOrThrow({ where: { id: expedienteId } });
  if (!exp.numeroExpediente || !/^\d{5,8}$/.test(exp.numeroExpediente)) return { ok: false, mensaje: "Esta marca no tiene un número de expediente válido." };
  try {
    const r = await sincronizarMarcanet({ modo: "EXPEDIENTE", expedientes: [exp] });
    refrescar(expedienteId);
    if (r.mensaje && /cuota/i.test(r.mensaje)) return { ok: false, mensaje: "MARCanet pidió esperar unos 10 minutos (límite de consultas del IMPI). Intenta más tarde." };
    if (r.errores) return { ok: false, mensaje: (await db.expediente.findUnique({ where: { id: expedienteId } }))?.marcanetError ?? "No se pudo consultar MARCanet." };
    return { ok: true, mensaje: r.nuevos ? `${r.nuevos} oficio(s) nuevo(s) detectado(s).` : r.contestados ? "Se registró la contestación ante el IMPI." : "Actualizado; sin cambios nuevos." };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo consultar MARCanet." };
  }
}

/** Revisa ahora (en segundo plano) los expedientes con oficios en curso. */
export async function revisarActivosEnMarcanet() {
  await requerirAdmin();
  // En Vercel las funciones duran segundos: la revisión masiva corre en GitHub Actions
  if (process.env.VERCEL) {
    const repo = process.env.GITHUB_REPO;
    redirect(repo ? `https://github.com/${repo}/actions/workflows/marcanet.yml` : "/admin?marcanet=github");
  }
  const expedientes = await db.expediente.findMany({
    where: { numeroExpediente: { not: null }, notificaciones: { some: { estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA"] } } } },
  });
  void sincronizarMarcanet({ modo: "MANUAL", expedientes }).then(() => revalidatePath("/", "layout")).catch(() => {});
  redirect("/admin?marcanet=iniciado");
}

// ───────────── Estatus, trabajo y parcialidades (admin) ─────────────

/** Ajusta qué parcialidades quedan cubiertas con lo pagado (1er pago primero). */
function parcialidadesSegun(s: { parcialidad1: number | null; parcialidad2: number | null }, pagado: number) {
  if (s.parcialidad2 == null) return {};
  const p1 = s.parcialidad1 ?? 0;
  return { parcialidad1Pagada: pagado >= p1, parcialidad2Pagada: pagado >= p1 + s.parcialidad2 };
}

export async function cambiarEtapa(expedienteId: string, etapa: string) {
  const sesion = await requerirAdmin();
  const antes = await db.expediente.findUniqueOrThrow({ where: { id: expedienteId } });
  if (antes.etapa === etapa) return;
  await db.expediente.update({ where: { id: expedienteId }, data: { etapa, etapaManual: true } });
  await db.evento.create({
    data: { autor: sesion.nombre, expedienteId, fecha: hoyUTC(), titulo: `Estatus cambiado: ${ETAPAS[antes.etapa] ?? antes.etapa} → ${ETAPAS[etapa] ?? etapa}` },
  });
  refrescar(expedienteId);
}

export async function cambiarEstadoTrabajo(servicioId: string, estadoTrabajo: string | null) {
  const sesion = await requerirAdmin();
  const s = await db.servicio.update({ where: { id: servicioId }, data: { estadoTrabajo, editadoEnApp: true } });
  await db.evento.create({ data: { autor: sesion.nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: `Trabajo marcado como: ${estadoTrabajo ? ESTADOS_TRABAJO[estadoTrabajo]?.txt ?? estadoTrabajo : "sin estado"}`, detalle: `${TIPOS_SERVICIO_TXT[s.tipo] ?? s.tipo}${s.avance ? ` · ${s.avance}` : ""}` } });
  // El oficio de esa contestación se mueve igual en el tablero, la ficha y Reportes
  await sincronizarDesdeCobro(db, servicioId, sesion.nombre);
  refrescar(s.expedienteId);
}

/** Marca como pagada (o no) una de las dos parcialidades y recalcula el total pagado. */
export async function marcarParcialidad(servicioId: string, cual: 1 | 2, pagada: boolean) {
  const sesion = await requerirAdmin();
  const s = await db.servicio.findUniqueOrThrow({ where: { id: servicioId } });
  const p1ok = cual === 1 ? pagada : !!s.parcialidad1Pagada;
  const p2ok = cual === 2 ? pagada : !!s.parcialidad2Pagada;
  const pagado = (p1ok ? s.parcialidad1 ?? 0 : 0) + (p2ok ? s.parcialidad2 ?? 0 : 0);
  const costo = s.costo ?? 0;
  await db.servicio.update({
    where: { id: servicioId },
    data: { parcialidad1Pagada: p1ok, parcialidad2Pagada: p2ok, pagado, estadoPago: pagado <= 0 ? "PENDIENTE" : pagado < costo ? "PARCIAL" : "PAGADO", editadoEnApp: true },
  });
  await db.evento.create({
    data: { autor: sesion.nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: `${cual === 1 ? "1er" : "2º"} pago marcado como ${pagada ? "pagado" : "pendiente"}`, detalle: `$${cual === 1 ? s.parcialidad1 : s.parcialidad2}` },
  });
  refrescar(s.expedienteId);
}

/** Marca un cobro como pagado completo (las dos parcialidades, si las hay). */
export async function marcarPagadoCompleto(servicioId: string) {
  const sesion = await requerirAdmin();
  const s = await db.servicio.findUniqueOrThrow({ where: { id: servicioId } });
  const costo = s.costo ?? 0;
  await db.servicio.update({
    where: { id: servicioId },
    data: { pagado: costo, estadoPago: "PAGADO", editadoEnApp: true, ...(s.parcialidad2 != null && { parcialidad1Pagada: true, parcialidad2Pagada: true }) },
  });
  await db.evento.create({ data: { autor: sesion.nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: "Cobro marcado como pagado completo", detalle: `$${costo}` } });
  refrescar(s.expedienteId);
}

// ───────────── Actualizar todas las marcas con MARCanet (botón) ─────────────

/** Orden de revisión: oficios en curso, luego activos, luego el resto; siempre los que llevan más tiempo sin revisar primero. */
export async function listaParaActualizar() {
  await requerirSesion();
  const lista = await expedientesParaHoy(db, 100000);
  return lista.map((e) => e.id);
}

export type ResultadoUna = { ok: boolean; cuota?: boolean; nuevos: number; contestados: number; mensaje?: string; nuevasDetalle: { denominacion: string; clienteId: string; expedienteId: string }[] };

/** Consulta una marca en MARCanet (lo llama el botón, una por una, para no pasar el límite de tiempo de Vercel). */
export async function actualizarUnaMarcanet(expedienteId: string): Promise<ResultadoUna> {
  await requerirSesion();
  const exp = await db.expediente.findUnique({ where: { id: expedienteId } });
  if (!exp?.numeroExpediente) return { ok: false, nuevos: 0, contestados: 0, nuevasDetalle: [] };
  try {
    const r = await sincronizarExpediente(db, exp, await cargarInhabiles());
    return {
      ok: true,
      nuevos: r.nuevos,
      contestados: r.contestados,
      nuevasDetalle: r.nuevos ? [{ denominacion: exp.denominacion, clienteId: exp.clienteId, expedienteId: exp.id }] : [],
    };
  } catch (e) {
    if (e instanceof MarcanetCuotaError) return { ok: false, cuota: true, nuevos: 0, contestados: 0, nuevasDetalle: [] };
    const mensaje = e instanceof Error ? e.message : "Error";
    await db.expediente.update({ where: { id: expedienteId }, data: { marcanetError: mensaje, marcanetSync: new Date() } });
    return { ok: false, nuevos: 0, contestados: 0, mensaje, nuevasDetalle: [] };
  }
}

export async function registrarCorridaManual(t: { total: number; consultados: number; errores: number; nuevos: number; contestados: number; mensaje?: string; inicio?: string }) {
  await requerirSesion();
  const { inicio, ...datos } = t;
  await db.syncMarcanet.create({ data: { modo: "MANUAL", ...datos, inicio: inicio ? new Date(inicio) : new Date(), fin: new Date(), mensaje: datos.mensaje ?? null } });
  revalidatePath("/", "layout");
}

/** Contestación ya trabajada; falta pagar los derechos en el sistema del IMPI para presentarla. */
export async function marcarPagarSistema(form: FormData) {
  const sesion = await requerirSesion();
  const n = await aplicarPasoOficio(db, str(form, "id")!, "PAGAR_SISTEMA", {}, sesion.nombre);
  refrescar(n.expedienteId);
}


// ───────────── Vendedor y nota de estatus (tabla de contrataciones) ─────────────

export async function cambiarVendedor(servicioId: string, nombre: string) {
  const sesion = await requerirAdmin();
  const vendedor = nombre.replace(/\s+/g, " ").trim() || null;
  const s = await db.servicio.update({ where: { id: servicioId }, data: { vendedor, editadoEnApp: true } });
  await db.evento.create({ data: { autor: sesion.nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: `Vendió: ${vendedor ?? "sin registrar"}` } });
  revalidatePath("/contrataciones");
}

/** Nota libre sobre el estatus del proceso ("Esperando logo", "Presentar el lunes"…). */
export async function cambiarNotaEstado(servicioId: string, nota: string) {
  const sesion = await requerirAdmin();
  const s = await db.servicio.update({ where: { id: servicioId }, data: { avance: nota.trim() || null, editadoEnApp: true } });
  if (nota.trim()) await db.evento.create({ data: { autor: sesion.nombre, expedienteId: s.expedienteId, fecha: hoyUTC(), titulo: `Nota de estatus: ${nota.trim()}`, detalle: TIPOS_SERVICIO_TXT[s.tipo] ?? s.tipo } });
  revalidatePath("/contrataciones");
  refrescar(s.expedienteId);
}

/** Renombra a un vendedor en todos sus registros (p. ej. "Columna S" → "Gabriel"). */
export async function renombrarVendedor(clave: string, nuevo: string) {
  await requerirAdmin();
  const nombre = nuevo.replace(/\s+/g, " ").trim();
  if (!nombre) return 0;
  const todos = await db.servicio.findMany({ where: { OR: [{ vendedor: { not: null } }, { origenVenta: { not: null } }] }, select: { id: true, vendedor: true, origenVenta: true } });
  const ids = todos.filter((s) => claveVendedor(s.vendedor ?? s.origenVenta ?? "") === clave).map((s) => s.id);
  await db.aliasVendedor.upsert({ where: { clave }, update: { nombre }, create: { clave, nombre } });
  await db.servicio.updateMany({ where: { id: { in: ids } }, data: { vendedor: nombre } });
  revalidatePath("/contrataciones");
  return ids.length;
}


/** Avance de la búsqueda completa automática (para el reloj de arena). */
export async function consultarEstadoBarrido() {
  await requerirSesion();
  return estadoBarrido();
}


// ───────────── Eliminar marca y "Ya no quiere continuar" ─────────────

/** Elimina una marca registrada por error (p. ej. duplicada). Queda anotada para que el Excel no la vuelva a crear. Solo admin. */
export async function eliminarExpediente(expedienteId: string) {
  await requerirAdmin();
  const e = await db.expediente.findUniqueOrThrow({ where: { id: expedienteId }, include: { cliente: true } });
  await db.$transaction(async (tx) => {
    const claves = [`CLI:${e.cliente.nombreNorm}|${normalizarNombre(e.denominacion)}`, ...(e.titular ? [`CLI:${normalizarNombre(e.titular)}|${normalizarNombre(e.denominacion)}`] : [])];
    if (e.numeroExpediente) claves.push(`EXP:${e.numeroExpediente}`);
    for (const clave of claves) {
      await tx.omitido.upsert({ where: { clave }, update: {}, create: { clave, motivo: `Eliminada en la app: ${e.denominacion} (${e.cliente.nombre})` } });
    }
    await tx.servicio.updateMany({ where: { expedienteId }, data: { notificacionId: null } });
    await tx.servicio.deleteMany({ where: { expedienteId } });
    await tx.notificacion.deleteMany({ where: { expedienteId } });
    await tx.evento.deleteMany({ where: { expedienteId } });
    await tx.oficioImpi.deleteMany({ where: { expedienteId } });
    await tx.promocionImpi.deleteMany({ where: { expedienteId } });
    await tx.tramiteImpi.deleteMany({ where: { expedienteId } });
    await tx.expediente.delete({ where: { id: expedienteId } });
  });
  revalidatePath("/", "layout");
  return { clienteId: e.clienteId };
}

/**
 * "Ya no quiere continuar": la marca queda como abandonada (ya no es nuestro cliente) y sus oficios salen del tablero.
 * `activar = false` lo deshace.
 */
export async function marcarDesistio(expedienteId: string, activar: boolean) {
  const sesion = await requerirSesion();
  const e = await db.expediente.findUniqueOrThrow({ where: { id: expedienteId } });
  if (activar) {
    const abiertos = await db.notificacion.findMany({ where: { expedienteId, estado: { in: ["RECIBIDA", "AVISADO", "EN_TRABAJO", "PAGAR_SISTEMA", "NO_PAGO"] } } });
    await db.notificacion.updateMany({ where: { id: { in: abiertos.map((n) => n.id) } }, data: { estado: "CERRADA", editadoEnApp: true } });
    await db.expediente.update({
      where: { id: expedienteId },
      data: { desistio: new Date(), etapa: "ABANDONADA", etapaManual: true, notas: [e.notas, `Etapa antes de "ya no quiere continuar": ${e.etapa}`].filter(Boolean).join("\n") },
    });
    await db.evento.create({
      data: { autor: sesion.nombre, expedienteId, fecha: hoyUTC(), titulo: "El cliente ya no quiere continuar · marca abandonada (ya no es nuestro cliente)", detalle: abiertos.length ? `${abiertos.length} oficio(s) cerrado(s)` : null },
    });
  } else {
    const previa = e.notas?.match(/Etapa antes de "ya no quiere continuar": (\w+)/g)?.pop()?.split(": ")[1];
    const cerradas = await db.notificacion.findMany({ where: { expedienteId, estado: "CERRADA" } });
    for (const n of cerradas) await db.notificacion.update({ where: { id: n.id }, data: { estado: n.fechaPago ? "EN_TRABAJO" : n.fechaAvisoCliente ? "AVISADO" : "RECIBIDA" } });
    await db.expediente.update({ where: { id: expedienteId }, data: { desistio: null, etapa: previa && previa !== "ABANDONADA" ? previa : "EN_TRAMITE", etapaManual: false } });
    await db.evento.create({ data: { autor: sesion.nombre, expedienteId, fecha: hoyUTC(), titulo: "Se reactivó la marca (el cliente sí continúa)" } });
  }
  refrescar(expedienteId);
}
