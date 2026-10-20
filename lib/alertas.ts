import { db } from "./db";
import { notificacionesActivas, vencimientos } from "./consultas";
import { diasRestantes, estaVencida, siguientePlazo } from "./plazos";
import { TIPOS_OFICIO, fmtFecha } from "./catalogos";

type Item = { titulo: string; detalle: string; dias: number; url: string };

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

function diasTxt(d: number) {
  if (d < 0) return `venció hace ${-d} días`;
  if (d === 0) return "vence HOY";
  if (d === 1) return "vence mañana";
  return `faltan ${d} días`;
}

export async function construirResumen() {
  const cfg = await db.configuracion.findUnique({ where: { id: "main" } });
  const marcas = (cfg?.diasAlerta ?? "60,30,15,7,1").split(",").map((n) => Number(n.trim())).filter((n) => !isNaN(n));
  const seguimiento = cfg?.diasSeguimientoPago ?? 5;

  const notifs = await notificacionesActivas();
  const urgentes: Item[] = [];
  const avisos: Item[] = [];
  const sinPago: Item[] = [];

  for (const n of notifs) {
    if (n.pendienteNotificar) continue; // el plazo aún no corre
    if (estaVencida(n)) continue; // vencidas: van en su propio apartado de la app
    const plazo = siguientePlazo(n);
    const d = diasRestantes(plazo.fecha);
    const limiteTxt = n.tipo === "NEGATIVA"
      ? `revisión hasta ${fmtFecha(n.fechaLimiteRevision)} · nulidad hasta ${fmtFecha(n.fechaLimite)}`
      : `límite ${fmtFecha(n.fechaLimite)}`;
    const item = {
      titulo: `${n.expediente.denominacion} — ${TIPOS_OFICIO[n.tipo]}${plazo.etiqueta ? ` (${plazo.etiqueta.toLowerCase()})` : ""}`,
      detalle: `${n.expediente.cliente.nombre} · Exp. ${n.expediente.numeroExpediente ?? "s/n"} · ${limiteTxt}`,
      dias: d,
      url: `${appUrl()}/expedientes/${n.expedienteId}`,
    };
    if (d <= 7) urgentes.push(item);
    else if (marcas.includes(d)) avisos.push(item);
    if (n.estado === "AVISADO" && n.fechaAvisoCliente) {
      const desde = -diasRestantes(n.fechaAvisoCliente);
      if (desde >= seguimiento) sinPago.push({ ...item, detalle: `${item.detalle} · avisado hace ${desde} días` });
    }
    if (n.estado === "RECIBIDA" && -diasRestantes(n.creado) >= 2) {
      sinPago.push({ ...item, titulo: `${item.titulo} (aún no se avisa al cliente)` });
    }
  }

  const venc = await vencimientos({ desdeDias: -30, hastaDias: Math.max(...marcas, 60) });
  const ddu: Item[] = venc
    .filter((v) => marcas.includes(v.dias) || v.dias < 0 && v.dias > -30 && v.dias % 7 === 0)
    .map((v) => ({
      titulo: `${v.denominacion} — ${v.tipo === "DDU" ? "Declaración de uso" : "Renovación"}`,
      detalle: `${v.cliente} · Reg. ${v.numeroRegistro ?? "—"} · ${fmtFecha(v.fecha)}`,
      dias: v.dias,
      url: `${appUrl()}/expedientes/${v.expedienteId}`,
    }));

  const nuevosImpi: Item[] = notifs
    .filter((n) => n.fuente === "MARCANET" && Date.now() - n.creado.getTime() < 36 * 3600 * 1000)
    .map((n) => ({
      titulo: `${n.expediente.denominacion} — ${TIPOS_OFICIO[n.tipo]}`,
      detalle: `${n.expediente.cliente.nombre} · Exp. ${n.expediente.numeroExpediente ?? "s/n"} · oficio ${n.numeroOficio} notificado el ${fmtFecha(n.fechaNotificacion)}`,
      dias: diasRestantes(siguientePlazo(n).fecha),
      url: `${appUrl()}/expedientes/${n.expedienteId}`,
    }));
  const ultimaSync = await db.syncMarcanet.findFirst({ where: { modo: "NOCTURNO", fin: { not: null } }, orderBy: { inicio: "desc" } });

  const secciones = [
    { titulo: "Nuevos oficios detectados hoy en MARCanet (IMPI)", color: "#7c3aed", items: nuevosImpi },
    { titulo: "Urgente: oficios con 7 días o menos", color: "#dc2626", items: urgentes },
    { titulo: "Recordatorios de plazos", color: "#6f8732", items: avisos },
    { titulo: "Seguimiento: clientes por avisar o sin pagar", color: "#d97706", items: sinPago },
    { titulo: "Declaraciones de uso y renovaciones", color: "#525252", items: ddu },
  ].filter((s) => s.items.length);

  const total = secciones.reduce((a, s) => a + s.items.length, 0);
  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f3;font-family:Arial,Helvetica,sans-serif;color:#1f1f1f">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#171717;border-radius:12px 12px 0 0;padding:18px 22px">
    <span style="color:#91ac45;font-weight:bold;letter-spacing:2px;font-size:18px">ARRIOLA</span>
    <span style="color:#91ac45;letter-spacing:4px;font-size:11px;margin-left:6px">ABOGADOS</span>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:22px">
    <h1 style="font-size:18px;margin:0 0 4px">Resumen del ${hoy}</h1>
    <p style="margin:0 0 18px;color:#737373;font-size:14px">${total ? `${total} pendientes que requieren atención.` : "Sin pendientes urgentes hoy."}${
      ultimaSync ? ` Revisión con MARCanet: ${ultimaSync.consultados} expedientes consultados${ultimaSync.errores ? `, ${ultimaSync.errores} con error` : ""}.` : ""
    }</p>
    ${secciones
      .map(
        (s) => `<h2 style="font-size:14px;color:${s.color};margin:20px 0 8px;border-bottom:1px solid #eee;padding-bottom:6px">${s.titulo} (${s.items.length})</h2>
      ${s.items
        .map(
          (i) => `<a href="${i.url}" style="display:block;text-decoration:none;color:inherit;padding:8px 0;border-bottom:1px solid #f3f3f3">
            <div style="font-size:14px;font-weight:bold">${i.titulo}</div>
            <div style="font-size:12px;color:#737373">${i.detalle}</div>
            <div style="font-size:12px;font-weight:bold;color:${i.dias <= 7 ? "#dc2626" : "#525252"}">${diasTxt(i.dias)}</div></a>`
        )
        .join("")}`
      )
      .join("")}
    <p style="margin-top:22px"><a href="${appUrl()}/notificaciones" style="background:#171717;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Abrir tablero</a></p>
  </div>
</div></body></html>`;

  return { total, secciones, html, asunto: `Arriola · ${urgentes.length ? `${urgentes.length} urgentes · ` : ""}resumen del ${hoy}`, para: cfg?.emailAlertas };
}

export async function enviarResumen(): Promise<{ enviado: boolean; motivo?: string }> {
  const r = await construirResumen();
  if (!r.para) return { enviado: false, motivo: "Falta el correo de alertas en Configuración" };
  if (!process.env.RESEND_API_KEY) return { enviado: false, motivo: "Falta configurar RESEND_API_KEY (servicio de correo)" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERTAS_FROM ?? "onboarding@resend.dev", to: r.para, subject: r.asunto, html: r.html }),
  });
  if (res.ok) return { enviado: true };
  const err = (await res.json().catch(() => ({}))) as { message?: string };
  return { enviado: false, motivo: err.message ?? `Error ${res.status}` };
}
