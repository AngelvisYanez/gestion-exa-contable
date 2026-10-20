import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketTareaKey } from "./ticket-tarea";

describe("ticketTareaKey", () => {
  it("distingue el mismo Tic_Cod en bases distintas", () => {
    assert.notEqual(ticketTareaKey(10, "exa"), ticketTareaKey(10, "servicios"));
  });

  it("normaliza la base ausente a cadena vacía", () => {
    assert.equal(ticketTareaKey(10), ticketTareaKey(10, null));
    assert.equal(ticketTareaKey(10, ""), ticketTareaKey(10, null));
  });

  it("incluye el código del ticket", () => {
    assert.match(ticketTareaKey(42, "exa"), /^42::exa$/);
  });
});
