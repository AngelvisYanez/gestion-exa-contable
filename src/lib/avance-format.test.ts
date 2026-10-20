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
      horas: null,
      enlaces: [],
      adjuntos: [],
    });
  });

  it("mantiene los avances anteriores sin apoyo", () => {
    const parsed = parseAvanceDescripcion("Trabajo previo\nHoras: 2");
    assert.equal(parsed.realizado, "Trabajo previo");
    assert.equal(parsed.apoyo, null);
    assert.equal(parsed.horas, 2);
  });
});
