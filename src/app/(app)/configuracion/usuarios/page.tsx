"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, UserMinus, UserPlus } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabel, type UserRole } from "@/lib/auth/users";
import type { RolePermissionKey, RolePermissions } from "@/lib/auth/role-permissions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/list-controls";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/hooks/use-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PermisosTab } from "@/components/usuarios/permisos-tab";
import { AuditoriaTab } from "@/components/usuarios/auditoria-tab";

type Row = {
  Usu_Cod: number;
  Nombre: string;
  Cedula: string;
  Sucursal: string;
  Per_Cod: number | null;
  enPanel: boolean;
  Pan_Rol: UserRole | null;
};

type Seccion = "equipo" | "empresa" | "permisos" | "auditoria";

const ROLES: UserRole[] = ["developer", "atencion", "manager"];

function roleVariant(rol: string | null) {
  if (rol === "manager") return "info" as const;
  if (rol === "atencion") return "warning" as const;
  return "secondary" as const;
}

export default function UsuariosConfigPage() {
  const { db } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [seccion, setSeccion] = useState<Seccion>("equipo");
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "todos">("todos");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [busyPermission, setBusyPermission] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Record<UserRole, RolePermissions> | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [rolNuevo, setRolNuevo] = useState<Record<number, UserRole>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/config/usuarios?Ses_Dat_Dis=${encodeURIComponent(db)}`);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo cargar");
      setRows(j.usuarios || []);
      setRolePermissions(j.rolePermissions || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) =>
      `${r.Nombre} ${r.Cedula} ${r.Sucursal}`.toLowerCase().includes(n)
    );
  }, [rows, q]);

  const enGestion = filtered.filter((r) => r.enPanel && (roleFilter === "todos" || r.Pan_Rol === roleFilter));
  const disponibles = filtered.filter((r) => !r.enPanel);
  const gestionPager = usePagination(enGestion, { initialSize: 10, resetKey: `${q}|${roleFilter}` });
  const empresaPager = usePagination(disponibles, { initialSize: 10, resetKey: q });

  const totalGestion = rows.filter((r) => r.enPanel).length;
  const totalFuera = rows.length - totalGestion;
  const rolesVisibles = roleFilter === "todos" ? ROLES : [roleFilter];

  const act = async (usuCod: number, action: "add" | "remove" | "role", rol?: UserRole) => {
    setBusy(usuCod);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/config/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Ses_Dat_Dis: db, action, Usu_Cod: usuCod, rol }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo guardar");
      setRows(j.usuarios || []);
      setOk(
        action === "remove"
          ? "Usuario retirado de la gestion."
          : action === "add"
            ? "Usuario agregado a la gestion."
            : "Rol actualizado. Debe volver a iniciar sesion para aplicar el cambio."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(null);
    }
  };

  const postPermisos = async (body: Record<string, unknown>, key: string, exito: string) => {
    setBusyPermission(key);
    setError("");
    setOk("");
    try {
      const res = await fetch("/api/config/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudo guardar el permiso");
      setRolePermissions(j.rolePermissions);
      setOk(exito);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar el permiso");
    } finally {
      setBusyPermission("");
    }
  };

  const changePermission = (rol: UserRole, permiso: RolePermissionKey, habilitado: boolean) =>
    postPermisos(
      { action: "permission", rol, permiso, habilitado },
      `${rol}:${permiso}`,
      "Permiso actualizado. Los usuarios de ese rol deben volver a iniciar sesion."
    );

  const resetPermissions = (rol: UserRole) =>
    postPermisos(
      { action: "reset_permissions", rol },
      `reset:${rol}`,
      `Se restablecieron los valores iniciales de ${roleLabel(rol)}. Deben volver a iniciar sesion.`
    );

  const filtros = (conRol: boolean) => (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o cedula..."
          aria-label="Buscar usuario"
        />
      </div>
      {conRol && (
        <Select
          aria-label="Filtrar usuarios por rol"
          className="w-full sm:w-[190px]"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | "todos")}
        >
          <option value="todos">Todos los roles</option>
          {ROLES.map((rol) => (
            <option key={rol} value={rol}>{roleLabel(rol)}</option>
          ))}
        </Select>
      )}
    </div>
  );

  return (
    <>
      <Topbar title="Usuarios" subtitle="Administracion" />
      <main className="w-full min-w-0 animate-fade-in space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6 lg:px-8">
        <Card className="w-full min-w-0">
          <CardHeader>
            <CardTitle>Equipo de la gestion</CardTitle>
            <CardDescription>
              Solo quienes estan en la gestion con un rol pueden entrar al panel y se les hace
              monitoreo. Los permisos de cada rol se configuran en su pestana y todo cambio queda en la
              auditoria.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Actualizar
            </Button>
            <Badge variant="info">{totalGestion} en gestion</Badge>
            <Badge variant="muted">{rows.length} en la empresa</Badge>
          </CardContent>
        </Card>

        {error && <Alert variant="destructive">{error}</Alert>}
        {ok && <Alert variant="success">{ok}</Alert>}

        <Tabs value={seccion} onValueChange={(v) => setSeccion(v as Seccion)} className="w-full min-w-0">
          <TabsList>
            <TabsTrigger value="equipo">Equipo ({totalGestion})</TabsTrigger>
            <TabsTrigger value="empresa">Empresa ({totalFuera})</TabsTrigger>
            <TabsTrigger value="permisos">Permisos</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          </TabsList>

          <TabsContent value="equipo">
            <Card className="w-full min-w-0 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">En la gestion</CardTitle>
                <CardDescription>
                  Cada persona tiene un rol; el rol define sus permisos y es lo que se monitorea.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">{filtros(true)}</CardContent>
              <Table className="responsive-card-table min-w-[640px] lg:min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Usuario</TableHead>
                    <TableHead className="min-w-[240px]">Rol</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gestionPager.slice.map((r) => (
                    <TableRow key={r.Usu_Cod}>
                      <TableCell data-label="Usuario">
                        <div className="font-semibold">{r.Nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.Cedula && `Cedula ${r.Cedula}`, r.Sucursal, r.Per_Cod ? `Per ${r.Per_Cod}` : "Sin ficha"]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell data-label="Rol">
                        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <Badge variant={roleVariant(r.Pan_Rol)} className="w-fit">
                            {roleLabel(r.Pan_Rol)}
                          </Badge>
                          <Select
                            aria-label={`Rol de ${r.Nombre}`}
                            className="h-8 w-full min-w-0 text-xs sm:w-[180px]"
                            value={r.Pan_Rol || "developer"}
                            disabled={busy === r.Usu_Cod}
                            onChange={(e) =>
                              void act(r.Usu_Cod, "role", e.target.value as UserRole)
                            }
                          >
                            {ROLES.map((rol) => (
                              <option key={rol} value={rol}>
                                {roleLabel(rol)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </TableCell>
                      <TableCell data-label="Acción" className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={busy === r.Usu_Cod}
                          onClick={() => void act(r.Usu_Cod, "remove")}
                        >
                          <UserMinus className="size-3.5" />
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && enGestion.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        Nadie de este filtro esta en la gestion.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="px-4 pb-4">
                <PaginationBar
                  page={gestionPager.page}
                  totalPages={gestionPager.totalPages}
                  total={gestionPager.total}
                  from={gestionPager.from}
                  to={gestionPager.to}
                  pageSize={gestionPager.pageSize}
                  onPageChange={gestionPager.setPage}
                  onPageSizeChange={gestionPager.setPageSize}
                />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="empresa">
            <Card className="w-full min-w-0 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Usuarios de la empresa</CardTitle>
                <CardDescription>
                  Activos en EXA que todavia no estan en la gestion: no entran al panel ni se monitorean
                  hasta que les asignes un rol.
                </CardDescription>
              </CardHeader>
              <CardContent className="pb-3">{filtros(false)}</CardContent>
              <Table className="responsive-card-table min-w-[560px] lg:min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Usuario</TableHead>
                    <TableHead className="min-w-[180px]">Rol al agregar</TableHead>
                    <TableHead className="w-[130px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {empresaPager.slice.map((r) => (
                    <TableRow key={r.Usu_Cod}>
                      <TableCell data-label="Usuario">
                        <div className="font-semibold">{r.Nombre}</div>
                        <div className="text-xs text-muted-foreground">
                          {[r.Cedula && `Cedula ${r.Cedula}`, r.Sucursal].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell data-label="Rol al agregar">
                        <Select
                          aria-label={`Rol al agregar a ${r.Nombre}`}
                          className="h-8 w-full min-w-0 text-xs sm:w-[180px]"
                          value={rolNuevo[r.Usu_Cod] || "developer"}
                          onChange={(e) =>
                            setRolNuevo((prev) => ({
                              ...prev,
                              [r.Usu_Cod]: e.target.value as UserRole,
                            }))
                          }
                        >
                          {ROLES.map((rol) => (
                            <option key={rol} value={rol}>
                              {roleLabel(rol)}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell data-label="Acción" className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          className="w-full sm:w-auto"
                          disabled={busy === r.Usu_Cod}
                          onClick={() => void act(r.Usu_Cod, "add", rolNuevo[r.Usu_Cod] || "developer")}
                        >
                          <UserPlus className="size-3.5" />
                          Agregar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && disponibles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No hay mas usuarios de la empresa fuera de la gestion.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="px-4 pb-4">
                <PaginationBar
                  page={empresaPager.page}
                  totalPages={empresaPager.totalPages}
                  total={empresaPager.total}
                  from={empresaPager.from}
                  to={empresaPager.to}
                  pageSize={empresaPager.pageSize}
                  onPageChange={empresaPager.setPage}
                  onPageSizeChange={empresaPager.setPageSize}
                />
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="permisos" className="space-y-3">
            <Select
              aria-label="Filtrar permisos por rol"
              className="w-full sm:w-[220px]"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as UserRole | "todos")}
            >
              <option value="todos">Todos los roles</option>
              {ROLES.map((rol) => (
                <option key={rol} value={rol}>{roleLabel(rol)}</option>
              ))}
            </Select>
            <PermisosTab
              roles={rolesVisibles}
              rolePermissions={rolePermissions}
              loading={loading}
              busy={busyPermission}
              onToggle={(rol, permiso, habilitado) => void changePermission(rol, permiso, habilitado)}
              onReset={(rol) => void resetPermissions(rol)}
            />
          </TabsContent>

          <TabsContent value="auditoria">
            <AuditoriaTab activa={seccion === "auditoria"} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
