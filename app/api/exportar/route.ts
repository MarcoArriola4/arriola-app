import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirAdmin } from "@/lib/auth";
import { exportarExcel } from "@/lib/exportar";

export const maxDuration = 60;

/** Descarga el Excel "Pagos" con todo lo que hay en la app. Solo admin. ?claves=1 incluye las contraseñas del IMPI. */
export async function GET(req: Request) {
  await requerirAdmin();
  const conClaves = new URL(req.url).searchParams.get("claves") === "1";
  const { buffer } = await exportarExcel(db, { conClaves });
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Pagos ${hoy}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
