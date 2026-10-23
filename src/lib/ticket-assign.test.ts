import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { asignacionSoloPropia } from "./ticket-assign";

const alcance = { aseCodes: [101, 102], perCodes: [55] };

describe("asignacion propia de tickets", () => {
  it("acepta al propio desarrollador y completa su ficha", () => {
    assert.deepEqual(asignacionSoloPropia([{ usuCod: 101 }], alcance), [
      { usuCod: 101, perCod: 55 },
    ]);
  });

  it("acepta cualquiera de sus usuarios EXA (multi-sucursal)", () => {
    assert.deepEqual(asignacionSoloPropia([{ usuCod: 102, perCod: 55 }], alcance), [
      { usuCod: 102, perCod: 55 },
    ]);
  });

  it("rechaza asignar a otra persona", () => {
    assert.equal(asignacionSoloPropia([{ usuCod: 999 }], alcance), null);
    assert.equal(
      asignacionSoloPropia([{ usuCod: 101 }, { usuCod: 999 }], alcance),
      null
    );
  });

  it("no deja asociar la ficha de otra persona", () => {
    assert.deepEqual(asignacionSoloPropia([{ usuCod: 101, perCod: 77 }], alcance), [
      { usuCod: 101, perCod: 55 },
    ]);
  });

  it("rechaza una lista vacia", () => {
    assert.equal(asignacionSoloPropia([], alcance), null);
  });
});
