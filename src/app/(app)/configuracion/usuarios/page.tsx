"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, UserMinus, UserPlus } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabel, type UserRole } from "@/lib/auth/users";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/list-controls";
import { Select } from "@/components/ui/select";
import { usePagination } from "@/hooks/use-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  Usu_Cod: number;
  Nombre: string;
  Cedula: string;
  Sucursal: string;
  Per_Cod: number | null;
  enPanel: boolean;
  Pan_Rol: UserRole | null;
};

const ROLES: UserRole[] = ["developer", "atencion", "manager"];

function roleVariant(rol: string | null) {
  if (rol === "manager") return "info" as const;
  if (rol === "atencion") return "warning" as const;
  return "secondary" as const;
}

export default function UsuariosConfigPage() {
  const { db } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
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

  const enGestion = filtered.filter((r) => r.enPanel);
  const disponibles = filtered.filter((r) => !r.enPanel);
  const gestionPager = usePagination(enGestion, { initialSize: 10, resetKey: q });
  const empresaPager = usePagination(disponibles, { initialSize: 10, resetKey: q });

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

  return (
    <>
      <Topbar title="Usuarios" subtitle="Administracion" />
      <main className="w-full min-w-0 animate-fade-in space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6 lg:px-8">
        <Card className="w-full min-w-0">
          <CardHeader>
            <CardTitle>Equipo de la gestion</CardTitle>
            <CardDescription>
              Usuarios activos de la empresa en EXA. Quienes estan en la gestion pueden entrar al
              panel. Atencion al cliente asigna tareas y tickets, sin monitoreo, capturas ni
              configuracion.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nombre o cedula..."
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Actualizar
            </Button>
            <Badge variant="info">{rows.filter((r) => r.enPanel).length} en gestion</Badge>
            <Badge variant="muted">{rows.length} en la empresa</Badge>
          </CardContent>
        </Card>

        {error && <Alert variant="destructive">{error}</Alert>}
        {ok && <Alert variant="success">{ok}</Alert>}

        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">En la gestion</CardTitle>
          </CardHeader>
          <Table className="min-w-[640px] lg:min-w-0">
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
                  <TableCell>
                    <div className="font-semibold">{r.Nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.Cedula && `Cedula ${r.Cedula}`, r.Sucursal, r.Per_Cod ? `Per ${r.Per_Cod}` : "Sin ficha"]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <Badge variant={roleVariant(r.Pan_Rol)} className="w-fit">
                        {roleLabel(r.Pan_Rol)}
                      </Badge>
                      <Select
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
                  <TableCell className="text-right">
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

        <Card className="w-full min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Usuarios de la empresa</CardTitle>
            <CardDescription>Activos en EXA que todavia no entran al panel.</CardDescription>
          </CardHeader>
          <Table className="min-w-[560px] lg:min-w-0">
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
                  <TableCell>
                    <div className="font-semibold">{r.Nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.Cedula && `Cedula ${r.Cedula}`, r.Sucursal].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
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
                  <TableCell className="text-right">
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
      </main>
    </>
  );
}
