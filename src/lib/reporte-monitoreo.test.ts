import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { buildMonitoreoReporte, duracionMonitoreo, loadMonitoreoReporte, type TelemetriaDiaRow } from "./reporte-monitoreo";

const personas = [{ Per_Cod: 42, Nombre: "María Núñez" }];
const day = (fecha: string, registros: number, actividad: number): TelemetriaDiaRow => ({
  Per_Cod: 42, fecha, ultima_senal: `${fecha}T22:00:00.000Z`, registros,
  actividad, segundos: 1800, clicks: 10, teclas: 20, lineas: 3, capturas: 1,
});
const source = () => ({ personas, desde: "2026-10-28", hasta: "2026-10-29", telemetria: [day("2026-10-28", 2, 100), day("2026-10-29", 8, 0)],
  conexiones: [{ Per_Cod: 42, Fecha: "2026-10-28", Primera_Conexion: "2026-10-28T13:00:00.000Z" }],
  presencias: [{ Per_Cod: 42, Mon_Ultima_Conexion: "2026-10-30T04:59:59.000Z" }],
  procesos: [{ Per_Cod: 42, nombre: "code.exe", registros: 5, es_ide: 1 }],
});

test("suma tiempo reportado, pondera actividad por registros y conserva la apertura verificada", () => {
  const report = buildMonitoreoReporte(source());
  const p = report.desarrolladores[0];
  assert.equal(p.segundos_activos, 3600);
  assert.equal(p.actividad, 20);
  assert.equal(p.clicks, 20);
  assert.equal(p.registros, 10);
  assert.equal(p.procesos[0].porcentaje, 50);
  assert.equal(p.dias[0].primera_conexion, "2026-10-28T13:00:00.000Z");
  assert.equal(p.dias[1].ultima_senal, "2026-10-30T04:59:59.000Z");
  assert.ok(p.dias.every((d) => d.cierre_sesion === null));
  assert.equal(report.estado, "disponible");
});

test("una señal a las 05:00 UTC pertenece al día siguiente de Guayaquil y queda fuera del rango", () => {
  const s = source();
  s.presencias[0].Mon_Ultima_Conexion = "2026-10-30T05:00:00.000Z";
  s.telemetria.push({ ...day("2026-10-29", 50, 100), Per_Cod: 99 }, day("2026-10-30", 30, 100));
  const p = buildMonitoreoReporte(s).desarrolladores[0];
  assert.equal(p.registros, 10);
  assert.equal(p.dias.length, 2);
  assert.equal(p.dias[1].ultima_senal, "2026-10-29T22:00:00.000Z");
});

test("conexión sin telemetría no inventa tiempo trabajado ni cierre ni apertura a partir de la telemetría", () => {
  const s = source();
  s.telemetria = [];
  s.presencias = [];
  s.procesos = [];
  const p = buildMonitoreoReporte(s).desarrolladores[0];
  assert.equal(p.segundos_activos, null);
  assert.equal(p.actividad, null);
  assert.equal(p.registros, 0);
  assert.equal(p.dias[0].cierre_sesion, null);
  const onlyTelemetry = buildMonitoreoReporte({ ...source(), conexiones: [], presencias: [] }).desarrolladores[0];
  assert.equal(onlyTelemetry.dias[0].primera_conexion, null);
  assert.equal(onlyTelemetry.dias[0].cierre_sesion, null);
});

test("distingue fuentes no disponibles de un período sin registros", () => {
  const unavailable = buildMonitoreoReporte({ ...source(), telemetria: null, conexiones: null, presencias: null, procesos: null });
  assert.equal(unavailable.estado, "no_disponible");
  assert.equal(unavailable.avisos.length, 4);
  const partial = buildMonitoreoReporte({ ...source(), telemetria: null });
  assert.equal(partial.estado, "parcial");
  assert.equal(partial.desarrolladores[0].dias[0].primera_conexion, "2026-10-28T13:00:00.000Z");
  assert.equal(partial.desarrolladores[0].segundos_activos, null);
});

test("consulta el equipo en lote y limita las fechas a los días completos de Guayaquil", async () => {
  const calls: unknown[][] = [];
  const prisma = { $queryRawUnsafe: async (...args: unknown[]) => { calls.push(args); return []; } } as unknown as PrismaClient;
  const result = await loadMonitoreoReporte(prisma, personas, "2026-10-28", "2026-10-29");
  assert.equal(calls.length, 5);
  assert.ok(calls.every((args) => args[1] === 42));
  assert.equal((calls[0][2] as Date).toISOString(), "2026-10-28T05:00:00.000Z");
  assert.equal((calls[0][3] as Date).toISOString(), "2026-10-30T04:59:59.999Z");
  assert.match(String(calls[0][0]), /DATE_SUB\(Tel_Fecha_Hora, INTERVAL 5 HOUR\)/);
  assert.equal(result.estado, "disponible");
  assert.equal(result.desarrolladores[0].segundos_activos, null);
});

test("un período vacío informa dónde existe telemetría sin mezclar esos registros con la consulta actual", async () => {
  const prisma = { $queryRawUnsafe: async (sql: string) => sql.includes("MIN(Tel_Fecha_Hora)")
    ? [{ primera: new Date("2026-09-29T13:00:00.000Z"), ultima: new Date("2026-09-30T19:07:56.000Z") }] : [],
  } as unknown as PrismaClient;
  const result = await loadMonitoreoReporte(prisma, personas, "2026-10-29", "2026-10-29");
  assert.equal(result.telemetria_consultada, true);
  assert.equal(result.desarrolladores[0].registros, 0);
  assert.equal(result.desarrolladores[0].segundos_activos, null);
  assert.deepEqual(result.rango_disponible, { desde: "2026-09-29", hasta: "2026-09-30" });
});

test("un esquema antiguo sin tablas no bloquea el reporte de rendimiento", async () => {
  const prisma = { $queryRawUnsafe: async () => { throw new Error("Table does not exist"); } } as unknown as PrismaClient;
  assert.equal((await loadMonitoreoReporte(prisma, personas, "2026-10-28", "2026-10-29")).estado, "no_disponible");
});

test("formatea tiempos sin confundir ausencia de datos con cero actividad", () => {
  assert.equal(duracionMonitoreo(null), "Sin datos");
  assert.equal(duracionMonitoreo(0), "0 s");
  assert.equal(duracionMonitoreo(45), "45 s");
  assert.equal(duracionMonitoreo(5400), "1 h 30 min");
  assert.equal(duracionMonitoreo(25 * 3600), "25 h 00 min");
});
