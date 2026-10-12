import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeRolePermissions,
  defaultRolePermissions,
  effectiveRolePermissions,
  encodeRolePermissions,
  hasRolePermission,
} from "./role-permissions";

describe("permisos por rol", () => {
  it("conserva los limites iniciales del desarrollador", () => {
    const permissions = defaultRolePermissions("developer");
    assert.equal(permissions["tareas.crear"], true);
    assert.equal(permissions["tareas.asignar"], false);
    assert.equal(permissions["tareas.eliminar"], false);
    assert.equal(permissions["tickets.crear"], false);
  });

  it("permite restringir sin escalar privilegios", () => {
    const permissions = effectiveRolePermissions("developer", {
      "tareas.crear": false,
      "tareas.asignar": true,
    });
    assert.equal(permissions["tareas.crear"], false);
    assert.equal(permissions["tareas.asignar"], false);
  });

  it("requiere acceso al modulo para sus acciones", () => {
    const actor = {
      role: "developer" as const,
      permissions: effectiveRolePermissions("developer", { "tareas.ver": false }),
    };
    assert.equal(hasRolePermission(actor, "tareas.ver"), false);
    assert.equal(hasRolePermission(actor, "tareas.crear"), false);
    assert.equal(hasRolePermission(actor, "tickets.ver"), true);
  });

  it("mantiene las restricciones en la cookie compacta", () => {
    const encoded = encodeRolePermissions("atencion", { "tickets.asignar": false });
    const decoded = decodeRolePermissions("atencion", encoded);
    assert.equal(decoded["tickets.asignar"], false);
    assert.equal(decoded["tareas.crear"], true);
    assert.equal(decodeRolePermissions("developer", encoded)["tareas.asignar"], false);
  });
});
