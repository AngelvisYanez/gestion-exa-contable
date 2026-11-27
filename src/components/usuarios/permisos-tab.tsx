"use client";

import { Fragment, useMemo } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ROLE_PERMISSION_CATALOG,
  ROLE_PERMISSION_KEYS,
  ROLE_PERMISSION_LABELS,
  defaultRolePermissions,
  isLockedPermission,
  permissionRequires,
  type RolePermissionKey,
  type RolePermissions,
} from "@/lib/auth/role-permissions";
import { roleLabel, type UserRole } from "@/lib/auth/users";

type Props = {
  roles: UserRole[];
  rolePermissions: Record<UserRole, RolePermissions> | null;
  loading: boolean;
  /** "rol:permiso" o "reset:rol" mientras se guarda. */
  busy: string;
  onToggle: (rol: UserRole, permiso: RolePermissionKey, habilitado: boolean) => void;
  onReset: (rol: UserRole) => void;
};

export function PermisosTab({ roles, rolePermissions, loading, busy, onToggle, onReset }: Props) {
  const grupos = useMemo(() => {
    const map = new Map<string, typeof ROLE_PERMISSION_CATALOG>();
    for (const item of ROLE_PERMISSION_CATALOG) {
      map.set(item.modulo, [...(map.get(item.modulo) || []), item]);
    }
    return [...map.entries()];
  }, []);

  const resumen = (rol: UserRole) => {
    const actuales = rolePermissions?.[rol];
    const iniciales = defaultRolePermissions(rol);
    if (!actuales) return { activos: 0, cambios: 0 };
    return {
      activos: ROLE_PERMISSION_KEYS.filter((k) => actuales[k]).length,
      cambios: ROLE_PERMISSION_KEYS.filter((k) => actuales[k] !== iniciales[k]).length,
    };
  };

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Permisos por rol</CardTitle>
        <CardDescription>
          Cada permiso se puede activar o desactivar para cualquier rol. Los valores iniciales de
          cada rol son solo el punto de partida; cada cambio queda en la pestana Auditoria. Quien
          ya tiene sesion abierta debe volver a iniciarla para aplicar los cambios.
        </CardDescription>
      </CardHeader>
      <p className="px-4 pb-2 text-xs text-muted-foreground sm:hidden">
        Desliza la tabla para ver todos los roles.
      </p>
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Permiso</TableHead>
            {roles.map((rol) => {
              const { activos, cambios } = resumen(rol);
              return (
                <TableHead key={rol} className="min-w-[170px]">
                  <div className="flex flex-col gap-1.5 normal-case tracking-normal">
                    <span className="text-xs font-bold uppercase tracking-wide">{roleLabel(rol)}</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {activos} de {ROLE_PERMISSION_KEYS.length} activos
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-fit gap-1 px-2 text-[11px]"
                      disabled={cambios === 0 || busy !== "" || loading || !rolePermissions}
                      onClick={() => onReset(rol)}
                    >
                      {busy === `reset:${rol}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <RotateCcw className="size-3" />
                      )}
                      Valores iniciales{cambios ? ` (${cambios})` : ""}
                    </Button>
                  </div>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map(([modulo, items]) => (
            <Fragment key={modulo}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell
                  colSpan={roles.length + 1}
                  className="py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {modulo}
                </TableCell>
              </TableRow>
              {items.map((item) => (
                <TableRow key={item.key}>
                  <TableCell>
                    <div className="font-medium">{item.accion}</div>
                    <div className="text-xs text-muted-foreground">{item.descripcion}</div>
                  </TableCell>
                  {roles.map((rol) => {
                    const actuales = rolePermissions?.[rol];
                    const inicial = defaultRolePermissions(rol)[item.key];
                    const habilitado = actuales?.[item.key] ?? inicial;
                    const requiere = permissionRequires(item.key);
                    const requiereApagado = Boolean(requiere && actuales && !actuales[requiere]);
                    const bloqueado = isLockedPermission(rol, item.key);
                    const personalizado = actuales ? habilitado !== inicial : false;
                    const id = `${rol}:${item.key}`;
                    return (
                      <TableCell key={rol}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Switch
                            aria-label={`${habilitado ? "Desactivar" : "Activar"} ${item.accion.toLowerCase()} (${modulo}) para ${roleLabel(rol)}`}
                            checked={habilitado && !requiereApagado}
                            disabled={
                              busy !== "" || loading || !rolePermissions || requiereApagado || bloqueado
                            }
                            onCheckedChange={(checked) => onToggle(rol, item.key, checked)}
                          />
                          {busy === id ? (
                            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                          ) : requiereApagado && requiere ? (
                            <span className="text-xs text-muted-foreground">
                              Requiere {ROLE_PERMISSION_LABELS[requiere].modulo} &gt;{" "}
                              {ROLE_PERMISSION_LABELS[requiere].accion}
                            </span>
                          ) : bloqueado ? (
                            <Badge variant="muted">Protegido</Badge>
                          ) : (
                            <>
                              <span className="text-xs">{habilitado ? "Activo" : "Inactivo"}</span>
                              {personalizado && <Badge variant="warning">Personalizado</Badge>}
                            </>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
      <CardContent className="space-y-1 pt-4 text-xs text-muted-foreground">
        <p>
          Las acciones de Tareas y Tickets requieren que el modulo (Ver) este activo. El desarrollador
          solo puede asignarse tickets a si mismo y editar sus propias tareas, aunque tenga el permiso.
        </p>
        <p>
          El permiso Configuracion &gt; Administrar del encargado esta protegido para que nunca se
          pierda el acceso a esta pantalla.
        </p>
      </CardContent>
    </Card>
  );
}
