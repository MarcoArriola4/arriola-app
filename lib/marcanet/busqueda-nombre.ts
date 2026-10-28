// Búsqueda pública de MARCanet por nombre de titular o de apoderado (la misma que se hace a mano en
// "Por Titular" / "Por Apoderado"). Devuelve las marcas asociadas a cada nombre que coincide.
//
// Cómo responde MARCanet (medido):
// - Busca el texto tal cual dentro del nombre: es sensible a acentos y puntuación («GRUPO BIMBO SA DE CV» no encuentra
//   «GRUPO BIMBO, S.A.B. DE C.V.»; «MARIÑES» no encuentra «MARINES»). Por eso se prueban variantes del nombre.
// - Si hay varios nombres, muestra una lista (10 por página) y hay que entrar a cada uno.
// - Si solo hay UN nombre, se salta la lista y muestra directo la tabla de expedientes.
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

/** Un renglón de la lista de nombres del IMPI. link null = MARCanet mostró directo sus expedientes (un solo nombre). */
export type FilaNombre = { indice: number; link: string | null; nombre: string };

export type ListadoNombres = {
  consulta: string; // el texto con el que MARCanet sí encontró resultados
  filas: FilaNombre[]; // los renglones que son el mismo nombre (de cada uno se traen las marcas)
  coincidencias: string[]; // nombres iguales al buscado
  aproximadas: string[]; // incluidos aunque no son idénticos (cotitular, o falta / sobra un apellido)
  parecidos: string[]; // nombres parecidos que NO se incluyeron
};

export type ResultadoNombre = Omit<ListadoNombres, "filas"> & { nombre: string; como: Como; marcas: MarcaEncontrada[] };

const DASH = "/marcanet/vistas/common/dashboard/marcanetDashboardBusquedas.pgi";
const CFG: Record<Como, { form: string; panel: string; resultado: string }> = {
  TITULAR: { form: "frmBsqTit", panel: "frmBsqTit:pnlBsqTitular", resultado: "/marcanet/vistas/common/busquedas/titularesResultado.pgi" },
  APODERADO: { form: "frmBsqApo", panel: "frmBsqApo:pnlBsqApo", resultado: "/marcanet/vistas/common/busquedas/apoderadosResultado.pgi" },
};
const NOMBRES = "frmResulApo:resultadoPromovente";
const EXPEDIENTES = "frmResulApo:resultadoExpediente";
const MAX_NOMBRES = 300; // renglones de la lista que se revisan por búsqueda (30 páginas)
const MAX_MARCAS = 1500; // marcas por nombre (se reparte en varias corridas si son muchas)

// "S.A. DE C.V.", "S.A.P.I. DE C.V.", "S. DE R.L. DE C.V.", "S.C.", "A.C."… al final del nombre
const SOCIEDAD = /\b(S\s?A\s?P\s?I|S\s?A\s?B|S\s?A|S\s?DE\s?R\s?L|S\s?DE\s?R\s?L\s?MI|S\s?C|A\s?C|S\s?P\s?R)(\s?DE\s?C\s?V)?\s*$/;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Forma comparable: sin acentos, puntuación ni tipo de sociedad; palabras ordenadas (por si el IMPI cambió el orden). */
export function claveNombre(s: string) {
  const base = sinAcentos(s).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const sinSociedad = base.replace(SOCIEDAD, "").trim() || base;
  return sinSociedad.split(" ").sort().join(" ");
}

/** Partes de un nombre del IMPI con varios titulares: «JUAN PÉREZ, ANA LÓPEZ» / «JUAN PÉREZ Y ANA LÓPEZ». */
const partes = (n: string) => n.split(/,|;|\/|\s+Y\s+|\s+E\s+/i).map((p) => p.trim()).filter((p) => p.length >= 3);

/**
 * ¿El nombre del IMPI es el buscado? IGUAL = mismo nombre (o una de las partes si hay cotitulares).
 * APROX = mismas palabras salvo una (falta o sobra un apellido o un segundo nombre), con al menos 2 palabras en común.
 */
export function compararNombre(buscado: string, impi: string): "IGUAL" | "APROX" | null {
  const kb = claveNombre(buscado);
  if (claveNombre(impi) === kb) return "IGUAL";
  const pb = kb.split(" ");
  let aprox = false;
  for (const parte of partes(impi)) {
    const kp = claveNombre(parte);
    if (kp === kb) return "IGUAL";
    const pp = kp.split(" ");
    const comunes = pb.filter((w) => pp.includes(w)).length;
    if (comunes >= 2 && comunes === Math.min(pb.length, pp.length) && Math.abs(pb.length - pp.length) <= 1) aprox = true;
  }
  return aprox ? "APROX" : null;
}

