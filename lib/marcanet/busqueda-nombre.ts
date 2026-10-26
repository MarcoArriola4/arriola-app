// Búsqueda pública de MARCanet por nombre de titular o de apoderado (la misma que se hace a mano en
// "Por Titular" / "Por Apoderado"). Devuelve las marcas asociadas a cada nombre que coincide.
import { parse } from "node-html-parser";
import { MarcanetError, Sesion, filas, viewState } from "./consulta";

export type Como = "TITULAR" | "APODERADO";

export type MarcaEncontrada = {
  expediente: string;
  registro: string | null;
  denominacion: string;
  clase: string | null;
  tipoSolicitud: string;
  tipoMarca: string;
  nombreImpi: string; // el titular o apoderado tal como está en el IMPI
};

export type ResultadoNombre = {
  nombre: string;
  como: Como;
  coincidencias: string[]; // nombres del IMPI que son el mismo nombre buscado
  parecidos: string[]; // nombres parecidos que NO se incluyeron
  marcas: MarcaEncontrada[];
};

const DASH = "/marcanet/vistas/common/dashboard/marcanetDashboardBusquedas.pgi";
const CFG: Record<Como, { form: string; panel: string; resultado: string }> = {
  TITULAR: { form: "frmBsqTit", panel: "frmBsqTit:pnlBsqTitular", resultado: "/marcanet/vistas/common/busquedas/titularesResultado.pgi" },
  APODERADO: { form: "frmBsqApo", panel: "frmBsqApo:pnlBsqApo", resultado: "/marcanet/vistas/common/busquedas/apoderadosResultado.pgi" },
};
const NOMBRES = "frmResulApo:resultadoPromovente";
const EXPEDIENTES = "frmResulApo:resultadoExpediente";
const MAX_NOMBRES = 60; // nombres parecidos que se revisan por búsqueda
const MAX_MARCAS = 400; // marcas por nombre

// "S.A. DE C.V.", "S.A.P.I. DE C.V.", "S. DE R.L. DE C.V.", "S.C.", "A.C."… al final del nombre
const SOCIEDAD = /\b(S\s?A\s?P\s?I|S\s?A\s?B|S\s?A|S\s?DE\s?R\s?L|S\s?DE\s?R\s?L\s?MI|S\s?C|A\s?C|S\s?P\s?R)(\s?DE\s?C\s?V)?\s*$/;

/** Forma comparable: sin acentos, puntuación ni tipo de sociedad; palabras ordenadas (por si el IMPI cambió el orden). */
export function claveNombre(s: string) {
  const base = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9Ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const sinSociedad = base.replace(SOCIEDAD, "").trim() || base;
  return sinSociedad.split(" ").sort().join(" ");
}

const limpiar = (s: string) => s.replace(/\s+/g, " ").trim();
const ajax = (p: Record<string, string>) => new URLSearchParams({ "javax.faces.partial.ajax": "true", ...p });

/** Abre la búsqueda y devuelve el HTML de la lista de nombres que coinciden (o null si no hay ninguno). */
async function abrirResultados(s: Sesion, nombre: string, como: Como) {
  const c = CFG[como];
  const inicio = await s.pedir(DASH);
  const vs = viewState(inicio);
  if (!vs) throw new MarcanetError("No se pudo abrir la búsqueda de MARCanet");
  const r = await s.pedir(
    DASH,
    ajax({
      "javax.faces.source": `${c.form}:busquedaId`,
      "javax.faces.partial.execute": "@all",
      "javax.faces.partial.render": c.panel,
      [`${c.form}:busquedaId`]: `${c.form}:busquedaId`,
      [c.form]: c.form,
      [`${c.form}:titularId`]: nombre,
      [`${c.form}:swtNombre_input`]: "on", // buscar en todo el nombre
      "javax.faces.ViewState": vs,
    })
  );
  const destino = r.match(/<redirect url="([^"]+)"/)?.[1];
  if (!destino) {
    if (/No se encontr/i.test(r)) return null;
    throw new MarcanetError("MARCanet no respondió la búsqueda por nombre");
  }
  if (/errorHandler/i.test(destino)) {
    await s.pedir(destino.replace(/^https?:\/\/[^/]+/, "")); // si es el aviso de cuota, aquí se lanza MarcanetCuotaError
    throw new MarcanetError("MARCanet respondió con una página de error");
  }
  return s.pedir(c.resultado);
}

type FilaNombre = { indice: number; link: string; nombre: string };

