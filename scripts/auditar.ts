// Revisa la consistencia de pagos y marcas concedidas. Con --corregir aplica los arreglos seguros.
import { db } from "../lib/db";

const corregir = process.argv.includes("--corregir");

async function main() {
  const exps = await db.expediente.findMany({
    select: { id: true, denominacion: true, numeroExpediente: true, numeroRegistro: true, fechaConcesion: true, etapa: true, etapaManual: true, ultimoEstatus: true, oficiosImpi: { select: { descripcion: true, fechaNotificacion: true } } },
  });
  const conRegistroNoConcedida = exps.filter((e) => e.numeroRegistro && e.etapa !== "CONCEDIDA" && !e.etapaManual);
  const concesionImpi = exps.filter((e) => e.etapa !== "CONCEDIDA" && !e.etapaManual && e.oficiosImpi.some((o) => /CONCESI[OÓ]N/i.test(o.descripcion) && o.fechaNotificacion));
  const concedidaSinDatos = exps.filter((e) => e.etapa === "CONCEDIDA" && !e.numeroRegistro && !e.fechaConcesion);
  const textoRegistro = exps.filter((e) => e.etapa !== "CONCEDIDA" && !e.etapaManual && /num(ero)?\.? de registro|registrada/i.test(e.ultimoEstatus ?? ""));

  const servicios = await db.servicio.findMany({ select: { id: true, costo: true, pagado: true, estadoPago: true, parcialidad1: true, parcialidad1Pagada: true, parcialidad2: true, parcialidad2Pagada: true } });
  const estadoCorrecto = (s: (typeof servicios)[number]) => (s.pagado <= 0 ? "PENDIENTE" : s.pagado < (s.costo ?? 0) ? "PARCIAL" : "PAGADO");
  const estadoMal = servicios.filter((s) => (s.costo ?? 0) > 0 && s.estadoPago !== estadoCorrecto(s));
  const pagadoDeMas = servicios.filter((s) => s.costo != null && s.pagado > s.costo + 1);
  const sinCostoConPago = servicios.filter((s) => !s.costo && s.pagado > 0);
  const parcialidadesMal = servicios.filter(
    (s) => s.parcialidad2 != null && Math.abs((s.parcialidad1Pagada ? s.parcialidad1 ?? 0 : 0) + (s.parcialidad2Pagada ? s.parcialidad2 : 0) - s.pagado) > 1
  );

  console.log({
    marcas: exps.length,
    concedidas: exps.filter((e) => e.etapa === "CONCEDIDA").length,
    conRegistroPeroNoConcedida: conRegistroNoConcedida.length,
    concesionEnImpiPeroNoConcedida: concesionImpi.length,
    textoDiceRegistradaPeroNoConcedida: textoRegistro.length,
    concedidaSinRegistroNiFecha: concedidaSinDatos.length,
    servicios: servicios.length,
    estadoDePagoIncorrecto: estadoMal.length,
    pagadoMayorAlCosto: pagadoDeMas.length,
    sinCostoPeroConPago: sinCostoConPago.length,
    parcialidadesNoCuadran: parcialidadesMal.length,
  });
  console.log("Ejemplos con registro no concedidas:", conRegistroNoConcedida.slice(0, 5).map((e) => `${e.denominacion} · reg ${e.numeroRegistro} · ${e.etapa} · ${e.ultimoEstatus}`));
  console.log("Ejemplos concedida sin datos:", concedidaSinDatos.slice(0, 5).map((e) => `${e.denominacion} · ${e.numeroExpediente} · ${e.ultimoEstatus}`));
  console.log("Ejemplos pagado de más:", pagadoDeMas.slice(0, 5).map((s) => `costo ${s.costo} pagado ${s.pagado}`));

  if (corregir) {
    const ids = [...new Set([...conRegistroNoConcedida, ...concesionImpi, ...textoRegistro].map((e) => e.id))];
    await db.expediente.updateMany({ where: { id: { in: ids } }, data: { etapa: "CONCEDIDA" } });
    for (const s of estadoMal) await db.servicio.update({ where: { id: s.id }, data: { estadoPago: estadoCorrecto(s) } });
    console.log(`Corregido: ${ids.length} marcas → Concedida · ${estadoMal.length} estados de pago recalculados`);
  }
}

main().finally(() => db.$disconnect());