/** Textos a probar en MARCanet, del más exacto al más amplio (se usa el primero que encuentra el nombre). */
export function variantesConsulta(nombre: string): string[] {
  const base = nombre.replace(/\s+/g, " ").trim();
  const palabras = base.toUpperCase().replace(/[^\p{L}\p{N}&\s]/gu, " ").replace(/\s+/g, " ").trim();
  const nucleo = palabras.replace(SOCIEDAD, "").trim() || palabras;
  const p = nucleo.split(" ");
  const v = [base, nucleo, sinAcentos(nucleo)];
  if (p.length >= 3) v.push(sinAcentos(p.slice(-2).join(" ")), sinAcentos(p.slice(0, 2).join(" ")), sinAcentos(p.slice(0, -1).join(" ")));
  // Tramo más largo sin acentos ni Ñ (por si el IMPI lo tiene escrito con acento y aquí no, o al revés)
  const tramos = nucleo.split(/\S*[^A-Z0-9&\s]\S*/).map((t) => t.trim()).filter((t) => t.split(" ").length >= 2);
  const tramo = tramos.sort((a, b) => b.length - a.length)[0];
  if (tramo) v.push(tramo);
  return [...new Set(v.filter((x) => x.replace(/\s/g, "").length >= 3))];
}

const limpiar = (s: string) => s.replace(/\s+/g, " ").trim();
const ajax = (p: Record<string, string>) => new URLSearchParams({ "javax.faces.partial.ajax": "true", ...p });

/** Abre la búsqueda y devuelve el HTML de resultados (lista de nombres o expedientes directos), o null si no hay nada. */
async function abrirResultados(s: Sesion, texto: string, como: Como) {
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
      [`${c.form}:titularId`]: texto,
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

function leerNombres(html: string): FilaNombre[] {
  return [...html.matchAll(/<a id="(frmResulApo:resultadoPromovente:(\d+):(j_idt\d+))"[^>]*>([^<]*)<\/a>/g)].map((m) => ({ indice: Number(m[2]), link: m[1], nombre: limpiar(m[4]) }));
}

/** Un solo nombre: MARCanet ya lo seleccionó y muestra sus datos («Nombre del titular …  Dirección …»). */
function nombreSeleccionado(html: string): string | null {
  const texto = limpiar(parse(html).text);
  return texto.match(/Nombre del (?:titular|apoderado|promovente)\s+(.+?)\s+Direcci[oó]n/i)?.[1] ?? null;
}

const esDirecto = (html: string) => !html.includes(`${NOMBRES}:`) && html.includes(EXPEDIENTES);

/** Total de renglones de una tabla (lo dice su script de PrimeFaces, después del id de la tabla). */
function totalDe(html: string, tabla: string) {
  const i = html.indexOf(`"${tabla}"`);
  return Number((i >= 0 ? html.slice(i) : html).match(/rowCount:(\d+)/)?.[1] ?? 0);
}
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
  let contenido = xml.replace(/<!\[CDATA\[|\]\]>/g, "");
  // Las páginas 2 en adelante llegan como renglones sueltos (<tr>…) sin la tabla: se envuelven para leerlos igual
  if (!contenido.includes(`${EXPEDIENTES}_data`)) {
    const renglones = xml.match(new RegExp(`<update id="${EXPEDIENTES}"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></update>`))?.[1] ?? "";
    contenido = `<table><tbody id="${EXPEDIENTES}_data">${renglones}</tbody></table>`;
  }
  const html = parse(contenido);
  return filas(html, `${EXPEDIENTES}_data`)
    .filter((c) => c.length >= 7 && /\d{5,}/.test(c[3]))
    .map((c) => ({ tipoSolicitud: c[1], tipoMarca: c[2], expediente: c[3].match(/\d+/)![0], registro: c[4].match(/\d+/)?.[0] ?? null, denominacion: c[5] || "(sin denominación)", clase: c[6] || null, nombreImpi }));
}

/**
 * Paso 1: encuentra en MARCanet los nombres que son el buscado (probando variantes del texto) y la lista completa
 * de renglones de cada uno. No trae marcas todavía.
 */
