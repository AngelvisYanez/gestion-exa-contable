import { getPrisma } from "@/lib/db";
import { tasksEmpCod } from "@/lib/empresa";

function cedulaVariants(cedula: string): string[] {
  const digits = cedula.replace(/\D/g, "");
  const out = new Set<string>();
  if (cedula.trim()) out.add(cedula.trim());
  if (digits) {
    out.add(digits);
    // EXA a veces guarda RUC (13) vs cedula (10)
    if (digits.length >= 10) out.add(digits.slice(0, 10));
    if (digits.length === 10) out.add(`${digits}001`);
  }
  return [...out];
}

/**
 * Si el usuario de panel no tiene ficha en personal Emp_Cod=TASKS_EMP_COD,
 * crea una fila activa y la devuelve. Necesario para ExaMonitor (telemetría
 * exige Per_Cod). Idempotente.
 */
export async function ensurePersonalForEmp(
  dbDis: string,
  opts: { prsCod: number; empCod?: number; cargo?: string }
): Promise<number> {
  const prsCod = Number(opts.prsCod || 0);
  if (prsCod <= 0) return 0;
  const empCod = opts.empCod && opts.empCod > 0 ? opts.empCod : tasksEmpCod();
  const prisma = getPrisma(dbDis);

  const existing = await resolvePerCod(dbDis, { prsCod, empCod });
  if (existing > 0) return existing;

  const cargo = (opts.cargo || "GESTION").slice(0, 120);
  try {
    // MySQL 5.5: Per_Cod puede no ser AUTO_INCREMENT → MAX+1
    await prisma.$executeRawUnsafe(
      `INSERT INTO personal (Per_Cod, Prs_Cod, Emp_Cod, Per_Car, Per_Est)
       SELECT COALESCE(MAX(Per_Cod), 0) + 1, ?, ?, ?, 'A' FROM personal`,
      prsCod,
      empCod,
      cargo
    );
  } catch (err) {
    console.error("[personal] ensure:", err instanceof Error ? err.message : err);
  }
  return resolvePerCod(dbDis, { prsCod, empCod });
}

/**
 * Resuelve Per_Cod desde personal por Prs_Cod, cedula (variantes) o nombre.
 * Scope fijo Emp_Cod=96 (TASKS_EMP_COD / MATRIZ).
 * Prioriza vinculos por Prs_Cod/cedula; nameMatch solo como fallback.
 * Si hay varios Per_Cod, prioriza el que tiene tareas asignadas activas.
 */
export async function resolvePerCod(
  dbDis: string,
  opts: {
    perCod?: number;
    prsCod?: number;
    cedula?: string;
    nameMatch?: string[];
    empCod?: number;
  }
): Promise<number> {
  if (opts.perCod && opts.perCod > 0) return opts.perCod;

  const empCod = opts.empCod && opts.empCod > 0 ? opts.empCod : tasksEmpCod();
  const prisma = getPrisma(dbDis);
  const linked: number[] = [];
  const empFilter = { Emp_Cod: empCod, Per_Est: "A" as const };

  if (opts.prsCod && opts.prsCod > 0) {
    const byPrs = await prisma.personal.findMany({
      where: { ...empFilter, Prs_Cod: opts.prsCod },
      orderBy: { Per_Cod: "desc" },
      select: { Per_Cod: true },
    });
    for (const r of byPrs) linked.push(r.Per_Cod);
  }

  if (opts.cedula) {
    const variants = cedulaVariants(opts.cedula);
    const byCed = await prisma.personal.findMany({
      where: {
        ...empFilter,
        persona: { OR: variants.map((c) => ({ Prs_Ced: c })) },
      },
      orderBy: { Per_Cod: "desc" },
      select: { Per_Cod: true },
    });
    for (const r of byCed) {
      if (!linked.includes(r.Per_Cod)) linked.push(r.Per_Cod);
    }
  }

  let candidates = linked;

  // Solo buscar por nombre si no hay ficha vinculada por Prs_Cod/cedula
  // (caso Angelvis sin personal, o Nathaly con Prs_Cod distinto)
  if (!candidates.length) {
    const matches = (opts.nameMatch || [])
      .map((m) =>
        m
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim()
      )
      .filter((m) => m.length >= 5);
    if (matches.length) {
      const rows = await prisma.personal.findMany({
        where: empFilter,
        include: { persona: true },
        take: 500,
        orderBy: { Per_Cod: "desc" },
      });
      const byName: number[] = [];
      for (const r of rows) {
        const full = `${r.persona?.Prs_Ape || ""} ${r.persona?.Prs_Nom || ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        const hits = matches.filter((m) => full.includes(m)).length;
        // Exigir al menos 3 tokens (o 2 si uno es muy distintivo >=8) para evitar
        // falsos positivos tipo "TORRES CARRION SHIRLEY" vs Francisco.
        const distinctive = matches.some((m) => m.length >= 8 && full.includes(m));
        if ((hits >= 3 || (hits >= 2 && distinctive)) && !byName.includes(r.Per_Cod)) {
          byName.push(r.Per_Cod);
        }
      }
      candidates = byName;
    }
  }

  if (!candidates.length) return 0;
  if (candidates.length === 1) return candidates[0];

  // Preferir Per_Cod con asignaciones activas de tareas de Emp 96
  try {
    const ranked = await prisma.$queryRawUnsafe<Array<{ Per_Cod: number; c: bigint | number }>>(
      `SELECT a.Per_Cod, COUNT(*) AS c
       FROM aud_tareas_asignadas a
       INNER JOIN aud_tareas t ON t.Tar_Cod = a.Tar_Cod
       WHERE a.Tas_Est = 'A' AND t.Emp_Cod = ? AND a.Per_Cod IN (${candidates.map(() => "?").join(",")})
       GROUP BY a.Per_Cod
       ORDER BY c DESC
       LIMIT 1`,
      empCod,
      ...candidates
    );
    if (ranked?.[0]?.Per_Cod) return Number(ranked[0].Per_Cod);
  } catch {
    // tabla puede no existir en alguna BD; caer al max Per_Cod
  }

  return Math.min(...candidates);
}
