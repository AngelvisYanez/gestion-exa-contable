import { getPrisma } from "@/lib/db";
import { normalizeWaPhone } from "./ultramsg";

export type WaRecipient = {
  role: "manager" | "developer" | "atencion";
  nombre: string;
  perCod: number | null;
  usuCod: number | null;
  telefono: string | null;
};

/**
 * Teléfonos desde persona EXA (Prs_Cel > Per_Mov > Prs_Tel),
 * mismo criterio que gestion PHP (ges_mod_dashboard_tareas).
 */
export async function resolvePhonesForTarea(
  dbDis: string,
  opts: { perCods: number[]; includeManagers?: boolean }
): Promise<WaRecipient[]> {
  const prisma = getPrisma(dbDis);
  const out: WaRecipient[] = [];
  const seenPhone = new Set<string>();
  const seenPer = new Set<number>();

  const pushRow = (row: {
    role: WaRecipient["role"];
    Nombre: string | null;
    Per_Cod: number | null;
    Usu_Cod: number | null;
    Prs_Cel: string | null;
    Prs_Tel: string | null;
    Per_Mov: string | null;
  }) => {
    const per = row.Per_Cod ? Number(row.Per_Cod) : null;
    if (per && seenPer.has(per)) return;
    if (per) seenPer.add(per);
    const raw = row.Prs_Cel || row.Per_Mov || row.Prs_Tel || null;
    const phone = normalizeWaPhone(raw);
    if (phone && seenPhone.has(phone)) return;
    if (phone) seenPhone.add(phone);
    out.push({
      role: row.role,
      nombre: (row.Nombre || "").trim() || "Sin nombre",
      perCod: per,
      usuCod: row.Usu_Cod ? Number(row.Usu_Cod) : null,
      telefono: phone,
    });
  };

  const perCods = [...new Set(opts.perCods.filter((n) => n > 0))];
  if (perCods.length) {
    const placeholders = perCods.map(() => "?").join(",");
    try {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          Per_Cod: number;
          Usu_Cod: number | null;
          Nombre: string | null;
          Prs_Cel: string | null;
          Prs_Tel: string | null;
          Per_Mov: string | null;
        }>
      >(
        `SELECT per.Per_Cod,
                u.Usu_Cod,
                CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Nombre,
                CONVERT(p.Prs_Cel USING utf8mb4) AS Prs_Cel,
                CONVERT(p.Prs_Tel USING utf8mb4) AS Prs_Tel,
                CONVERT(per.Per_Mov USING utf8mb4) AS Per_Mov
         FROM personal per
         INNER JOIN persona p ON p.Prs_Cod = per.Prs_Cod
         LEFT JOIN usuarios u ON u.Prs_Cod = p.Prs_Cod AND u.Usu_Est = 'A'
         WHERE per.Per_Cod IN (${placeholders}) AND per.Per_Est = 'A'`,
        ...perCods
      );
      for (const r of rows) pushRow({ ...r, role: "developer" });
    } catch {
      const rows = await prisma.$queryRawUnsafe<
        Array<{
          Per_Cod: number;
          Usu_Cod: number | null;
          Nombre: string | null;
          Prs_Cel: string | null;
          Prs_Tel: string | null;
        }>
      >(
        `SELECT per.Per_Cod,
                u.Usu_Cod,
                CONVERT(TRIM(CONCAT(IFNULL(p.Prs_Ape,''), ' ', IFNULL(p.Prs_Nom,''))) USING utf8mb4) AS Nombre,
                CONVERT(p.Prs_Cel USING utf8mb4) AS Prs_Cel,
                CONVERT(p.Prs_Tel USING utf8mb4) AS Prs_Tel
         FROM personal per
         INNER JOIN persona p ON p.Prs_Cod = per.Prs_Cod
         LEFT JOIN usuarios u ON u.Prs_Cod = p.Prs_Cod AND u.Usu_Est = 'A'
         WHERE per.Per_Cod IN (${placeholders}) AND per.Per_Est = 'A'`,
        ...perCods
      );
      for (const r of rows) pushRow({ ...r, Per_Mov: null, role: "developer" });
    }
  }

  if (opts.includeManagers !== false) {
    try {
      const managers = await prisma.$queryRawUnsafe<
        Array<{
          Per_Cod: number | null;
          Usu_Cod: number | null;
          Nombre: string | null;
          Prs_Cel: string | null;
          Prs_Tel: string | null;
          Per_Mov: string | null;
          Pan_Rol: string | null;
        }>
      >(
        `SELECT pan.Per_Cod, pan.Usu_Cod, pan.Pan_Rol,
                CONVERT(pan.Pan_Nombre USING utf8mb4) AS Nombre,
                CONVERT(p.Prs_Cel USING utf8mb4) AS Prs_Cel,
                CONVERT(p.Prs_Tel USING utf8mb4) AS Prs_Tel,
                NULL AS Per_Mov
         FROM aud_panel_usuarios pan
         LEFT JOIN personal per ON per.Per_Cod = pan.Per_Cod
         LEFT JOIN persona p ON p.Prs_Cod = COALESCE(pan.Prs_Cod, per.Prs_Cod)
         WHERE pan.Pan_Est = 'A' AND pan.Pan_Rol IN ('manager', 'atencion')`
      );
      for (const r of managers) {
        const role = r.Pan_Rol === "atencion" ? "atencion" : "manager";
        pushRow({ ...r, role });
      }
    } catch {
      /* panel table may miss columns on old DBs */
    }
  }

  return out;
}
