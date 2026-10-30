// Texto del Reporte 2 (auditoría): explica en lenguaje formal el estatus del portafolio de marcas y recomienda
// clases adicionales afines a cada marca (Clasificación de Niza). Se arma con reglas, a partir de lo que dio MARCanet.
import { categoriaDe, type MarcaAuditada, type ResultadoAuditoria } from "./marcanet/auditoria";

/** Clases de Niza, descripción breve. */
export const CLASES_NIZA: Record<number, string> = {
  1: "productos químicos", 2: "pinturas, barnices y colorantes", 3: "cosméticos, perfumería y productos de limpieza", 4: "aceites, lubricantes y combustibles",
  5: "productos farmacéuticos y suplementos", 6: "metales comunes y sus productos", 7: "máquinas y herramientas mecánicas", 8: "herramientas manuales",
  9: "aparatos electrónicos, aplicaciones y software descargable", 10: "aparatos e instrumentos médicos", 11: "iluminación, calefacción y refrigeración", 12: "vehículos y sus partes",
  13: "armas de fuego y pirotecnia", 14: "joyería y relojería", 15: "instrumentos musicales", 16: "papelería, impresos y material gráfico",
  17: "caucho y plásticos semielaborados", 18: "artículos de cuero, bolsos y equipaje", 19: "materiales de construcción no metálicos", 20: "muebles",
  21: "utensilios de cocina y del hogar", 22: "cuerdas, lonas y fibras", 23: "hilos", 24: "textiles para el hogar", 25: "ropa, calzado y sombrerería",
  26: "mercería", 27: "alfombras y tapetes", 28: "juegos, juguetes y artículos deportivos", 29: "alimentos procesados (carnes, lácteos, conservas)",
  30: "café, panadería, salsas y condimentos", 31: "productos agrícolas frescos", 32: "bebidas sin alcohol y cerveza", 33: "bebidas alcohólicas",
  34: "tabaco y artículos para fumadores", 35: "publicidad, gestión comercial y venta de productos", 36: "servicios financieros, de seguros e inmobiliarios",
  37: "construcción, instalación y reparación", 38: "telecomunicaciones y transmisión de contenidos en línea", 39: "transporte, logística y viajes",
  40: "tratamiento y transformación de materiales", 41: "educación, entretenimiento y actividades deportivas y culturales", 42: "servicios tecnológicos y desarrollo de software",
  43: "restaurantes, cafeterías y hospedaje", 44: "servicios médicos, de belleza y bienestar", 45: "servicios jurídicos, de seguridad y personales",
};

/** Clases afines a cada clase (las que suelen acompañarla en la operación real de un negocio), en orden de afinidad. */
const AFINES: Record<number, number[]> = {
  1: [5, 3, 40, 42], 2: [1, 19, 37], 3: [35, 5, 21, 44], 4: [1, 7, 37], 5: [3, 44, 35, 29], 6: [19, 20, 37], 7: [37, 8, 42], 8: [21, 7, 35],
  9: [42, 38, 35, 41], 10: [44, 5, 9], 11: [37, 9, 21], 12: [37, 39, 35, 9], 13: [28, 41], 14: [18, 25, 35], 15: [41, 9, 35], 16: [41, 35, 9],
  17: [19, 1], 18: [25, 14, 35], 19: [37, 6, 20], 20: [21, 24, 35], 21: [8, 20, 35], 22: [17, 24], 23: [24, 26], 24: [20, 25, 27], 25: [18, 14, 35],
  26: [25, 23], 27: [24, 20], 28: [41, 9, 25, 35], 29: [30, 35, 43, 31], 30: [29, 32, 43, 35], 31: [29, 44, 35], 32: [33, 30, 43, 35], 33: [32, 43, 35],
  34: [35, 9], 35: [41, 9, 42, 36], 36: [35, 9, 42, 45], 37: [35, 19, 42], 38: [9, 41, 42], 39: [35, 12, 43], 40: [42, 37], 41: [9, 35, 38, 28],
  42: [9, 35, 38, 45], 43: [30, 32, 35, 29], 44: [3, 5, 35, 41], 45: [35, 41, 42],
};

