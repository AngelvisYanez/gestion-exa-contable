import type { PrismaClient } from "@prisma/client";
import { fechaEnZona } from "./timezone";

/** Guarda solo la primera comunicacion confirmada por el servidor en el dia. */
export async function registrarConexionDiaria(prisma: PrismaClient, perCod: number, ahora = new Date()) {
  const fecha = fechaEnZona(ahora);
  if (!fecha || perCod <= 0) return;
  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO aud_dev_conexion_diaria (Per_Cod, Fecha, Primera_Conexion)
     VALUES (?, ?, ?)`,
    perCod,
    fecha,
    ahora
  );
}

export async function conexionesDiarias(
  prisma: PrismaClient,
  perCod: number,
  desde: string,
  hasta: string
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ Fecha: Date; Primera_Conexion: Date }>>(
    `SELECT Fecha, Primera_Conexion FROM aud_dev_conexion_diaria
     WHERE Per_Cod = ? AND Fecha BETWEEN ? AND ? ORDER BY Fecha DESC`,
    perCod,
    desde,
    hasta
  );
  return rows.map((row) => ({
    Fecha: row.Fecha.toISOString().slice(0, 10),
    Primera_Conexion: row.Primera_Conexion.toISOString(),
  }));
}
