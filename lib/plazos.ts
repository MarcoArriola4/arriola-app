// Reglas de plazos del IMPI.
// - Plazos en días: solo cuentan los hábiles (art. 21 LFPPI). Se excluyen sábados, domingos y los días
//   inhábiles del IMPI (acuerdos del DOF y suspensiones), que se pasan como `inhabiles`.
// - Plazos en meses: de fecha a fecha; si el último día es inhábil, vence el siguiente día hábil.
// - El conteo empieza al día siguiente de la notificación.
export const DIA = 24 * 60 * 60 * 1000;

/** Fechas "YYYY-MM-DD" inhábiles (sin incluir fines de semana). */
export type Inhabiles = ReadonlySet<string>;

const clave = (d: Date) => d.toISOString().slice(0, 10);

export function esHabil(d: Date, inhabiles: Inhabiles) {
  const w = d.getUTCDay();
  return w !== 0 && w !== 6 && !inhabiles.has(clave(d));
}

/** Si la fecha cae en día inhábil, la mueve al siguiente día hábil. */
export function siguienteHabil(fecha: Date, inhabiles: Inhabiles) {
  const d = new Date(fecha);
  while (!esHabil(d, inhabiles)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function sumarMeses(fecha: Date, meses: number) {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + meses);
  if (d.getUTCDate() < dia) d.setUTCDate(0); // 31 ene + 1 mes → 28/29 feb
  return d;
}

export function sumarDiasHabiles(fecha: Date, dias: number, inhabiles: Inhabiles) {
  const d = new Date(fecha);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (esHabil(d, inhabiles)) n++;
  }
  return d;
}

/** Fecha límite final para atender un oficio, a partir de su notificación. */
export function calcularFechaLimite(tipo: string, notificacion: Date, inhabiles: Inhabiles) {
  if (tipo === "REQ_PAGO") return sumarDiasHabiles(notificacion, 5, inhabiles); // requerimiento de pago
  if (tipo === "ALEGATOS") return sumarDiasHabiles(notificacion, 5, inhabiles); // alegatos / oposición (plazo opcional)
  if (tipo === "NEGATIVA") return sumarDiasNaturales(notificacion, 30); // 15 revisión + 15 nulidad, días naturales
  if (tipo === "CONFIRMA_ACTO") return sumarDiasHabiles(notificacion, 15, inhabiles); // revisión perdida → juicio de nulidad
  return siguienteHabil(sumarMeses(notificacion, 4), inhabiles); // anterioridades, impedimentos, requerimientos, alegatos y demás
}

/** Días naturales (corridos): cuentan sábados, domingos e inhábiles. */
export function sumarDiasNaturales(fecha: Date, dias: number) {
  return new Date(fecha.getTime() + dias * DIA);
}

/** Negativa: los primeros 15 días naturales son para el recurso de revisión (los otros 15, para el juicio de nulidad). */
export function limiteRevision(notificacion: Date, // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _inhabiles?: Inhabiles) {
  return sumarDiasNaturales(notificacion, 15);
}

/** Todos los plazos de un oficio, listos para guardarse. */
export function plazosDeOficio(tipo: string, notificacion: Date, inhabiles: Inhabiles) {
  return {
    fechaLimite: calcularFechaLimite(tipo, notificacion, inhabiles),
    fechaLimiteRevision: tipo === "NEGATIVA" ? limiteRevision(notificacion, inhabiles) : null,
  };
}

/**
 * El plazo que corre hoy para un oficio. En negativas: primero el recurso de revisión
 * (15 días naturales) y, vencido ese, el juicio de nulidad (hasta los 30 días naturales).
 */
export function siguientePlazo(
  n: { tipo: string; fechaLimite: Date | string; fechaLimiteRevision?: Date | string | null },
  hoy = new Date()
) {
  const limite = new Date(n.fechaLimite);
  if (n.tipo === "NEGATIVA" && n.fechaLimiteRevision) {
    const rev = new Date(n.fechaLimiteRevision);
    if (diasRestantes(rev, hoy) >= 0) return { fecha: rev, etiqueta: "Recurso de revisión" as string | null };
    return { fecha: limite, etiqueta: "Juicio de nulidad" as string | null };
  }
  if (n.tipo === "NEGATIVA" || n.tipo === "CONFIRMA_ACTO") return { fecha: limite, etiqueta: "Juicio de nulidad" as string | null };
  return { fecha: limite, etiqueta: null as string | null };
}

/**
 * Declaración de uso: dentro de los 3 meses posteriores al 3er aniversario de la concesión
 * (solo marcas concedidas a partir del 10/08/2018; antes de esa fecha no aplica). null = no aplica.
 */
export function fechaLimiteDDU(concesion: Date, inhabiles: Inhabiles) {
  if (concesion.getTime() < Date.UTC(2018, 7, 10)) return null;
  return siguienteHabil(sumarMeses(concesion, 39), inhabiles);
}

/** Renovación: vigencia de 10 años desde la concesión. */
export function fechaRenovacion(concesion: Date) {
  return sumarMeses(concesion, 120);
}

export function diasRestantes(fecha: Date, hoy = new Date()) {
  // Las fechas se guardan a medianoche UTC; "hoy" se toma en hora local.
  const a = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const b = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return Math.round((b - a) / DIA);
}

export function nivelUrgencia(dias: number): "vencido" | "urgente" | "atencion" | "ok" {
  if (dias < 0) return "vencido";
  if (dias <= 7) return "urgente";
  if (dias <= 20) return "atencion";
  return "ok";
}

/** El plazo final ya pasó (y el oficio sí está notificado): ya no se puede contestar. */
export function estaVencida(n: { fechaLimite: Date | string; pendienteNotificar?: boolean; tipo?: string }, hoy = new Date()) {
  // Alegatos / oposición: si no se contestan en los 5 días no pasa nada; se espera la resolución del IMPI
  if (n.tipo === "ALEGATOS") return false;
  return !n.pendienteNotificar && diasRestantes(new Date(n.fechaLimite), hoy) < 0;
}

/** Alegatos cuyo plazo opcional (5 días hábiles) ya pasó: queda en espera de la respuesta del IMPI. */
export function esperandoImpi(n: { tipo: string; fechaLimite: Date | string; pendienteNotificar?: boolean }, hoy = new Date()) {
  return n.tipo === "ALEGATOS" && !n.pendienteNotificar && diasRestantes(new Date(n.fechaLimite), hoy) < 0;
}

/** Oficio que llegó por la revisión automática con MARCanet y aún no se ha atendido en la app (se resalta 3 días). */
export function esNuevaDeImpi(n: { fuente?: string | null; editadoEnApp?: boolean; creado: Date | string }, hoy = new Date()) {
  return n.fuente === "MARCANET" && !n.editadoEnApp && hoy.getTime() - new Date(n.creado).getTime() < 3 * DIA;
}
