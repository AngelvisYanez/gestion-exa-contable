import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detailIdFromSearch, tareaDetailUrl, ticketDetailUrl } from "./detail-link";

describe("enlaces directos de tareas y tickets", () => {
  it("crea una URL absoluta que identifica la tarea", () => {
    assert.equal(tareaDetailUrl("https://gestion.exacontable.com", 160),
      "https://gestion.exacontable.com/tareas?detalle=160");
  });

  it("conserva el origen para tickets con el mismo número", () => {
    const exa = ticketDetailUrl("https://gestion.exacontable.com", 42, "exa");
    const servicios = ticketDetailUrl("https://gestion.exacontable.com", 42, "servicios");
    assert.notEqual(exa, servicios);
    assert.equal(new URL(servicios).searchParams.get("db"), "servicios");
  });

  it("acepta solo identificadores positivos y enteros seguros", () => {
    assert.equal(detailIdFromSearch("?detalle=160"), 160);
    for (const query of ["?detalle=0", "?detalle=-1", "?detalle=1.5", "?detalle=1e2", "?detalle=9007199254740992"]) {
      assert.equal(detailIdFromSearch(query), null);
    }
  });
});
