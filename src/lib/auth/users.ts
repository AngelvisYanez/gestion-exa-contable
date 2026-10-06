/**
 * Equipo autorizado del panel EXA Tareas.
 * Login por cedula + clave de usuarios EXA; luego match por nombre de persona.
 */

export type UserRole = "manager" | "developer" | "atencion";

export function encodeRole(role: UserRole): "m" | "d" | "a" {
  if (role === "manager") return "m";
  if (role === "atencion") return "a";
  return "d";
}

export function decodeRole(raw: string | null | undefined): UserRole {
  if (raw === "m" || raw === "manager") return "manager";
  if (raw === "a" || raw === "atencion") return "atencion";
  return "developer";
}

/** Asigna tareas y tickets (encargado y atencion al cliente). */
export function canAssignWork(role: string | null | undefined): boolean {
  return role === "manager" || role === "atencion";
}

/** Monitoreo, capturas, configuracion y metricas del equipo. */
export function canSeeOversight(role: string | null | undefined): boolean {
  return role === "manager";
}

export function roleLabel(role: string | null | undefined): string {
  if (role === "manager") return "Encargado";
  if (role === "atencion") return "Atencion al cliente";
  return "Desarrollador";
}

export function normalizePanelRole(raw: string | null | undefined): UserRole {
  if (raw === "manager" || raw === "atencion" || raw === "developer") return raw;
  return "developer";
}

export type TeamMember = {
  name: string;
  role: UserRole;
  nameMatch: string[];
};

export type ProjectInfo = {
  id: string;
  name: string;
  dbDis: string;
  description: string;
};

export const PROJECTS: ProjectInfo[] = [
  {
    id: "exa",
    name: "Torres Carrion Francisco Samuel [MATRIZ]",
    dbDis: "exa",
    description: "Empresa Emp_Cod=96 / Dat_Dis=exa - tareas de gestion",
  },
  {
    id: "servicios",
    name: "Proyecto Servicios",
    dbDis: "servicios",
    description: "Base distribuida Servicios - operaciones",
  },
  {
    id: "relavera",
    name: "EXA Relavera",
    dbDis: "relavera",
    description: "Instalacion EXA Relavera - tickets en otro servidor",
  },
];

export const TEAM_MANAGERS: TeamMember[] = [
  {
    name: "Angelvis Yanez",
    role: "manager",
    nameMatch: ["angelvis", "yanez"],
  },
  {
    name: "Francisco Torres",
    role: "manager",
    nameMatch: ["francisco", "torres", "carrion", "samuel"],
  },
];

export const TEAM_DEVELOPERS: TeamMember[] = [
  {
    name: "Carreon Leonel Belmuna",
    role: "developer",
    nameMatch: ["belduma", "belmuna", "carreon", "leonel", "wilson", "loja"],
  },
  {
    name: "Jose Ortiz Cumbicos",
    role: "developer",
    nameMatch: ["jose", "ortiz", "cumbicos"],
  },
  {
    name: "Moreno Garino Patricio Stefano",
    role: "developer",
    nameMatch: ["moreno", "garino", "patricio", "stefano", "patrick"],
  },
  {
    name: "Requelme Reyes Nathaly Scarleth",
    role: "developer",
    nameMatch: ["requelme", "reyes", "nathaly", "scarleth"],
  },
];

export const TEAM_MEMBERS: TeamMember[] = [...TEAM_MANAGERS, ...TEAM_DEVELOPERS];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchTeamMember(fullName: string): TeamMember | null {
  const hay = norm(fullName);
  if (!hay) return null;

  let best: { member: TeamMember; score: number } | null = null;

  for (const member of TEAM_MEMBERS) {
    const parts = member.nameMatch.map(norm).filter(Boolean);
    const hits = parts.filter((p) => hay.includes(p)).length;
    const ok =
      hits >= 2 || (hits === 1 && parts.some((p) => p.length >= 7 && hay.includes(p)));
    if (!ok) continue;
    if (!best || hits > best.score) best = { member, score: hits };
  }

  return best?.member || null;
}

export function getProject(id: string): ProjectInfo | undefined {
  return PROJECTS.find((p) => p.id === id || p.dbDis === id);
}