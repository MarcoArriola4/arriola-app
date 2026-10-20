// Consulta pública de un expediente en MARCanet (IMPI): datos generales, trámites, oficios y promociones.
// Es la misma consulta que se hace a mano en acervomarcas.impi.gob.mx; se hace despacio para no saturar el servicio.
import { parse, type HTMLElement } from "node-html-parser";

const BASE = "https://acervomarcas.impi.gob.mx:8181";
const BUSQUEDA = "/marcanet/vistas/common/datos/bsqExpedienteCompleto.pgi";
const DETALLE = "/marcanet/vistas/common/busquedas/detalleExpedienteParcial.pgi";
const PAUSA_MS = 3000; // entre solicitudes (MARCanet tiene una cuota de peticiones)
const TIEMPO_MAX_MS = 30000;

export type OficioMarcanet = {
  descripcion: string;
  numero: string;
  fechaOficio: Date | null;
  estadoNotificacion: string;
  fechaNotificacion: Date | null;
  tramite: string;
};
export type PromocionMarcanet = { folio: string; anio: string; fechaPresentacion: Date | null; oficioRelacionado: string | null; descripcion: string; tramite: string };
export type TramiteMarcanet = { folio: string; anio: string; descripcion: string; fechaInicio: Date | null; fechaConclusion: Date | null };
export type ExpedienteMarcanet = {
  numeroExpediente: string;
  denominacion: string | null;
  numeroRegistro: string | null;
  fechaPresentacion: Date | null;
  fechaConcesion: Date | null;
  fechaVigencia: Date | null;
  tramites: TramiteMarcanet[];
  oficios: OficioMarcanet[];
  promociones: PromocionMarcanet[];
};

export class MarcanetError extends Error {}
/** MARCanet avisó que se superó su cuota de peticiones: hay que esperar (~10 min) antes de seguir. */
export class MarcanetCuotaError extends MarcanetError {}

const AVISO_CUOTA = /cuota m[aá]xima de peticiones/i;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** dd/mm/aaaa → Date UTC */
export function fechaMx(s?: string | null): Date | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
}

/** Fecha en que se notificó el oficio, según el texto de "Estado de la notificación". null = aún no notificado. */
export function fechaDeNotificacion(estado: string): Date | null {
  const m = estado.match(/fecha de notificaci[oó]n\s*(\d{2}\/\d{2}\/\d{4})/i) ?? estado.match(/notificad[oa] el\s*(\d{2}\/\d{2}\/\d{4})/i);
  return m ? fechaMx(m[1]) : null;
}

const limpiar = (s: string) => s.replace(/\s+/g, " ").trim();

function filas(raiz: HTMLElement, tbodyId: string): string[][] {
  const tbody = raiz.querySelectorAll("tbody").find((t) => t.id === tbodyId);
  if (!tbody) return [];
  return tbody
    .querySelectorAll("tr")
    .filter((tr) => !tr.classList.contains("ui-datatable-empty-message"))
    .map((tr) =>
      tr.querySelectorAll("td").map((td) => {
        td.querySelectorAll("script").forEach((s) => s.remove());
        return limpiar(td.text);
      })
    );
}

class Sesion {
  private cookies = new Map<string, string>();

  /** Reintenta una vez si falla la red (no si MARCanet responde con error o captcha). */
  async pedir(ruta: string, cuerpo?: URLSearchParams): Promise<string> {
    try {
      return await this.pedirUnaVez(ruta, cuerpo);
    } catch (e) {
      if (e instanceof MarcanetError) throw e;
      await esperar(5000);
      return this.pedirUnaVez(ruta, cuerpo);
    }
  }

  private async pedirUnaVez(ruta: string, cuerpo?: URLSearchParams) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIEMPO_MAX_MS);
    try {
      const res = await fetch(BASE + ruta, {
        method: cuerpo ? "POST" : "GET",
        body: cuerpo,
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (seguimiento de expedientes propios - Arriola Abogados)",
          Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
          ...(cuerpo && {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Faces-Request": "partial/ajax",
            "X-Requested-With": "XMLHttpRequest",
          }),
        },
      });
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [kv] = c.split(";");
        const i = kv.indexOf("=");
        this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
      }
      if (res.status >= 400) throw new MarcanetError(`MARCanet respondió ${res.status}`);
      const texto = await res.text();
      if (/captcha/i.test(texto)) throw new MarcanetError("MARCanet pidió captcha; se detiene la consulta automática");
      if (AVISO_CUOTA.test(texto)) throw new MarcanetCuotaError("MARCanet pidió esperar: se superó su cuota de consultas (10 min)");
      return texto;
    } finally {
      clearTimeout(t);
      await esperar(PAUSA_MS);
    }
  }
}

const viewState = (html: string) =>
  html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1] ??
  html.match(/javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]>/)?.[1] ??
  null;

function dato(html: HTMLElement, etiqueta: string): string | null {
  // Datos generales: <label>Etiqueta</label> … <span>valor</span>
  const nodos = html.querySelectorAll("label, td, th, span, div");
  const i = nodos.findIndex((n) => n.childNodes.length <= 1 && limpiar(n.text) === etiqueta);
  if (i < 0) return null;
  for (let j = i + 1; j < Math.min(i + 6, nodos.length); j++) {
    const n = nodos[j];
    if (n.tagName === "SPAN" && n.childNodes.length <= 1) return limpiar(n.text) || null;
  }
  return null;
}

