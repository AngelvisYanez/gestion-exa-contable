import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLAZOS_TAREA, ayudaPlazo, fechaFinPorPlazo, fmtFechaYmd, normalizePlazo } from "./plazo";
import { hoyFecha } from "./timezone";

function addDias(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dias));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

describe("normalizePlazo", () => {
  it("acepta los tres plazos sin importar mayúsculas", () => {
    assert.equal(normalizePlazo("diaria"), "Diaria");
    assert.equal(normalizePlazo(" SEMANAL "), "Semanal");
    assert.equal(normalizePlazo("Mensual"), "Mensual");
  });

  it("devuelve null cuando no hay plazo", () => {
    assert.equal(normalizePlazo(null), null);
    assert.equal(normalizePlazo(undefined), null);
    assert.equal(normalizePlazo(""), null);
    assert.equal(normalizePlazo("anual"), null);
  });

  it("expone exactamente los tres plazos del diálogo", () => {
    assert.deepEqual([...PLAZOS_TAREA], ["Diaria", "Semanal", "Mensual"]);
  });
});

describe("fechaFinPorPlazo", () => {
  it("sin plazo no fija fecha de fin", () => {
    assert.equal(fechaFinPorPlazo(null), null);
    assert.equal(fechaFinPorPlazo(undefined), null);
    assert.equal(fechaFinPorPlazo("otra cosa"), null);
  });

  it("Diaria vence hoy", () => {
    assert.equal(fechaFinPorPlazo("Diaria"), hoyFecha());
  });

  it("Semanal vence 7 días después de hoy", () => {
    assert.equal(fechaFinPorPlazo("Semanal"), addDias(hoyFecha(), 7));
  });

  it("Mensual vence un mes después de hoy", () => {
    const [y, m, d] = hoyFecha().split("-").map(Number);
    const anio = m === 12 ? y + 1 : y;
    const mes = m === 12 ? 1 : m + 1;
    const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const esperado = `${anio}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimoDia)).padStart(2, "0")}`;
    assert.equal(fechaFinPorPlazo("Mensual"), esperado);
  });

  it("usa la fecha base cuando se indica", () => {
    assert.equal(fechaFinPorPlazo("Diaria", "2026-10-20"), "2026-10-20");
    assert.equal(fechaFinPorPlazo("Semanal", "2026-10-20"), "2026-10-27");
    assert.equal(fechaFinPorPlazo("Semanal", "2026-10-25"), "2026-11-01");
  });

  it("Mensual recorta el día cuando el mes destino es más corto", () => {
    assert.equal(fechaFinPorPlazo("Mensual", "2026-01-31"), "2026-02-28");
    assert.equal(fechaFinPorPlazo("Mensual", "2028-01-31"), "2028-02-29");
    assert.equal(fechaFinPorPlazo("Mensual", "2026-12-15"), "2027-01-15");
    assert.equal(fechaFinPorPlazo("Mensual", "2026-05-31"), "2026-06-30");
  });
});

describe("fmtFechaYmd", () => {
  it("formatea sin corrimiento por zona horaria", () => {
    assert.match(fmtFechaYmd("2026-10-20"), /20/);
    assert.ok(fmtFechaYmd("2026-10-20").includes("2026"));
    assert.equal(fmtFechaYmd("2026-10-20"), "20 de octubre de 2026");
  });

  it("devuelve vacío con fechas inválidas", () => {
    assert.equal(fmtFechaYmd(""), "");
    assert.equal(fmtFechaYmd(null), "");
    assert.equal(fmtFechaYmd("no-es-fecha"), "");
  });
});

describe("ayudaPlazo", () => {
  it("explica cuándo vence según el plazo", () => {
    assert.match(ayudaPlazo("Diaria"), /hoy/);
    assert.match(ayudaPlazo("Semanal"), /Se vence el /);
    assert.match(ayudaPlazo("Mensual"), /Se vence el /);
    assert.match(ayudaPlazo(null), /Sin plazo/);
  });
});
