import { PrismaClient } from "@prisma/client";

/**
 * Pool chico: con 2 BDs (exa+servicios) y HMR de Next, pools grandes
 * saturan MySQL (HY000 1040 Too many connections).
 */
function connectionLimit() {
  return Math.max(
    1,
    Math.min(10, parseInt(process.env.DATABASE_CONNECTION_LIMIT || "2", 10) || 2)
  );
}

function poolTimeout() {
  return Math.max(5, parseInt(process.env.DATABASE_POOL_TIMEOUT || "10", 10) || 10);
}

/** Firma de conexión: si cambia .env (p.ej. 3307→3306), hay que recrear clientes. */
function connectionFingerprint(): string {
  const host = process.env.DATABASE_HOST || "127.0.0.1";
  const port = process.env.DATABASE_PORT || "3306";
  const user = process.env.DATABASE_USER || "root";
  const pass = process.env.DATABASE_PASSWORD || "";
  const rHost = process.env.RELAVERA_DB_HOST || "";
  const rPort = process.env.RELAVERA_DB_PORT || "";
  const rUser = process.env.RELAVERA_DB_USER || "";
  const rPass = process.env.RELAVERA_DB_PASSWORD || "";
  const rSchema = process.env.RELAVERA_DB_SCHEMA || "";
  const names = process.env.DATABASE_NAMES || "";
  return [
    host,
    port,
    user,
    pass ? "1" : "0",
    rHost,
    rPort,
    rUser,
    rPass ? "1" : "0",
    rSchema,
    names,
  ].join("|");
}

type DbEndpoint = {
  id: string;
  schema: string;
  host: string;
  port: string;
  user: string;
  password: string;
};

const relaveraSchemaById = new Map<string, string>();
let relaveraDiscovered: string[] | null = null;
let relaveraFailedAt = 0;
const RELAVERA_RETRY_MS = 5 * 60 * 1000;

function primaryEndpoint(schema: string): DbEndpoint {
  return {
    id: schema,
    schema,
    host: process.env.DATABASE_HOST || "127.0.0.1",
    port: process.env.DATABASE_PORT || "3306",
    user: process.env.DATABASE_USER || "root",
    password: process.env.DATABASE_PASSWORD || "",
  };
}

function relaveraConfigured(): boolean {
  return Boolean((process.env.RELAVERA_DB_HOST || "").trim());
}

function relaveraEndpoint(id: string): DbEndpoint {
  const schema =
    relaveraSchemaById.get(id) ||
    (id === "relavera" ? (process.env.RELAVERA_DB_SCHEMA || "").trim() || "relavera" : id.replace(/^relavera_/, ""));
  return {
    id,
    schema,
    host: (process.env.RELAVERA_DB_HOST || "").trim(),
    port: (process.env.RELAVERA_DB_PORT || "3306").trim(),
    user: (process.env.RELAVERA_DB_USER || "").trim(),
    password: process.env.RELAVERA_DB_PASSWORD || "",
  };
}

export function endpointFor(id: string): DbEndpoint {
  if (id === "relavera" || id.startsWith("relavera_")) return relaveraEndpoint(id);
  return primaryEndpoint(id);
}

/** Misma instancia MySQL (se puede hacer JOIN entre esquemas). */
export function sharesServer(a: string, b: string): boolean {
  const left = endpointFor(a);
  const right = endpointFor(b);
  return left.host === right.host && String(left.port) === String(right.port);
}

type TaggedClient = PrismaClient & { _exaDbKey?: string; _exaConnFp?: string };

type GlobalPrisma = {
  __exaPrismaClients?: Map<string, TaggedClient>;
  __exaPrismaConnFp?: string;
};

const g = globalThis as typeof globalThis & GlobalPrisma;

const clients: Map<string, TaggedClient> =
  g.__exaPrismaClients ?? new Map<string, TaggedClient>();

if (!g.__exaPrismaClients) {
  g.__exaPrismaClients = clients;
}

export function allowedDatabases(): string[] {
  const names = (process.env.DATABASE_NAMES || "exa,servicios,relavera")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!relaveraConfigured()) return names.filter((n) => n !== "relavera" && !n.startsWith("relavera_"));
  return names;
}

function isAllowedDatabase(name: string): boolean {
  if (allowedDatabases().includes(name)) return true;
  if (relaveraConfigured() && (name === "relavera" || name.startsWith("relavera_"))) return true;
  if (relaveraSchemaById.has(name)) return true;
  return false;
}

export function sanitizeDbDis(raw: string | null | undefined): string {
  const fallback = (process.env.TASKS_DB_DIS || "exa").replace(/[^a-zA-Z0-9_]/g, "");
  const cleaned = String(raw || fallback).replace(/[^a-zA-Z0-9_]/g, "");
  if (isAllowedDatabase(cleaned)) return cleaned;
  const allowed = allowedDatabases();
  if (allowed.includes(fallback)) return fallback;
  return allowed[0] || "exa";
}

function buildUrl(endpoint: DbEndpoint): string {
  const auth = endpoint.password
    ? `${encodeURIComponent(endpoint.user)}:${encodeURIComponent(endpoint.password)}`
    : encodeURIComponent(endpoint.user);
  const params = new URLSearchParams({
    connection_limit: String(connectionLimit()),
    pool_timeout: String(poolTimeout()),
    connect_timeout: "8",
  });
  return `mysql://${auth}@${endpoint.host}:${endpoint.port}/${endpoint.schema}?${params.toString()}`;
}

