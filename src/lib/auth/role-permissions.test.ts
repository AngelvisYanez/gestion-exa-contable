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
    // Puede asignarse tickets, pero la API limita a su propio usuario.
    assert.equal(permissions["tickets.asignar"], true);
  });

  it("ignora el 0 viejo de tickets.asignar en cookies del desarrollador", () => {
    const viejo = "1001011001"; // cookie previa: tickets.asignar apagado
    assert.equal(decodeRolePermissions("developer", viejo, 2)["tickets.asignar"], false);
    assert.equal(decodeRolePermissions("developer", viejo, 1)["tickets.asignar"], true);
    // Los demas roles conservan su valor.
    assert.equal(decodeRolePermissions("atencion", "1001011011", 1)["tickets.asignar"], true);
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
