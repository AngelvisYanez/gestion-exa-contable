import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { esStandby, estadoParaPersistir, estadoTrasAvance, etiquetaEstado, ESTADO_STANDBY } from "./standby";

describe("estadoTrasAvance", () => {
  it("deja la tarea en standby cuando el avance lleva nota de standby", () => {
    assert.equal(estadoTrasAvance({ porcentaje: 40, enStandby: true }), ESTADO_STANDBY);
    assert.equal(estadoTrasAvance({ porcentaje: 0, enStandby: true }), ESTADO_STANDBY);
  });

  it("reanuda la tarea cuando el avance no lleva nota de standby", () => {
    assert.equal(estadoTrasAvance({ porcentaje: 40, enStandby: false }), "En Proceso");
    assert.equal(estadoTrasAvance({ porcentaje: 0, enStandby: false }), "En Proceso");
  });

  it("finaliza la tarea al 100% aunque venga nota de standby", () => {
    assert.equal(estadoTrasAvance({ porcentaje: 100, enStandby: true }), "Finalizada");
    assert.equal(estadoTrasAvance({ porcentaje: 100, enStandby: false }), "Finalizada");
  });
});

describe("esStandby", () => {
  it("reconoce el estado de pausa", () => {
    assert.equal(esStandby("Standby"), true);
    assert.equal(esStandby(" Standby "), true);
    assert.equal(esStandby("Pausada"), true);
    assert.equal(ESTADO_STANDBY, "Pausada");
  });

  it("no confunde otros estados", () => {
    assert.equal(esStandby("En Proceso"), false);
    assert.equal(esStandby("Finalizada"), false);
    assert.equal(esStandby("standby"), false);
    assert.equal(esStandby(null), false);
    assert.equal(esStandby(undefined), false);
  });
});

describe("estado de pausa en API y BD", () => {
  it("guarda la etiqueta de la interfaz como Pausada y la muestra como Standby", () => {
    assert.equal(estadoParaPersistir("Standby"), ESTADO_STANDBY);
    assert.equal(estadoParaPersistir("Pausada"), ESTADO_STANDBY);
    assert.equal(etiquetaEstado("Pausada"), "Standby");
    assert.equal(etiquetaEstado("Standby"), "Standby");
  });

  it("conserva los otros estados", () => {
    assert.equal(estadoParaPersistir("En Proceso"), "En Proceso");
    assert.equal(etiquetaEstado("Asignado"), "Asignado");
  });
});
