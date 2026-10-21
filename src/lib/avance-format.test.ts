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
});
