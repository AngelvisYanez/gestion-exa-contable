import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAvanceDescripcion, parseAvanceDescripcion } from "./avance-format";

describe("apoyo en cada avance", () => {
  it("conserva el nombre del apoyo junto al contenido del avance", () => {
    const saved = buildAvanceDescripcion({
      realizado: "Se completó la integración.",
      apoyo: "Pérez Ana",
      siguiente: "Revisar con el cliente",
    });

    assert.match(saved, /Apoyo: Pérez Ana/);
    assert.deepEqual(parseAvanceDescripcion(saved), {
      realizado: "Se completó la integración.",
      apoyo: "Pérez Ana",
      siguiente: "Revisar con el cliente",
      bloqueos: "",
      standby: "",
      plazoAnterior: null,
      standbyHasta: null,
      horas: null,
      enlaces: [],
      adjuntos: [],
    });
  });

  it("mantiene los avances anteriores sin apoyo", () => {
    const parsed = parseAvanceDescripcion("Trabajo previo\nHoras: 2");
    assert.equal(parsed.realizado, "Trabajo previo");
    assert.equal(parsed.apoyo, null);
    assert.equal(parsed.standby, "");
    assert.equal(parsed.plazoAnterior, null);
    assert.equal(parsed.standbyHasta, null);
    assert.equal(parsed.horas, 2);
  });
});

describe("standby por feedback o validacion pendiente", () => {
  it("guarda la nota de standby en una linea propia", () => {
    const saved = buildAvanceDescripcion({
      realizado: "Se armó el reporte.",
      standby: "Falta la validación del cliente del reporte.",
    });

    assert.match(saved, /^Standby: Falta la validación del cliente del reporte\.$/m);
    assert.equal(parseAvanceDescripcion(saved).standby, "Falta la validación del cliente del reporte.");
  });

  it("es opcional: sin nota no se escribe la linea", () => {
    const saved = buildAvanceDescripcion({
      realizado: "Se armó el reporte.",
      standby: "   ",
    });

    assert.equal(saved, "Se armó el reporte.");
    assert.equal(parseAvanceDescripcion(saved).standby, "");
  });

  it("registra el plazo anterior que tenía la tarea", () => {
    const saved = buildAvanceDescripcion({
      realizado: "Se armó el reporte.",
      standby: "Falta la validación del cliente.",
      plazoAnterior: "2026-10-12",
    });

    assert.match(saved, /^Plazo anterior: 2026-10-12$/m);
    // La tarea queda sin fecha de fin: no se escribe ninguna fecha de reanudacion.
    assert.doesNotMatch(saved, /^Reanudo:/m);
    const parsed = parseAvanceDescripcion(saved);
    assert.equal(parsed.plazoAnterior, "2026-10-12");
    assert.equal(parsed.standbyHasta, null);
    // El texto principal no se contamina con las lineas nuevas.
    assert.equal(parsed.realizado, "Se armó el reporte.");
  });

  it("entiende el formato anterior que fijaba la fecha de reanudacion", () => {
    const parsed = parseAvanceDescripcion(
      "Se armó el reporte.\nStandby: Falta la validación del cliente.\nPlazo anterior: 2026-10-12\nReanudo: 2026-10-20"
    );

    assert.equal(parsed.standby, "Falta la validación del cliente.");
    assert.equal(parsed.plazoAnterior, "2026-10-12");
    assert.equal(parsed.standbyHasta, "2026-10-20");
    // La linea antigua no debe terminar pegada al texto principal.
    assert.equal(parsed.realizado, "Se armó el reporte.");
  });
});
