"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PaginationBar } from "@/components/list-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PageSize } from "@/hooks/use-pagination";
import {
  ACCIONES_AUDITORIA,
  type AccionAuditoria,
  type FilaAuditoria,
} from "@/lib/auth/auditoria-acciones";
import { roleLabel } from "@/lib/auth/users";
import { fmtFechaHoraZona } from "@/lib/timezone";

const VARIANTES: Record<AccionAuditoria, BadgeProps["variant"]> = {
  permiso_activado: "success",
  permiso_desactivado: "warning",
  permisos_restablecidos: "info",
  rol_cambiado: "violet",
  usuario_agregado: "success",
  usuario_retirado: "danger",
  encargado_forzado: "info",
  acceso_denegado: "danger",
  login_rechazado: "danger",
};

type Respuesta = {
  success: boolean;
  message?: string;
  filas: FilaAuditoria[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function AuditoriaTab({ activa }: { activa: boolean }) {
  const [filas, setFilas] = useState<FilaAuditoria[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [accion, setAccion] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({
        view: "auditoria",
        page: String(page),
        pageSize: String(pageSize),
      });
      if (busqueda) qs.set("q", busqueda);
      if (accion) qs.set("accion", accion);
      if (desde) qs.set("desde", desde);
      if (hasta) qs.set("hasta", hasta);
      const res = await fetch(`/api/config/usuarios?${qs.toString()}`);
      const j = (await res.json()) as Respuesta;
      if (!j.success) throw new Error(j.message || "No se pudo cargar la auditoria");
      setFilas(j.filas || []);
      setTotal(j.total || 0);
      setTotalPages(j.totalPages || 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, busqueda, accion, desde, hasta]);

  // Solo consulta cuando la pestana esta abierta.
  useEffect(() => {
    if (activa) void cargar();
  }, [activa, cargar]);

  const aplicarBusqueda = () => {
    setPage(1);
    setBusqueda(q.trim());
  };

  const desdeN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hastaN = Math.min(total, page * pageSize);

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Auditoria de permisos y roles</CardTitle>
        <CardDescription>
          Registro de quien agrego o retiro usuarios, cambio roles, activo o desactivo permisos,
          restablecio valores, o intento entrar sin autorizacion. Las fechas estan en hora de Ecuador.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            aplicarBusqueda();
          }}
        >
          <div className="relative min-w-0 w-full flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Persona, permiso o detalle..."
              aria-label="Buscar en la auditoria"
            />
          </div>
          <Select
            aria-label="Filtrar por accion"
            className="w-full sm:w-[210px]"
            value={accion}
            onChange={(e) => {
              setPage(1);
              setAccion(e.target.value);
            }}
          >
            <option value="">Todas las acciones</option>
            {(Object.keys(ACCIONES_AUDITORIA) as AccionAuditoria[]).map((k) => (
              <option key={k} value={k}>
                {ACCIONES_AUDITORIA[k]}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            aria-label="Desde"
            className="w-full sm:w-[160px]"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => {
              setPage(1);
              setDesde(e.target.value);
            }}
          />
          <Input
            type="date"
            aria-label="Hasta"
            className="w-full sm:w-[160px]"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => {
              setPage(1);
              setHasta(e.target.value);
            }}
          />
          <Button type="submit" variant="secondary" disabled={loading}>
            <Search />
            Buscar
          </Button>
          <Button type="button" variant="outline" onClick={() => void cargar()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Actualizar
          </Button>
        </form>

        {error && <Alert variant="destructive">{error}</Alert>}
      </CardContent>

      <Table className="responsive-card-table min-w-[760px] lg:min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Fecha</TableHead>
            <TableHead className="min-w-[150px]">Accion</TableHead>
            <TableHead className="min-w-[170px]">Realizado por</TableHead>
            <TableHead className="min-w-[170px]">Afecta a</TableHead>
            <TableHead className="min-w-[240px]">Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => {
            const clave = f.Aud_Accion as AccionAuditoria;
            return (
              <TableRow key={f.Aud_Cod}>
                <TableCell data-label="Fecha" className="whitespace-nowrap text-xs">
                  {fmtFechaHoraZona(f.Aud_Fecha, { dateStyle: "short", timeStyle: "medium" })}
                </TableCell>
                <TableCell data-label="Accion">
                  <Badge variant={VARIANTES[clave] || "muted"}>
                    {ACCIONES_AUDITORIA[clave] || f.Aud_Accion}
                  </Badge>
                </TableCell>
                <TableCell data-label="Realizado por">
                  <div className="font-semibold">{f.Aud_Actor_Nombre || "Desconocido"}</div>
                  <div className="text-xs text-muted-foreground">
                    {[f.Aud_Actor_Rol && roleLabel(f.Aud_Actor_Rol), f.Aud_Ip].filter(Boolean).join(" · ")}
                  </div>
                </TableCell>
                <TableCell data-label="Afecta a">
                  {f.Aud_Objetivo_Nombre ? (
                    <div className="font-semibold">{f.Aud_Objetivo_Nombre}</div>
                  ) : f.Aud_Rol ? (
                    <div className="font-semibold">Rol {roleLabel(f.Aud_Rol)}</div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell data-label="Detalle" className="text-xs">
                  {(f.Aud_Anterior || f.Aud_Nuevo) && (
                    <div className="mb-0.5 font-medium">
                      {f.Aud_Anterior || "—"} &rarr; {f.Aud_Nuevo || "—"}
                    </div>
                  )}
                  <div className="text-muted-foreground">{f.Aud_Detalle || "—"}</div>
                </TableCell>
              </TableRow>
            );
          })}
          {!loading && filas.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-sm text-muted-foreground">
                Aun no hay registros con estos filtros.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="px-4 pb-4">
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          from={desdeN}
          to={hastaN}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPage(1);
            setPageSize(size);
          }}
        />
      </div>
    </Card>
  );
}
