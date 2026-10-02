import type { PrismaClient } from "@prisma/client";
import {
  HORARIO_DEFAULT,
  mapHorarioRow,
  monActivoSegunHorario,
  type HorarioLaboral,
} from "./monitoreo-horario-shared";
import { ensureMonitoreoSchema } from "./monitoreo-global";

export * from "./monitoreo-horario-shared";

async function ensureColumn(
  prisma: PrismaClient,
  table: string,
  column: string,
  alterSql: string
) {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  );
  if (Number(rows[0]?.n || 0) === 0) {
    await prisma.$executeRawUnsafe(alterSql);
  }
}

const schemaReady = new Set<string>();

const HORARIO_SELECT = `Mon_Horario_Activo, Mon_Hora_Inicio, Mon_Hora_Fin, Mon_Dias_Laborales,
        Mon_Almuerzo_Activo, Mon_Almuerzo_Inicio, Mon_Almuerzo_Fin`;

export async function ensureHorarioSchema(prisma: PrismaClient) {
  const key = `${(prisma as { _exaDbKey?: string })._exaDbKey || "default"}:v2-almuerzo`;
  if (schemaReady.has(key)) return;

  // Asegura CREATE de aud_dev_monitoreo_config antes de ALTER COLUMN
  await ensureMonitoreoSchema(prisma);

  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Horario_Activo",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Horario_Activo TINYINT NOT NULL DEFAULT 0"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Hora_Inicio",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Inicio VARCHAR(5) NOT NULL DEFAULT '08:00'"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Hora_Fin",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Fin VARCHAR(5) NOT NULL DEFAULT '17:00'"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Dias_Laborales",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Dias_Laborales VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5'"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Almuerzo_Activo",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Activo TINYINT NOT NULL DEFAULT 0"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Almuerzo_Inicio",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Inicio VARCHAR(5) NOT NULL DEFAULT '13:00'"
  );
  await ensureColumn(
    prisma,
    "aud_dev_monitoreo_config",
    "Mon_Almuerzo_Fin",
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Almuerzo_Fin VARCHAR(5) NOT NULL DEFAULT '14:00'"
  );

  schemaReady.add(key);
}

export async function loadHorario(
  prisma: PrismaClient,
  perCod: number
): Promise<HorarioLaboral> {
  await ensureHorarioSchema(prisma);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<HorarioLaboral>>(
      `SELECT ${HORARIO_SELECT}
       FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
      perCod
    );
    return mapHorarioRow(rows[0]);
  } catch {
    return mapHorarioRow(null);
  }
}

/**
 * Si el horario automático está activo, sincroniza Mon_Activo (1 dentro / 0 fuera o almuerzo).
 * Devuelve el Mon_Activo efectivo.
 */
export async function syncMonActivoPorHorario(
  prisma: PrismaClient,
  perCod: number,
  currentActivo?: number | null
): Promise<{ Mon_Activo: number; horario: HorarioLaboral; synced: boolean }> {
  const horario = await loadHorario(prisma, perCod);
  const desired = monActivoSegunHorario(horario);
  if (desired == null) {
    return {
      Mon_Activo: Number(currentActivo ?? 0) ? 1 : 0,
      horario,
      synced: false,
    };
  }
  const cur =
    currentActivo != null
      ? Number(currentActivo)
        ? 1
        : 0
      : (
          await prisma.$queryRawUnsafe<Array<{ Mon_Activo: number | null }>>(
            `SELECT Mon_Activo FROM aud_dev_monitoreo_config WHERE Per_Cod = ? LIMIT 1`,
            perCod
          )
        )[0]?.Mon_Activo;

  const actual = Number(cur ?? 0) ? 1 : 0;
  if (actual !== desired) {
    await prisma.$executeRawUnsafe(
      `UPDATE aud_dev_monitoreo_config SET Mon_Activo = ? WHERE Per_Cod = ?`,
      desired,
      perCod
    );
    return { Mon_Activo: desired, horario, synced: true };
  }
  return { Mon_Activo: desired, horario, synced: false };
}

/** Aplica sync a todos los que tienen horario automático (p. ej. al listar config). */
export async function syncAllHorarios(prisma: PrismaClient): Promise<number> {
  await ensureHorarioSchema(prisma);
  const rows = await prisma.$queryRawUnsafe<
    Array<{ Per_Cod: number; Mon_Activo: number | null } & HorarioLaboral>
  >(
    `SELECT Per_Cod, Mon_Activo, ${HORARIO_SELECT}
     FROM aud_dev_monitoreo_config
     WHERE Mon_Horario_Activo = 1`
  );
  let n = 0;
  for (const r of rows) {
    const res = await syncMonActivoPorHorario(prisma, r.Per_Cod, r.Mon_Activo);
    if (res.synced) n++;
  }
  return n;
}

export { HORARIO_DEFAULT };
