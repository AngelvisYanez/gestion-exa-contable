import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { registrarConexionDiaria } from "./monitoreo-conexiones";

test("registra el dia de Guayaquil y usa insercion que preserva la primera conexion", async () => {
  const calls: unknown[][] = [];
  const prisma = {
    $executeRawUnsafe: async (...args: unknown[]) => { calls.push(args); return 1; },
  } as unknown as PrismaClient;

  await registrarConexionDiaria(prisma, 42, new Date("2026-10-30T04:59:59.000Z"));
  await registrarConexionDiaria(prisma, 42, new Date("2026-10-30T05:00:00.000Z"));
  assert.match(String(calls[0][0]), /INSERT IGNORE INTO aud_dev_conexion_diaria/);
  assert.deepEqual(calls.map((c) => c[2]), ["2026-10-29", "2026-10-30"]);
  assert.deepEqual(calls.map((c) => c[1]), [42, 42]);
});
