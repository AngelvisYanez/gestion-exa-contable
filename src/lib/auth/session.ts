import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { signPayload, unsignPayload } from "./crypto";
import { ExaAuthUser } from "./exaLogin";
import { decodeRole, encodeRole, UserRole } from "./users";

export const SESSION_COOKIE = "exa_tar_sess";

export type SessionData = {
  username: string; // cedula
  cedula: string;
  name: string;
  role: UserRole;
  projects: string[];
  perCod: number;
  usuCod: number;
  prsCod: number;
  empCod: number;
  dbDis: string;
  exp: number;
};

/** Cookie compacta para evitar HTTP 431 por headers grandes. */
type CompactSession = {
  c: string;
  n: string;
  r: "m" | "d" | "a";
  p: string[];
  per: number;
  usu: number;
  prs: number;
  emp: number;
  db: string;
  e: number;
};

function secret(): string {
  return process.env.AUTH_SECRET || "exa-tareas-dev-secret-change-me";
}

function toCompact(user: ExaAuthUser): CompactSession {
  return {
    c: String(user.cedula || "").slice(0, 20),
    n: String(user.name || user.cedula || "").slice(0, 60),
    r: encodeRole(user.role),
    p: (user.projects || []).slice(0, 8).map((x) => String(x).slice(0, 24)),
    per: user.perCod || 0,
    usu: user.usuCod || 0,
    prs: user.prsCod || 0,
    emp: user.empCod || 0,
    db: String(user.dbDis || "exa").slice(0, 32),
    e: Date.now() + 1000 * 60 * 60 * 12,
  };
}

function fromCompact(data: CompactSession | SessionData): SessionData | null {
  // Formato nuevo compacto
  if ("c" in data && "e" in data && !("cedula" in data && "exp" in data && "username" in data)) {
    const c = data as CompactSession;
    if (!c.e || c.e < Date.now()) return null;
    if (!c.c) return null;
    return {
      username: c.c,
      cedula: c.c,
      name: c.n || c.c,
      role: decodeRole(c.r),
      projects: Array.isArray(c.p) && c.p.length ? c.p : ["exa", "servicios"],
      perCod: c.per || 0,
      usuCod: c.usu || 0,
      prsCod: c.prs || 0,
      empCod: c.emp || 0,
      dbDis: c.db || "exa",
      exp: c.e,
    };
  }

  // Formato legacy
  const legacy = data as SessionData;
  if (!legacy.exp || legacy.exp < Date.now()) return null;
  if (!legacy.cedula && !legacy.username) return null;
  return {
    username: legacy.cedula || legacy.username,
    cedula: legacy.cedula || legacy.username,
    name: legacy.name || legacy.cedula || legacy.username,
    role: decodeRole(legacy.role),
    projects:
      Array.isArray(legacy.projects) && legacy.projects.length
        ? legacy.projects
        : ["exa", "servicios"],
    perCod: legacy.perCod || 0,
    usuCod: legacy.usuCod || 0,
    prsCod: legacy.prsCod || 0,
    empCod: legacy.empCod || 0,
    dbDis: legacy.dbDis || "exa",
    exp: legacy.exp,
  };
}

export async function createSessionToken(user: ExaAuthUser): Promise<string> {
  return signPayload(JSON.stringify(toCompact(user)), secret());
}

export async function parseSessionToken(
  token: string | undefined | null
): Promise<SessionData | null> {
  if (!token) return null;
  const raw = await unsignPayload(token, secret());
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as CompactSession | SessionData;
    return fromCompact(data);
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionData | null> {
  const jar = await cookies();
  return (
    (await parseSessionToken(jar.get(SESSION_COOKIE)?.value)) ||
    (await parseSessionToken(jar.get("exa_tareas_session")?.value))
  );
}

export async function getSessionFromRequest(req: NextRequest): Promise<SessionData | null> {
  return (
    (await parseSessionToken(req.cookies.get(SESSION_COOKIE)?.value)) ||
    (await parseSessionToken(req.cookies.get("exa_tareas_session")?.value))
  );
}

export async function setSessionCookie(res: NextResponse, user: ExaAuthUser) {
  const token = await createSessionToken(user);
  // Limpia cookie legacy grande si existe
  res.cookies.set("exa_tareas_session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  res.cookies.set("exa_tareas_session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
}

export function publicUser(user: ExaAuthUser | SessionData) {
  const cedula = "cedula" in user && user.cedula ? user.cedula : user.username;
  return {
    username: cedula,
    cedula,
    name: user.name,
    role: user.role,
    projects: user.projects,
    perCod: user.perCod,
    usuCod: "usuCod" in user ? user.usuCod : 0,
  };
}
