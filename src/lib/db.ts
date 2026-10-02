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
  return `${host}|${port}|${user}|${pass ? "1" : "0"}`;
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
  return (process.env.DATABASE_NAMES || "exa,servicios")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function sanitizeDbDis(raw: string | null | undefined): string {
  const fallback = (process.env.TASKS_DB_DIS || "exa").replace(/[^a-zA-Z0-9_]/g, "");
  const cleaned = String(raw || fallback).replace(/[^a-zA-Z0-9_]/g, "");
  const allowed = allowedDatabases();
  if (allowed.includes(cleaned)) return cleaned;
  if (allowed.includes(fallback)) return fallback;
  return allowed[0] || "exa";
}

function buildUrl(dbName: string): string {
  const host = process.env.DATABASE_HOST || "127.0.0.1";
  const port = process.env.DATABASE_PORT || "3306";
  const user = process.env.DATABASE_USER || "root";
  const pass = process.env.DATABASE_PASSWORD || "";
  const auth = pass
    ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}`
    : encodeURIComponent(user);
  const params = new URLSearchParams({
    connection_limit: String(connectionLimit()),
    pool_timeout: String(poolTimeout()),
    connect_timeout: "5",
  });
  return `mysql://${auth}@${host}:${port}/${dbName}?${params.toString()}`;
}

function createClient(name: string): TaggedClient {
  const client = new PrismaClient({
    datasources: { db: { url: buildUrl(name) } },
    log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
  }) as TaggedClient;
  client._exaDbKey = name;
  client._exaConnFp = connectionFingerprint();
  return client;
}

function dropStaleClientsIfEnvChanged() {
  const fp = connectionFingerprint();
  if (g.__exaPrismaConnFp === fp) return;
  g.__exaPrismaConnFp = fp;
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