function leerNombres(html: string): FilaNombre[] {
  return [...html.matchAll(/<a id="(frmResulApo:resultadoPromovente:(\d+):(j_idt\d+))"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ indice: Number(m[2]), link: m[1], nombre: limpiar(m[4]) }));
}

const totalDe = (html: string, tabla: string) => Number(html.match(new RegExp(`${tabla}",\\{[^}]*rowCount:(\\d+)`))?.[1] ?? html.match(/rowCount:(\d+)/)?.[1] ?? 0);
const nuevoVS = (xml: string, actual: string) => xml.match(/javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]>/)?.[1] ?? actual;

async function pagina(s: Sesion, ruta: string, tabla: string, primero: number, vs: string) {
  return s.pedir(
    ruta,
    ajax({
      "javax.faces.source": tabla,
      "javax.faces.partial.execute": tabla,
      "javax.faces.partial.render": tabla,
      [`${tabla}_pagination`]: "true",
      [`${tabla}_first`]: String(primero),
      [`${tabla}_rows`]: "10",
      [`${tabla}_skipChildren`]: "true",
      [`${tabla}_encodeFeature`]: "true",
      frmResulApo: "frmResulApo",
      "javax.faces.ViewState": vs,
    })
  );
}

function leerMarcas(xml: string, nombreImpi: string): MarcaEncontrada[] {
  const html = parse(xml.replace(/<!\[CDATA\[|\]\]>/g, ""));
  return filas(html, `${EXPEDIENTES}_data`)
    .filter((c) => c.length >= 7 && /\d{5,}/.test(c[3]))
    .map((c) => ({ tipoSolicitud: c[1], tipoMarca: c[2], expediente: c[3].match(/\d+/)![0], registro: c[4].match(/\d+/)?.[0] ?? null, denominacion: c[5] || "(sin denominación)", clase: c[6] || null, nombreImpi }));
}

/** Busca un nombre como titular o como apoderado y trae las marcas de cada nombre del IMPI que sea el mismo. */
export async function buscarPorNombre(nombre: string, como: Como, alAvanzar?: (texto: string) => void): Promise<ResultadoNombre> {
  const c = CFG[como];
  const buscado = claveNombre(nombre);
  const s = new Sesion();
  const html = await abrirResultados(s, nombre, como);
  const res: ResultadoNombre = { nombre, como, coincidencias: [], parecidos: [], marcas: [] };
  if (!html) return res;

  // Todos los nombres que regresó MARCanet (10 por página)
  let vs = viewState(html) ?? "";
  const lista = leerNombres(html);
  const total = Math.min(totalDe(html, NOMBRES), MAX_NOMBRES);
  for (let primero = 10; primero < total; primero += 10) {
    const xml = await pagina(s, c.resultado, NOMBRES, primero, vs);
    vs = nuevoVS(xml, vs);
    lista.push(...leerNombres(xml));
  }
  const iguales = lista.filter((n) => claveNombre(n.nombre) === buscado);
  res.coincidencias = [...new Set(iguales.map((n) => n.nombre))];
  res.parecidos = [...new Set(lista.filter((n) => claveNombre(n.nombre) !== buscado).map((n) => n.nombre))].slice(0, 15);

  // Las marcas de cada nombre que coincide (cada uno en su propia sesión, como hacerlo a mano)
  for (const n of iguales) {
    alAvanzar?.(`${como === "TITULAR" ? "Titular" : "Apoderado"}: ${n.nombre}`);
    const s2 = new Sesion();
    const h2 = await abrirResultados(s2, nombre, como);
    if (!h2) continue;
    let vs2 = viewState(h2) ?? "";
    if (n.indice >= 10) vs2 = nuevoVS(await pagina(s2, c.resultado, NOMBRES, Math.floor(n.indice / 10) * 10, vs2), vs2);
    const sel = await s2.pedir(
      c.resultado,
      ajax({ "javax.faces.source": n.link, "javax.faces.partial.execute": n.link, "javax.faces.partial.render": "frmResulApo", [n.link]: n.link, frmResulApo: "frmResulApo", "javax.faces.ViewState": vs2 })
    );
    vs2 = nuevoVS(sel, vs2);
    res.marcas.push(...leerMarcas(sel, n.nombre));
    const totalMarcas = Math.min(totalDe(sel, EXPEDIENTES), MAX_MARCAS);
    for (let primero = 10; primero < totalMarcas; primero += 10) {
      const xml = await pagina(s2, c.resultado, EXPEDIENTES, primero, vs2);
      vs2 = nuevoVS(xml, vs2);
      res.marcas.push(...leerMarcas(xml, n.nombre));
    }
  }
  return res;
}
