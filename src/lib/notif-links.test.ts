import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationTarget } from "./notif-links";

const manager = { role: "manager" as const };
const developer = { role: "developer" as const };

describe("destino de las notificaciones", () => {
  it("lleva a la tarea en el listado general para el encargado", () => {
    const t = notificationTarget({ tarCod: 160, db: "exa" }, manager);
    assert.equal(t?.href, "/tareas?detalle=160");
    assert.equal(t?.label, "Ver tarea #160");
  });

  it("lleva al desarrollador a su bandeja de tareas", () => {
    assert.equal(notificationTarget({ tarCod: 160, db: "exa", kind: "tarea" }, developer)?.href, "/mis-tareas?detalle=160");
  });

  it("conserva la base de origen del ticket", () => {
    const g = notificationTarget({ ticCod: 42, db: "servicios", kind: "ticket" }, manager);
    assert.equal(g?.href, "/tickets?detalle=42&db=servicios");
    const d = notificationTarget({ ticCod: 42, db: "servicios", kind: "ticket" }, developer);
    assert.equal(d?.href, "/mis-tickets?detalle=42&db=servicios");
  });

  it("un ticket convertido en tarea abre la tarea", () => {
    const t = notificationTarget({ tarCod: 7, ticCod: 42, db: "exa", kind: "tarea" }, manager);
    assert.equal(t?.kind, "tarea");
  });

  it("no enlaza elementos eliminados, tickets sin base ni sesiones vacías", () => {
    assert.equal(notificationTarget({ tarCod: 1, db: "exa", sinEnlace: true }, manager), null);
    assert.equal(notificationTarget({ ticCod: 1, kind: "ticket" }, manager), null);
    assert.equal(notificationTarget({ tarCod: 1, db: "exa" }, null), null);
  });
});
