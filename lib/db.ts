import { PrismaClient } from "@prisma/client";

// Toda la app trabaja con la hora de la Ciudad de México (el servidor de Vercel y GitHub están en UTC).
// Las fechas sin hora (plazos, notificaciones) se guardan a medianoche UTC y se muestran con timeZone UTC.
process.env.TZ = "America/Mexico_City";


const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
