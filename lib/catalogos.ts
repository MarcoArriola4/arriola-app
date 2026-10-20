export const ETAPAS: Record<string, string> = {
  POR_PRESENTAR: "Por presentar",
  EN_TRAMITE: "En trámite",
  CON_OFICIO: "Con oficio",
  CONCEDIDA: "Concedida",
  NEGATIVA: "Negativa",
  CONFIRMA_ACTO: "Se confirma el acto (revisión perdida)",
  EN_JUICIO: "Recurso / juicio",
  ABANDONADA: "Abandonada",
};

export const TIPOS_EXPEDIENTE: Record<string, string> = {
  MARCA: "Marca",
  AVISO: "Aviso comercial",
  NOMBRE_COMERCIAL: "Nombre comercial",
  PATENTE: "Patente",
  MODELO_UTILIDAD: "Modelo de utilidad",
  DISENO_INDUSTRIAL: "Diseño industrial",
  OBRA: "Derecho de autor",
  EMPRESA: "Constitución de empresa",
};

/** Signos distintivos (se consultan en MARCanet; tienen DDU y renovación). */
export const TIPOS_SIGNO = ["MARCA", "AVISO", "NOMBRE_COMERCIAL"];
/** Patentes, modelos, diseños y obras: se llevan en su propio apartado del cliente. */
export const esSigno = (tipo: string) => TIPOS_SIGNO.includes(tipo);

/** Tipo según el número de expediente del IMPI: MX/a = patente, MX/u = modelo de utilidad, MX/f = diseño industrial. */
export function tipoPorExpediente(numero?: string | null): string | null {
  const m = numero?.match(/MX\/([afu])\//i)?.[1]?.toLowerCase();
  return m === "a" ? "PATENTE" : m === "u" ? "MODELO_UTILIDAD" : m === "f" ? "DISENO_INDUSTRIAL" : null;
}

export const TIPOS_SERVICIO: Record<string, string> = {
  REGISTRO: "Registro",
  CONTESTACION: "Contestación",
  DDU: "Declaración de uso",
  RENOVACION: "Renovación",
  OTRO: "Otro",
};

export const TIPOS_OFICIO: Record<string, string> = {
  ANTERIORIDAD: "Anterioridad",
  REQUERIMIENTO: "Requerimiento",
  REQ_PAGO: "Requerimiento de pago",
  IMPEDIMENTO: "Impedimento",
  ALEGATOS: "Alegatos / oposición",
  NEGATIVA: "Negativa",
  CONFIRMA_ACTO: "Se confirma el acto (revisión perdida)",
  OTRO: "Otro oficio",
};

export const MEDIOS_DEFENSA: Record<string, string> = {
  REVISION: "Recurso de revisión",
  NULIDAD: "Juicio de nulidad",
};

export const ESTADOS_NOTIF = [
  { id: "RECIBIDA", label: "Recibida", accion: "Avisé al cliente" },
  { id: "AVISADO", label: "Cliente avisado", accion: "Ya pagó" },
  { id: "EN_TRABAJO", label: "Pagado · en trabajo", accion: "Trabajado" },
  { id: "PAGAR_SISTEMA", label: "Pagar en sistema", accion: "Contestación enviada" },
  { id: "CONTESTADA", label: "Contestada", accion: null },
] as const;


export const BANCOS = ["BBVA", "BANAMEX", "SANTANDER", "HSBC", "MP", "PAYPAL", "EFECTIVO"];

export function normalizarNombre(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

export function fmtFecha(d?: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Estado del trabajo de cada servicio (columna H del Excel y tabla de contrataciones). */
export const ESTADOS_TRABAJO: Record<string, { txt: string; cls: string }> = {
  PENDIENTE: { txt: "Por trabajar", cls: "bg-violet-100 text-violet-800" },
  PRESENTAR: { txt: "Presentar", cls: "bg-fuchsia-200 text-fuchsia-900" },
  PAGAR_SISTEMA: { txt: "Pagar en sistema", cls: "bg-yellow-300 text-yellow-950" },
  HECHO: { txt: "Trabajado", cls: "bg-marca-claro text-marca-oscuro" },
  CLIENTE: { txt: "Lo sube el cliente", cls: "bg-sky-100 text-sky-800" },
  PROBLEMA: { txt: "Con problema", cls: "bg-red-100 text-red-700" },
};

/** "marco", "MARCO", "Márco " → "MARCO": misma persona sin importar mayúsculas, acentos o espacios. */
export function claveVendedor(nombre: string) {
  return nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

/** Personas de una venta: "Gabriel - Tanya", "Gabriel y Tanya", "Gabriel/Tanya" → ["GABRIEL", "TANYA"]. */
export function personasVenta(nombre: string) {
  return claveVendedor(nombre).split(/\s*(?:-|\/|,|&|\+|\bY\b)\s*/).map((p) => p.trim()).filter(Boolean);
}

/** "TANYA" → "Tanya" */
export const nombrePropio = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
