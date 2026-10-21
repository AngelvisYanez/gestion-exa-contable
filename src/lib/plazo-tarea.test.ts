import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fechaFinParaPlazo, plazoDesdeFechas, plazoVariant } from "./plazo-tarea";

describe("plazoDesdeFechas", () => {
  it("clasifica por duración entre inicio y fin", () => {
    assert.equal(plazoDesdeFechas("2026-10-20", "2026-10-20"), "Diaria");
    assert.equal(plazoDesdeFechas("2026-10-20", "2026-10-26"), "Semanal");
    assert.equal(plazoDesdeFechas("2026-10-20", "2026-11-30"), "Mensual");
  });

  it("sin fecha de fin la tarea no pertenece a diaria, semanal ni mensual", () => {
    assert.equal(plazoDesdeFechas("2026-10-20", null), "Sin fechas");
    assert.equal(plazoDesdeFechas(null, "2026-10-20"), "Sin fechas");
    assert.equal(plazoDesdeFechas(null, null), "Sin fechas");
  });
});

describe("plazoVariant", () => {
  it("distingue el standby del resto de plazos", () => {
    assert.equal(plazoVariant("Standby"), "warning");
    assert.equal(plazoVariant("Diaria"), "info");
    assert.equal(plazoVariant("Semanal"), "violet");
    assert.equal(plazoVariant("Mensual"), "success");
    assert.equal(plazoVariant("Sin fechas"), "muted");
  });
});

describe("fechaFinParaPlazo", () => {
  it("calcula la fecha fin a partir de la fecha de inicio", () => {
    assert.equal(fechaFinParaPlazo("2026-10-20", "Diaria"), "2026-10-20");
    assert.equal(fechaFinParaPlazo("2026-10-20", "Semanal"), "2026-10-26");
    assert.equal(fechaFinParaPlazo("2026-10-20", "Mensual"), "2026-11-20");
  });

  it("sin fecha de inicio no fija fecha fin", () => {
    assert.equal(fechaFinParaPlazo(null, "Diaria"), "");
    assert.equal(fechaFinParaPlazo("", "Mensual"), "");
  });
});