/** Consulta un expediente. Lanza MarcanetError si no existe o si el servicio falla. */
export async function consultarMarcanet(numeroExpediente: string): Promise<ExpedienteMarcanet> {
  const s = new Sesion();
  const inicio = await s.pedir(BUSQUEDA);
  const vs = viewState(inicio);
  if (!vs) throw new MarcanetError("No se pudo abrir la búsqueda de MARCanet");

  const busqueda = await s.pedir(
    BUSQUEDA,
    new URLSearchParams({
      "javax.faces.partial.ajax": "true",
      "javax.faces.source": "frmBsqExp:busquedaId2",
      "javax.faces.partial.execute": "@all",
      "javax.faces.partial.render": "frmBsqExp:pnlBsqExp frmBsqExp:dlgListaExpedientes",
      "frmBsqExp:busquedaId2": "frmBsqExp:busquedaId2",
      frmBsqExp: "frmBsqExp",
      "frmBsqExp:expedienteId": numeroExpediente,
      "javax.faces.ViewState": vs,
    })
  );
  const destino = busqueda.match(/<redirect url="([^"]+)"/)?.[1];
  if (!destino) throw new MarcanetError("MARCanet no encontró el expediente");
  if (/errorHandler/i.test(destino)) {
    await s.pedir(destino.replace(BASE, "")); // si es el aviso de cuota, aquí se lanza MarcanetCuotaError
    throw new MarcanetError("MARCanet respondió con una página de error");
  }

  const detalleHtml = await s.pedir(DETALLE);
  const detalle = parse(detalleHtml);
  const numero = dato(detalle, "Número de expediente");
  // Sin el número de expediente en la ficha no se confía en la respuesta (evita guardar "sin oficios" por error)
  if (!numero) throw new MarcanetError("MARCanet no devolvió la ficha del expediente");
  if (numero !== numeroExpediente) throw new MarcanetError(`MARCanet devolvió otro expediente (${numero})`);
  const vsDetalle = viewState(detalleHtml);

  const filasTramites = filas(detalle, "frmDetalleExp:dtTblTramitesId_data");
  const tramites: TramiteMarcanet[] = filasTramites
    .filter((c) => c.length >= 6 && /\d/.test(c[1]))
    .map((c) => ({ folio: c[1], anio: c[2], descripcion: c[3], fechaInicio: fechaMx(c[4]), fechaConclusion: fechaMx(c[5]) }));

  const oficios: OficioMarcanet[] = [];
  const promociones: PromocionMarcanet[] = [];
  const botones = [...detalleHtml.matchAll(/id="(frmDetalleExp:dtTblTramitesId:(\d+):viewDetailBtn)"/g)];
  for (const [, boton, indice] of botones) {
    // Solo las lupas de "SOLICITUD DE REGISTRO" y "RECURSO DE REVISIÓN": ahí están los oficios y promociones de la marca.
    // Los demás trámites (declaración de uso, renovación…) no se abren.
    if (!/SOLICITUD DE REGISTRO|RECURSO DE REVISI/i.test(filasTramites[Number(indice)]?.[3] ?? "")) continue;
    const xml = await s.pedir(
      DETALLE,
      new URLSearchParams({
        "javax.faces.partial.ajax": "true",
        "javax.faces.source": boton,
        "javax.faces.partial.execute": "@all",
        "javax.faces.partial.render": "dlgListaDicProm",
        [boton]: boton,
        frmDetalleExp: "frmDetalleExp",
        "javax.faces.ViewState": vsDetalle ?? "",
      })
    );
    const html = parse(xml.replace(/<!\[CDATA\[|\]\]>/g, ""));
    const tramite = filasTramites[Number(indice)]?.[3] ?? "";
    for (const c of filas(html, "frmDlgDicProm:idTramitesSeltbl1_data")) {
      if (c.length < 4 || !/^\d{6,}$/.test(c[1])) continue;
      oficios.push({ descripcion: c[0], numero: c[1], fechaOficio: fechaMx(c[2]), estadoNotificacion: c[3], fechaNotificacion: fechaDeNotificacion(c[3]), tramite });
    }
    for (const c of filas(html, "frmDlgDicProm:idTramitesSeltbl2_data")) {
      if (c.length < 5 || !/\d/.test(c[0])) continue;
      promociones.push({ folio: c[0], anio: c[1], fechaPresentacion: fechaMx(c[2]), oficioRelacionado: /^\d{6,}$/.test(c[3]) ? c[3] : null, descripcion: c[4], tramite });
    }
  }

  return {
    numeroExpediente,
    denominacion: dato(detalle, "Denominación"),
    numeroRegistro: dato(detalle, "Número de registro")?.match(/\d+/)?.[0] ?? null,
    fechaPresentacion: fechaMx(dato(detalle, "Fecha de presentación")),
    fechaConcesion: fechaMx(dato(detalle, "Fecha de concesión")),
    fechaVigencia: fechaMx(dato(detalle, "Fecha de vigencia")),
    tramites,
    oficios,
    promociones,
  };
}
