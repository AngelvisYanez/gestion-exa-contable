export type AsignadoMonitor = {
  usuCod: number;
  perCod?: number;
};

function pushUsu(
  out: AsignadoMonitor[],
  seen: Set<number>,
  usu: number,
  per: number
) {
  if (!Number.isFinite(usu) || usu <= 0 || seen.has(usu)) return;
  seen.add(usu);
  if (Number.isFinite(per) && per > 0) out.push({ usuCod: usu, perCod: per });
  else out.push({ usuCod: usu });
}

/**
 * Varias personas en JSON `[{Usu_Cod, Per_Cod}]`, o un solo Usu_Cod de respaldo
 * (tomar el ticket para trabajarlo).
 */
export function parseAsignadosTicket(
  raw: string | null | undefined,
  usuCodFallback = 0
): AsignadoMonitor[] {
  const out: AsignadoMonitor[] = [];
  const seen = new Set<number>();
  const text = String(raw || "").trim();
  if (text) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === "object") {
          const rec = item as Record<string, unknown>;
          pushUsu(
            out,
            seen,
            Number(rec.Usu_Cod ?? rec.usuCod),
            Number(rec.Per_Cod ?? rec.perCod ?? 0)
          );
        } else {
          pushUsu(out, seen, Number(item), 0);
        }
      }
    } else {
      for (const part of text.split(",")) pushUsu(out, seen, Number(part.trim()), 0);
    }
  }
  if (!out.length && usuCodFallback > 0) {
    pushUsu(out, seen, usuCodFallback, 0);
  }
  return out;
}

/** Varios Per_Cod en JSON (números u objetos) o separados por coma. */
export function parsePerCodsTarea(raw: string | null | undefined): number[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const nums: number[] = [];
  const seen = new Set<number>();
  const add = (n: number) => {
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) return;
    seen.add(n);
    nums.push(n);
  };

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        add(Number(rec.Per_Cod ?? rec.perCod));
      } else {
        add(Number(item));
      }
    }
    return nums;
  }
  for (const part of text.split(",")) add(Number(part.trim()));
  return nums;
}
