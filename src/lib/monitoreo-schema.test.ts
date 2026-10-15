import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ensureMonitoreoSchema } from "./monitoreo-global";
import { ensureHorarioSchema } from "./monitoreo-horario";

function prismaFalso(name: string, execute: () => Promise<number>) {
  return {
    _exaDbKey: name,
    $executeRawUnsafe: execute,
    $queryRawUnsafe: async () => [{ n: 1 }],
  } as unknown as PrismaClient;
}

describe("preparación concurrente de esquemas de monitoreo", () => {
  it("comparte una sola preparación entre solicitudes simultáneas", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let executions = 0;
    const prisma = prismaFalso("test-monitoreo-concurrente", async () => {
      executions += 1;
      if (executions === 1) await gate;
      return 0;
    });

    const first = ensureMonitoreoSchema(prisma);
    const second = ensureMonitoreoSchema(prisma);
    assert.equal(first, second);
    assert.equal(executions, 1);
    release();
    await Promise.all([first, second]);
    const completed = executions;
    await ensureMonitoreoSchema(prisma);
    assert.equal(executions, completed);
  });

  it("permite reintentar después de un fallo", async () => {
    let attempts = 0;
    const prisma = prismaFalso("test-monitoreo-reintento", async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("fallo temporal");
      return 0;
    });

    const first = ensureMonitoreoSchema(prisma);
    const second = ensureMonitoreoSchema(prisma);
    assert.equal(first, second);
    await assert.rejects(first, /fallo temporal/);
    await ensureMonitoreoSchema(prisma);
    assert.ok(attempts > 1);
  });

  it("comparte también la preparación del horario", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let executions = 0;
    const prisma = prismaFalso("test-horario-concurrente", async () => {
      executions += 1;
      if (executions === 1) await gate;
      return 0;
    });

    const first = ensureHorarioSchema(prisma);
    const second = ensureHorarioSchema(prisma);
    assert.equal(first, second);
    release();
    await Promise.all([first, second]);
    const completed = executions;
    await ensureHorarioSchema(prisma);
    assert.equal(executions, completed);
  });
});