export async function listarNombres(nombre: string, como: Como): Promise<ListadoNombres> {
  const c = CFG[como];
  const parecidos = new Set<string>();
  let primeraConsulta: string | null = null;
  for (const consulta of variantesConsulta(nombre)) {
    const s = new Sesion();
    const html = await abrirResultados(s, consulta, como);
    if (!html) continue;
    primeraConsulta ??= consulta;

    if (esDirecto(html)) {
      const unico = nombreSeleccionado(html);
      const cmp = unico ? compararNombre(nombre, unico) : null;
      if (unico && cmp) return { consulta, filas: [{ indice: -1, link: null, nombre: unico }], coincidencias: cmp === "IGUAL" ? [unico] : [], aproximadas: cmp === "APROX" ? [unico] : [], parecidos: [...parecidos].slice(0, 15) };
      if (unico) parecidos.add(unico);
      continue;
    }

    // Todos los nombres que regresó MARCanet (10 por página)
    let vs = viewState(html) ?? "";
    const lista = leerNombres(html);
    const total = Math.min(totalDe(html, NOMBRES), MAX_NOMBRES);
    for (let primero = 10; primero < total; primero += 10) {
      const xml = await pagina(s, c.resultado, NOMBRES, primero, vs);
      vs = nuevoVS(xml, vs);
      lista.push(...leerNombres(xml));
    }
    const comparados = lista.map((n) => ({ ...n, cmp: compararNombre(nombre, n.nombre) }));
    const iguales = comparados.filter((n) => n.cmp === "IGUAL");
    // Los aproximados solo cuentan si no hay ningún nombre idéntico (si lo hay, los otros suelen ser otra persona)
    const elegidos = iguales.length ? iguales : comparados.filter((n) => n.cmp === "APROX");
    if (elegidos.length) {
      const dentro = new Set(elegidos.map((n) => n.nombre));
      for (const n of lista) if (!dentro.has(n.nombre)) parecidos.add(n.nombre);
      return {
        consulta,
        filas: elegidos.map(({ indice, link, nombre: n }) => ({ indice, link, nombre: n })),
        coincidencias: [...new Set(iguales.map((n) => n.nombre))],
        aproximadas: iguales.length ? [] : [...dentro],
        parecidos: [...parecidos].slice(0, 15),
      };
    }
    for (const n of lista) parecidos.add(n.nombre);
  }
  return { consulta: primeraConsulta ?? nombre, filas: [], coincidencias: [], aproximadas: [], parecidos: [...parecidos].slice(0, 15) };
}

/**
 * Paso 2: las marcas de un renglón (en su propia sesión, como hacerlo a mano). Empieza en el renglón `desde` de la
 * tabla de expedientes; si se acaba el tiempo (`limite`, ms epoch) devuelve dónde se quedó para continuar después.
 */
export async function marcasDeFila(consulta: string, como: Como, fila: FilaNombre, desde = 0, limite = Infinity): Promise<{ marcas: MarcaEncontrada[]; siguiente: number | null }> {
  const c = CFG[como];
  const s = new Sesion();
  const h = await abrirResultados(s, consulta, como);
  if (!h) return { marcas: [], siguiente: null };
  let vs = viewState(h) ?? "";
  let sel = h;
  if (fila.link) {
    if (fila.indice >= 10) vs = nuevoVS(await pagina(s, c.resultado, NOMBRES, Math.floor(fila.indice / 10) * 10, vs), vs);
    sel = await s.pedir(
      c.resultado,
      ajax({ "javax.faces.source": fila.link, "javax.faces.partial.execute": fila.link, "javax.faces.partial.render": "frmResulApo", [fila.link]: fila.link, frmResulApo: "frmResulApo", "javax.faces.ViewState": vs })
    );
    vs = nuevoVS(sel, vs);
  }
  const marcas = desde === 0 ? leerMarcas(sel, fila.nombre) : [];
  const total = Math.min(totalDe(sel, EXPEDIENTES), MAX_MARCAS);
  for (let primero = Math.max(10, desde); primero < total; primero += 10) {
    if (Date.now() > limite) return { marcas, siguiente: primero };
    const xml = await pagina(s, c.resultado, EXPEDIENTES, primero, vs);
    vs = nuevoVS(xml, vs);
    marcas.push(...leerMarcas(xml, fila.nombre));
  }
  return { marcas, siguiente: null };
}

/** Busca un nombre como titular o como apoderado y trae las marcas de cada nombre del IMPI que sea el mismo (sin límite de tiempo). */
export async function buscarPorNombre(nombre: string, como: Como, alAvanzar?: (texto: string) => void): Promise<ResultadoNombre> {
  const { filas: renglones, ...listado } = await listarNombres(nombre, como);
  const marcas: MarcaEncontrada[] = [];
  for (const f of renglones) {
    alAvanzar?.(`${como === "TITULAR" ? "Titular" : "Apoderado"}: ${f.nombre}`);
    marcas.push(...(await marcasDeFila(listado.consulta, como, f)).marcas);
  }
  return { nombre, como, ...listado, marcas };
}
