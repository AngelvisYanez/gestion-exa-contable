import { getPrisma } from "@/lib/db";

export type OfsercontProceso = {
  id: number;
  nombre: string;
  grupo: string;
  directorio: string;
};

export type OfsercontModulo = {
  id: number;
  nombre: string;
  procesos: OfsercontProceso[];
};

function num(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/** Ruta de menú (`/tesoreria/FRONT/`) → directorio relativo al código OFSERCONT. */
export function directorioDesdeRuta(ruta: string): string {
  return ruta.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
}

/**
 * Catálogo real del menú EXA: módulos (`organizado` raíz) y sus procesos (`procesos`).
 */
export async function listOfsercontCatalogo(dbDis: string): Promise<OfsercontModulo[]> {
  const prisma = getPrisma(dbDis);
  const orgs = await prisma.$queryRawUnsafe<
    Array<{
      Org_Cod: unknown;
      Org_Niv: unknown;
      Org_Des: unknown;
      Org_Ord: unknown;
      Org_Mod: unknown;
    }>
  >(
    `SELECT Org_Cod, Org_Niv, Org_Des, Org_Ord, Org_Mod
     FROM organizado`
  );
  const procesos = await prisma.$queryRawUnsafe<
    Array<{
      Pcs_Cod: unknown;
      Org_Cod: unknown;
      Pcs_Lin: unknown;
      Pcs_Ord: unknown;
      Pcs_Nom: unknown;
      Rut_Des: unknown;
    }>
  >(
    `SELECT p.Pcs_Cod, p.Org_Cod, p.Pcs_Lin, p.Pcs_Ord, p.Pcs_Nom, r.Rut_Des
     FROM procesos p
     LEFT JOIN rutas r ON r.Rut_Cod = p.Rut_Cod
     WHERE p.Pcs_Est = 'A'`
  );

  const byId = new Map<
    number,
    { id: number; parent: number; nombre: string; orden: number; activo: boolean }
  >();
  for (const row of orgs) {
    const id = num(row.Org_Cod);
    if (!id) continue;
    byId.set(id, {
      id,
      parent: num(row.Org_Niv),
      nombre: str(row.Org_Des) || `Módulo ${id}`,
      orden: num(row.Org_Ord),
      activo: str(row.Org_Mod).toUpperCase() === "A",
    });
  }

  function rootOf(orgId: number): number {
    let id = orgId;
    const seen = new Set<number>();
    while (id && !seen.has(id)) {
      seen.add(id);
      const org = byId.get(id);
      if (!org || !org.parent) return id;
      const parent = byId.get(org.parent);
      if (!parent) return id;
      id = parent.id;
    }
    return orgId;
  }

  const buckets = new Map<number, OfsercontProceso[]>();
  for (const row of procesos) {
    const orgId = num(row.Org_Cod);
    const root = rootOf(orgId);
    const rootOrg = byId.get(root);
    if (!rootOrg || rootOrg.parent) continue;
    const org = byId.get(orgId);
    const nombre = str(row.Pcs_Lin) || str(row.Pcs_Nom) || `Proceso ${num(row.Pcs_Cod)}`;
    const grupo = org && org.id !== root ? org.nombre : rootOrg.nombre;
    const item: OfsercontProceso = {
      id: num(row.Pcs_Cod),
      nombre,
      grupo,
      directorio: directorioDesdeRuta(str(row.Rut_Des)),
    };
    const list = buckets.get(root) || [];
    list.push(item);
    buckets.set(root, list);
  }

  const modulos: OfsercontModulo[] = [];
  for (const org of byId.values()) {
    if (org.parent) continue;
    const procesosMod = (buckets.get(org.id) || []).slice();
    if (!org.activo && procesosMod.length === 0) continue;
    const dup = new Map<string, number>();
    for (const p of procesosMod) {
      const key = `${p.grupo}\0${p.nombre}`;
      dup.set(key, (dup.get(key) || 0) + 1);
    }
    for (const p of procesosMod) {
      const key = `${p.grupo}\0${p.nombre}`;
      if ((dup.get(key) || 0) > 1 && p.directorio) {
        p.nombre = `${p.nombre} (${p.directorio})`;
      }
    }
    procesosMod.sort((a, b) => {
      const g = a.grupo.localeCompare(b.grupo, "es");
      if (g) return g;
      return a.nombre.localeCompare(b.nombre, "es");
    });
    modulos.push({ id: org.id, nombre: org.nombre, procesos: procesosMod });
  }
  modulos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return modulos;
}
