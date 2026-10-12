import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { developerUpdatePermission } from "./tarea-permissions";

describe("permisos del desarrollador en tareas", () => {
  const ownUnassigned = { isCreator: true, isAssigned: false, hasAssignees: false };
  const assignedOther = { isCreator: false, isAssigned: true, hasAssignees: true };
  const unrelated = { isCreator: false, isAssigned: false, hasAssignees: true };

  it("puede editar su tarea aunque no este asignada", () => {
    assert.equal(developerUpdatePermission(ownUnassigned, { touchesContent: true, changesState: false }), "allowed");
  });

  it("conserva el cambio de estado en una tarea ajena asignada, sin editar su contenido", () => {
    assert.equal(developerUpdatePermission(assignedOther, { touchesContent: false, changesState: true }), "allowed");
    assert.equal(developerUpdatePermission(assignedOther, { touchesContent: true, changesState: true }), "forbidden");
  });

  it("no puede editar ni mover una tarea ajena sin asignacion", () => {
    assert.equal(developerUpdatePermission(unrelated, { touchesContent: true, changesState: false }), "forbidden");
    assert.equal(developerUpdatePermission(unrelated, { touchesContent: false, changesState: true }), "forbidden");
    assert.equal(developerUpdatePermission(null, { touchesContent: false, changesState: true }), "forbidden");
  });

  it("no puede marcar como asignada una tarea sin responsable", () => {
    assert.equal(developerUpdatePermission(ownUnassigned, {
      touchesContent: false,
      changesState: true,
      nextState: "Asignado",
    }), "unassigned");
  });
});