function createClient(name: string): TaggedClient {
  const client = new PrismaClient({
    datasources: { db: { url: buildUrl(endpointFor(name)) } },
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  }) as TaggedClient;
  client._exaDbKey = name;
  client._exaConnFp = connectionFingerprint();
  return client;
}

function dropStaleClientsIfEnvChanged() {
  const fp = connectionFingerprint();
  if (g.__exaPrismaConnFp === fp) return;
  const changed = Boolean(g.__exaPrismaConnFp);
  g.__exaPrismaConnFp = fp;
  if (!changed) return;
  relaveraDiscovered = null;
  relaveraFailedAt = 0;
  relaveraSchemaById.clear();
  for (const [name, client] of [...clients.entries()]) {
    void client.$disconnect().catch(() => undefined);
    clients.delete(name);
  }
}

export function getPrisma(dbDis?: string | null): PrismaClient {
  dropStaleClientsIfEnvChanged();
  const name = sanitizeDbDis(dbDis);
  let client = clients.get(name);
  if (!client || client._exaConnFp !== connectionFingerprint()) {
    if (client) void client.$disconnect().catch(() => undefined);
    client = createClient(name);
    clients.set(name, client);
  }
  return client;
}

async function discoverRelaveraIds(): Promise<string[]> {
  const masterName = (process.env.RELAVERA_DB_MASTER || "exa_master").replace(/[^a-zA-Z0-9_]/g, "") || "exa_master";
  const master = relaveraEndpoint("relavera");
  master.schema = masterName;
  const prisma = new PrismaClient({
    datasources: { db: { url: buildUrl(master) } },
    log: [],
  });
  try {
    let rows: Array<{ Dat_Dis: string | null }> = [];
    try {
      rows = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT Dat_Dis FROM data
         WHERE Dat_Est = 'A' AND Dat_Dis IS NOT NULL AND Dat_Dis <> ''`
      );
    } catch {
      rows = await prisma.$queryRawUnsafe(
        `SELECT DISTINCT Dat_Dis FROM data
         WHERE Dat_Dis IS NOT NULL AND Dat_Dis <> ''`
      );
    }
    const names = rows
      .map((r) => String(r.Dat_Dis || "").replace(/[^a-zA-Z0-9_]/g, ""))
      .filter(Boolean);
    const withTickets: string[] = [];
    for (const schema of names) {
      try {
        const hit = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT 1 AS n FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tickets' LIMIT 1`,
          schema
        );
        if (hit.length) withTickets.push(schema);
      } catch {
        withTickets.push(schema);
      }
    }
    const exact = withTickets.filter((n) => n.toLowerCase() === "relavera");
    const named = exact.length ? exact : withTickets.filter((n) => /relavera/i.test(n));
    const schemas = named.length ? named : withTickets.length === 1 ? withTickets : [];
    if (!schemas.length && withTickets.length > 1) {
      console.error(
        "[db] relavera: hay varios esquemas con tickets y ninguno se llama relavera:",
        withTickets.join(", ")
      );
    }
    if (schemas.length === 1) {
      relaveraSchemaById.set("relavera", schemas[0]);
      return ["relavera"];
    }
    return schemas.map((schema) => {
      const id = `relavera_${schema}`;
      relaveraSchemaById.set(id, schema);
      return id;
    });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

/** Bases de tickets: exa, servicios y el esquema de Relavera (otro servidor). */
export async function resolveTicketDatabaseIds(): Promise<string[]> {
  const configured = allowedDatabases();
  const local = configured.filter((n) => n !== "relavera" && !n.startsWith("relavera_"));
  if (!configured.includes("relavera") || !relaveraConfigured()) return local;
  const explicit = (process.env.RELAVERA_DB_SCHEMA || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
  if (explicit) {
    relaveraSchemaById.set("relavera", explicit);
    return [...local, "relavera"];
  }
  if (relaveraDiscovered && (relaveraDiscovered.length > 0 || Date.now() - relaveraFailedAt < RELAVERA_RETRY_MS)) {
    return [...local, ...relaveraDiscovered];
  }
  try {
    relaveraDiscovered = await discoverRelaveraIds();
    relaveraFailedAt = relaveraDiscovered.length ? 0 : Date.now();
  } catch (err) {
    console.error("[db] relavera:", err instanceof Error ? err.message : err);
    relaveraDiscovered = [];
    relaveraFailedAt = Date.now();
  }
  return [...local, ...relaveraDiscovered];
}

export function altDatabase(dbDis: string): string {
  const name = sanitizeDbDis(dbDis);
  return name === "exa" ? "servicios" : "exa";
}

/** ¿Duplicar telemetría/presencia en la BD secundaria? Default: no (ahorra conexiones). */
export function telemetriaMirrorEnabled(): boolean {
  const v = (process.env.TELEMETRIA_MIRROR || "0").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function disconnectAllPrisma(): Promise<void> {
  const pending = [...clients.entries()].map(async ([name, client]) => {
    try {
      await client.$disconnect();
    } catch {
      /* ignore */
    } finally {
      clients.delete(name);
    }
  });
  await Promise.all(pending);
}

/**
 * Tras 1040 Too many connections: cierra pools y recrea clientes limpios.
 * Llamar una sola vez y reintentar la query.
 */
export async function resetPrismaPools(): Promise<void> {
  await disconnectAllPrisma();
  g.__exaPrismaConnFp = connectionFingerprint();
  for (const name of allowedDatabases()) {
    clients.set(name, createClient(name));
  }
}

export function isTooManyConnectionsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    /too many connections/i.test(msg) ||
    /\b1040\b/.test(msg) ||
    /HY000.*1040/i.test(msg)
  );
}
