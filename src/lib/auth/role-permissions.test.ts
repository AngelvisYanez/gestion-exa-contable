import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_PERMISSION_KEYS,
  decodeRolePermissions,
  defaultRolePermissions,
  effectiveRolePermissions,
  encodeRolePermissions,
  hasRolePermission,
  isLockedPermission,
  permissionRequires,
} from "./role-permissions";

describe("permisos por rol", () => {
  it("conserva los valores iniciales del desarrollador", () => {
    const permissions = defaultRolePermissions("developer");
    assert.equal(permissions["tareas.crear"], true);
    assert.equal(permissions["tareas.asignar"], false);
    assert.equal(permissions["tareas.eliminar"], false);
    assert.equal(permissions["tickets.crear"], false);
    // Puede asignarse tickets, pero la API limita a su propio usuario.
    assert.equal(permissions["tickets.asignar"], true);
  });

  it("el encargado inicia con todos los permisos", () => {
    const permissions = defaultRolePermissions("manager");
    assert.ok(ROLE_PERMISSION_KEYS.every((key) => permissions[key]));
  });

  it("permite activar un permiso que el rol no traia", () => {
    const permissions = effectiveRolePermissions("developer", {
      "tareas.asignar": true,
      "monitoreo.ver": true,
    });
    assert.equal(permissions["tareas.asignar"], true);
    assert.equal(permissions["monitoreo.ver"], true);
  });

  it("permite desactivar un permiso que el rol traia", () => {
    const permissions = effectiveRolePermissions("atencion", { "tareas.crear": false });
    assert.equal(permissions["tareas.crear"], false);
    const manager = effectiveRolePermissions("manager", { "tickets.convertir": false });
    assert.equal(manager["tickets.convertir"], false);
  });

  it("no deja apagar la administracion del encargado", () => {
    assert.equal(isLockedPermission("manager", "configuracion.administrar"), true);
    assert.equal(isLockedPermission("atencion", "configuracion.administrar"), false);
    const permissions = effectiveRolePermissions("manager", { "configuracion.administrar": false });
    assert.equal(permissions["configuracion.administrar"], true);
  });

  it("requiere acceso al modulo para sus acciones", () => {
    const actor = {
      role: "developer" as const,
      permissions: effectiveRolePermissions("developer", { "tareas.ver": false }),
    };
    assert.equal(permissionRequires("tareas.crear"), "tareas.ver");
    assert.equal(hasRolePermission(actor, "tareas.ver"), false);
    assert.equal(hasRolePermission(actor, "tareas.crear"), false);
    assert.equal(hasRolePermission(actor, "tickets.ver"), true);
  });

  it("guarda todos los permisos en la cookie compacta", () => {
    const overrides = { "tickets.asignar": false, "monitoreo.ver": true };
    const encoded = encodeRolePermissions("atencion", overrides);
    assert.equal(encoded.length, ROLE_PERMISSION_KEYS.length);
    const decoded = decodeRolePermissions("atencion", encoded);
    assert.equal(decoded["tickets.asignar"], false);
    assert.equal(decoded["monitoreo.ver"], true);
    assert.equal(decoded["tareas.crear"], true);
  });

  it("lee cookies viejas de 10 permisos y completa los nuevos con el valor inicial", () => {
    const viejo = "1001011001";
    const decoded = decodeRolePermissions("developer", viejo, 2);
    assert.equal(decoded["tareas.crear"], false);
    assert.equal(decoded["tareas.editar"], false);
    assert.equal(decoded["tickets.avance"], true);
    assert.equal(decoded["mis_tareas.ver"], true);
    assert.equal(decoded["capacitaciones.ver"], true);
    assert.equal(decoded["monitoreo.ver"], false);
  });

  it("ignora el 0 viejo de tickets.asignar del desarrollador en cookies version 1", () => {
    const viejo = "1001011001";
    assert.equal(decodeRolePermissions("developer", viejo, 1)["tickets.asignar"], true);
    assert.equal(decodeRolePermissions("developer", viejo, 2)["tickets.asignar"], false);
  });
});