export type Recomendacion = { marca: string; clases: number[]; sugeridas: { clase: number; descripcion: string }[] };
export type Redaccion = { parrafos: string[]; recomendaciones: Recomendacion[]; introRecomendaciones: string; cierre: string };

const clasesDe = (m: MarcaAuditada) => [...new Set((m.clase ?? "").match(/\d+/g)?.map(Number).filter((n) => n >= 1 && n <= 45) ?? [])];
const clave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
const conNombre = (m: MarcaAuditada) => !!clave(m.denominacion) && !/sin denominaci/i.test(m.denominacion);
const nombres = (ms: MarcaAuditada[], max = 6) => {
  const unicos = [...new Set(ms.filter(conNombre).map((m) => `«${m.denominacion}»`))];
  if (!unicos.length) return "marcas sin denominación";
  return unicos.length > max ? `${unicos.slice(0, max).join(", ")}, entre otras` : lista(unicos);
};

/** Redacción formal del reporte: estatus general, puntos de atención y clases adicionales recomendadas. */
export function redactarAuditoria(r: ResultadoAuditoria): Redaccion {
  const consultadas = r.marcas.filter((m) => !m.error);
  const ganadas = consultadas.filter((m) => categoriaDe(m) === "GANADA");
  const proceso = consultadas.filter((m) => categoriaDe(m) === "PROCESO");
  const perdidas = consultadas.filter((m) => categoriaDe(m) === "PERDIDA");
  const parrafos: string[] = [];

  if (!r.marcas.length) {
    return {
      parrafos: ["De la búsqueda realizada en el Instituto Mexicano de la Propiedad Industrial no se identificaron marcas a nombre de los titulares o apoderados consultados. Esto significa que, por ahora, los signos distintivos del negocio no cuentan con protección registral en México."],
      introRecomendaciones: "",
      recomendaciones: [],
      cierre: "Recomendamos iniciar cuanto antes el registro de las marcas que identifican sus productos y servicios, pues en México el derecho se adquiere por el registro y no por el uso. Con gusto podemos realizar un estudio de viabilidad sin compromiso.",
    };
  }

  // 1) Panorama general
  parrafos.push(
    `De la búsqueda realizada en el Instituto Mexicano de la Propiedad Industrial (IMPI) se identificaron ${n(r.marcas.length, "expediente", "expedientes")} a nombre de los titulares y apoderados consultados. ` +
      `De ellos, ${n(ganadas.length, "se encuentra registrado", "se encuentran registrados")} y ${ganadas.length === 1 ? "otorga" : "otorgan"} protección vigente, ` +
      `${n(proceso.length, "está en trámite", "están en trámite")} ante el Instituto y ${n(perdidas.length, "fue abandonado, negado o perdió su vigencia", "fueron abandonados, negados o perdieron su vigencia")}.` +
      (r.marcas.length - consultadas.length ? ` No fue posible consultar el estatus de ${n(r.marcas.length - consultadas.length, "expediente", "expedientes")} por fallas del sistema del IMPI.` : "")
  );

  // 2) Lo que requiere atención: declaración de uso, renovación y oficios con plazo
  const urgente = (j?: { tono: string } | null) => !!j && (j.tono === "ambar" || j.tono === "rojo");
  const conDDU = ganadas.filter((m) => urgente(m.ddu));
  const conRenov = ganadas.filter((m) => urgente(m.renovacion));
  const conOficio = proceso.filter((m) => m.contestaciones?.some(urgente));
  const atencion: string[] = [];
  if (conDDU.length) atencion.push(`la declaración de uso de ${n(conDDU.length, "registro", "registros")} (${nombres(conDDU)}), trámite obligatorio al tercer año de la concesión cuya omisión provoca la caducidad del registro`);
  if (conRenov.length) atencion.push(`la renovación de ${n(conRenov.length, "registro", "registros")} (${nombres(conRenov)})`);
  if (conOficio.length) atencion.push(`la contestación de oficios del IMPI en ${n(conOficio.length, "solicitud", "solicitudes")} con plazo en curso (${nombres(conOficio)})`);
  parrafos.push(
    atencion.length
      ? `Requieren atención próxima: ${lista(atencion)}. Atender estos plazos a tiempo es indispensable para no perder los derechos ya obtenidos.`
      : "Por ahora no se advierten plazos inmediatos de declaración de uso, renovación ni contestación de oficios; recomendamos mantener la vigilancia periódica del portafolio para atenderlos en su momento."
  );

  // 3) Marcas perdidas: oportunidad de recuperar la protección
  if (perdidas.length) {
    parrafos.push(
      `Respecto de ${perdidas.length === 1 ? "la marca que ya no está vigente" : `las ${perdidas.length} marcas que ya no están vigentes`} (${nombres(perdidas)}), si el signo continúa en uso, ` +
        "conviene evaluar una nueva solicitud de registro: mientras no exista protección, un tercero podría registrarlo y oponerlo al propio negocio."
    );
  }

  // 4) Marcas cuyo seguimiento no lleva el despacho
  const fuera = consultadas.filter((m) => !m.enApp && categoriaDe(m) !== "PERDIDA");
  if (fuera.length) {
    parrafos.push(
      `Identificamos ${n(fuera.length, "marca vigente o en trámite", "marcas vigentes o en trámite")} cuyo seguimiento no está a cargo de este despacho. ` +
        "Con gusto podemos incorporarlas a nuestra vigilancia para cuidar sus plazos de declaración de uso, renovación y contestación de oficios, y así concentrar la gestión de todo el portafolio en un solo lugar."
    );
  }

  // 5) Clases adicionales afines: por marca activa (registrada o en trámite) que aún está en pocas clases (hasta 5),
  //    solo las más cercanas a las que ya tiene. Las que ya cubren muchas clases no se recomiendan (ya están protegidas).
  const porMarca = new Map<string, { marca: string; clases: Set<number>; expedientes: number }>();
  for (const m of [...ganadas, ...proceso].filter(conNombre)) {
    const k = clave(m.denominacion);
    const g = porMarca.get(k) ?? { marca: m.denominacion, clases: new Set<number>(), expedientes: 0 };
    clasesDe(m).forEach((c) => g.clases.add(c));
    g.expedientes++;
    porMarca.set(k, g);
  }
  const recomendaciones: Recomendacion[] = [];
  const candidatas = [...porMarca.values()].filter((x) => x.clases.size >= 1 && x.clases.size <= 5);
  for (const g of candidatas.sort((a, b) => b.expedientes - a.expedientes || a.marca.localeCompare(b.marca, "es"))) {
    const puntos = new Map<number, number>();
    const apoyo = new Map<number, number>(); // cuántas de sus clases la señalan
    for (const c of g.clases) {
      (AFINES[c] ?? []).slice(0, 3).forEach((a, i) => {
        if (g.clases.has(a)) return;
        puntos.set(a, (puntos.get(a) ?? 0) + (3 - i));
        apoyo.set(a, (apoyo.get(a) ?? 0) + 1);
      });
    }
    // Con 3 o más clases, solo las que señalan al menos dos de ellas (así encaja con el giro y no con una clase aislada)
    const minimo = g.clases.size >= 3 ? 2 : 1;
    const sugeridas = [...puntos.entries()].filter(([a]) => (apoyo.get(a) ?? 0) >= minimo).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3).map(([clase]) => ({ clase, descripcion: CLASES_NIZA[clase] }));
    if (sugeridas.length) recomendaciones.push({ marca: g.marca, clases: [...g.clases].sort((a, b) => a - b), sugeridas });
    if (recomendaciones.length >= 8) break;
  }

  return {
    parrafos,
    introRecomendaciones: recomendaciones.length
      ? "El registro de una marca solo protege los productos o servicios de las clases en que se otorgó. Considerando la actividad que reflejan sus registros actuales, sugerimos valorar la protección en las siguientes clases afines, donde es común que el negocio crezca o donde un tercero podría registrar un signo igual o semejante:"
      : "",
    recomendaciones,
    cierre: "Quedamos a sus órdenes para preparar la estrategia y la cotización de los trámites que considere convenientes, así como para resolver cualquier duda sobre este reporte.",
  };
}
