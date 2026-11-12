"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  UserPlus,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import {
  FilterBar,
  PaginationBar,
  ViewModeToggle,
  useResponsiveListView,
  type ListViewMode,
} from "@/components/list-controls";
import { PrioridadBadge } from "@/components/status-badges";
import { useAuth } from "@/contexts/AuthContext";
import { usePagination } from "@/hooks/use-pagination";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { roleLabel } from "@/lib/auth/users";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Incidencia = {
  Inc_Cod: number | null;
  Inc_Fingerprint: string;
  Inc_Nivel: string;
  Inc_Titulo: string;
  Inc_Mensaje: string;
  Inc_Archivo: string | null;
  Inc_Linea: number | null;
  Inc_Primera_Vez: string;
  Inc_Ultima_Vez: string;
  Inc_Ocurrencias: number;
  Inc_Estado: string;
  Tar_Cod: number | null;
  Inc_Fuente: string | null;
  Inc_Proyecto: "ofsercont" | "relavera" | null;
  Inc_Proyecto_Label: string;
  Inc_Solucion: string | null;
  enLog: boolean;
};

type Asignable = {
  Per_Cod: number;
  Nombre: string;
  Cedula?: string;
  Rol?: string;
};

type Kpis = {
  total: number;
  nuevas: number;
  fatales: number;
  conTarea: number;
  ignoradas: number;
};

type LogFile = { path: string; exists: boolean; size: number };

function nivelTone(nivel: string) {
  if (nivel === "Fatal") return "danger" as const;
  if (nivel === "Error") return "warning" as const;
  if (nivel === "Warning") return "secondary" as const;
  return "muted" as const;
}

function estadoTone(estado: string) {
  if (estado === "Nueva") return "warning" as const;
  if (estado === "Tarea creada") return "info" as const;
  if (estado === "Resuelta") return "success" as const;
  if (estado === "Ignorada") return "muted" as const;
  return "secondary" as const;
}

function fmtWhen(v: string) {
  if (!v) return "—";
  return String(v).replace("T", " ").slice(0, 19);
}

function prioridadSugerida(nivel: string) {
  if (nivel === "Fatal" || nivel === "Error") return "Alta";
  if (nivel === "Warning") return "Media";
  return "Baja";
}

function proyectoTone(proyecto: string | null | undefined) {
  if (proyecto === "relavera") return "secondary" as const;
  if (proyecto === "ofsercont") return "info" as const;
  return "muted" as const;
}

export default function IncidenciasPage() {
  const { db, user } = useAuth();
  const canCreateTask = hasRolePermission(user, "tareas.crear");
  const canAssignTask = hasRolePermission(user, "tareas.asignar");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Incidencia[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [logConfigured, setLogConfigured] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [filtroProyecto, setFiltroProyecto] = useState("todos");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ListViewMode>("grid");
  const displayMode = useResponsiveListView(viewMode);

  const [taskOpen, setTaskOpen] = useState<Incidencia | null>(null);
  const [perCod, setPerCod] = useState("");
  const [prio, setPrio] = useState("Alta");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskOk, setTaskOk] = useState("");

  const [detail, setDetail] = useState<Incidencia | null>(null);
  const [analisis, setAnalisis] = useState("");
  const [analisisError, setAnalisisError] = useState("");
  const [analizando, setAnalizando] = useState(false);
  useEffect(() => {
    setAnalisis("");
    setAnalisisError("");
  }, [detail?.Inc_Cod]);
  const [resolveOpen, setResolveOpen] = useState<Incidencia | null>(null);
  const [resolving, setResolving] = useState(false);
  const [solucionText, setSolucionText] = useState("");
  const [solucionError, setSolucionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url =
        `/api/incidencias?Ses_Dat_Dis=${encodeURIComponent(db)}` +
        `&estado=${encodeURIComponent(filtroEstado)}` +
        `&nivel=${encodeURIComponent(filtroNivel)}` +
        `&proyecto=${encodeURIComponent(filtroProyecto)}` +
        `&q=${encodeURIComponent(q)}&assignees=1`;
      const res = await fetch(url);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error al cargar incidencias");
      setRows(j.incidencias || []);
      setAsignables(j.asignables || []);
      setKpis(j.kpis || null);
      setLogFiles(j.logFiles || []);
      setLogConfigured(!!j.logConfigured);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [db, filtroEstado, filtroNivel, filtroProyecto, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const pager = usePagination(rows, {
    initialSize: 12,
    resetKey: `${filtroEstado}|${filtroNivel}|${filtroProyecto}|${q}|${rows.length}`,
  });

  const openTask = (inc: Incidencia) => {
    setTaskError("");
    setTaskOk("");
    setPerCod("");
    setPrio(prioridadSugerida(inc.Inc_Nivel));
    setTaskOpen(inc);
  };

  const crearTarea = async () => {
    if (!taskOpen?.Inc_Cod) {
      setTaskError("Incidencia sin codigo. Actualiza el monitor primero.");
      return;
    }
    setTaskSaving(true);
    setTaskError("");
    setTaskOk("");
    try {
      const res = await fetch("/api/incidencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "crear_tarea",
          Ses_Dat_Dis: db,
          Inc_Cod: taskOpen.Inc_Cod,
          perCodAsignar: canAssignTask && perCod ? Number(perCod) : undefined,
          usuCreador: user?.usuCod || undefined,
          prioridad: prio,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo crear la tarea");
      setTaskOk(
        j.already
          ? `Ya existia la tarea #${j.Tar_Cod}`
          : `Tarea #${j.Tar_Cod} creada${perCod ? " y asignada" : ""}`
      );
      await load();
      setTimeout(() => {
        setTaskOpen(null);
        setTaskOk("");
      }, 1200);
    } catch (e) {
      setTaskError(e instanceof Error ? e.message : "Error");
    } finally {
      setTaskSaving(false);
    }
  };

  const setEstado = async (inc: Incidencia, estado: string) => {
    if (!inc.Inc_Cod) return;
    if (estado === "Resuelta") {
      setResolveOpen(inc);
      setSolucionText(inc.Inc_Solucion || "");
      setSolucionError("");
      setResolving(true);
      try {
        const res = await fetch("/api/incidencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "estado",
            Ses_Dat_Dis: db,
            Inc_Cod: inc.Inc_Cod,
            estado: "Resuelta",
          }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "Error al resolver");
        setSolucionText(j.Inc_Solucion || "");
        if (j.aiError) setSolucionError(String(j.aiError));
        await load();
      } catch (e) {
        setSolucionError(e instanceof Error ? e.message : "Error");
      } finally {
        setResolving(false);
      }
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/incidencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estado",
          Ses_Dat_Dis: db,
          Inc_Cod: inc.Inc_Cod,
          estado,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setLoading(false);
    }
  };

  const analizar = async (inc: Incidencia) => {
    if (!inc.Inc_Cod) return;
    setAnalizando(true);
    setAnalisis("");
    setAnalisisError("");
    try {
      const res = await fetch("/api/incidencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analizar", Ses_Dat_Dis: db, Inc_Cod: inc.Inc_Cod }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "No se pudo analizar la incidencia");
      setAnalisis(data.analisis || "Sin respuesta de IA");
    } catch (e) {
      setAnalisisError(e instanceof Error ? e.message : "Error al analizar");
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <>
      <Topbar title="Incidencias" subtitle="Logs de error EXA" />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] lg:max-w-none animate-fade-in px-4 py-6 sm:px-6">
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: kpis?.total ?? 0, tone: "text-sky-700" },
            { label: "Nuevas", value: kpis?.nuevas ?? 0, tone: "text-amber-700" },
            { label: "Fatales", value: kpis?.fatales ?? 0, tone: "text-brand-red" },
            { label: "Con tarea", value: kpis?.conTarea ?? 0, tone: "text-primary" },
            { label: "Cerradas", value: kpis?.ignoradas ?? 0, tone: "text-emerald-700" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div className={cn("mt-1 text-2xl font-bold tabular-nums", k.tone)}>{k.value}</div>
            </div>
          ))}
        </div>

        {!logConfigured && (
          <div className="mb-4">
            <Alert variant="destructive">
              No se encontro el log de errores EXA. Configura{" "}
              <code className="rounded bg-black/10 px-1">EXA_ERROR_LOG</code> en{" "}
              <code className="rounded bg-black/10 px-1">.env</code> a las carpetas
              sincronizadas de ofsercont/relavera (o un{" "}
              <code className="rounded bg-black/10 px-1">exa-*.log</code>).
              {logFiles[0] ? ` Probado: ${logFiles[0].path}` : ""}
            </Alert>
          </div>
        )}

        {logConfigured && (
          <p className="mb-4 break-all text-[11px] text-muted-foreground">
            Leyendo{" "}
            {logFiles
              .filter((f) => f.exists)
              .map((f) => f.path)
              .join(" · ") || "log EXA"}
            . Se agrupan errores repetidos y puedes generar tareas asignables.
          </p>
        )}

        <FilterBar className="mb-4">
          <div className="relative w-full min-w-0 sm:w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 min-h-0 pl-9 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por mensaje, archivo..."
            />
          </div>
          <Select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            wrapperClassName="w-full sm:w-[170px]"
            className="h-9 min-h-0 w-full py-0 text-sm"
          >
            <option value="todos">Todos los estados</option>
            <option value="Nueva">Nuevas</option>
            <option value="En revision">En revision</option>
            <option value="Tarea creada">Con tarea</option>
            <option value="Ignorada">Ignoradas</option>
            <option value="Resuelta">Resueltas</option>
          </Select>
          <Select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            wrapperClassName="w-full sm:w-[150px]"
            className="h-9 min-h-0 w-full py-0 text-sm"
          >
            <option value="todos">Todos los niveles</option>
            <option value="Fatal">Fatal</option>
            <option value="Error">Error</option>
            <option value="Warning">Warning</option>
            <option value="Notice">Notice</option>
          </Select>
          <Select
            value={filtroProyecto}
            onChange={(e) => setFiltroProyecto(e.target.value)}
            wrapperClassName="w-full sm:w-[190px]"
            className="h-9 min-h-0 w-full py-0 text-sm"
          >
            <option value="todos">Todos los proyectos</option>
            <option value="ofsercont">EXA Ofsercont</option>
            <option value="relavera">EXA Relavera</option>
          </Select>
          <Button type="button" variant="secondary" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Escanear
          </Button>
          <ViewModeToggle value={viewMode} onChange={setViewMode} className="ml-auto" />
        </FilterBar>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Escaneando logs de EXA...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
            <FileWarning className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-semibold text-brand-gray-900">Sin incidencias detectadas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cuando EXA registre errores en el log, apareceran aqui para evaluarlos y convertirlos en
              tareas.
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0">
            {displayMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pager.slice.map((inc) => (
                  <article
                    key={inc.Inc_Fingerprint}
                    className={cn(
                      "rounded-xl border bg-card p-4 shadow-sm transition-colors",
                      inc.Inc_Nivel === "Fatal"
                        ? "border-brand-red/30 bg-brand-red-subtle/30"
                        : inc.Inc_Estado === "Nueva"
                          ? "border-amber-200 bg-amber-50/30"
                          : "border-border/80"
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {inc.Inc_Cod != null && (
                        <span className="font-mono text-xs text-muted-foreground">#{inc.Inc_Cod}</span>
                      )}
                      <Badge variant={proyectoTone(inc.Inc_Proyecto)}>
                        {inc.Inc_Proyecto_Label || "Sin proyecto"}
                      </Badge>
                      <Badge variant={nivelTone(inc.Inc_Nivel)}>
                        <AlertTriangle className="mr-1 size-3" />
                        {inc.Inc_Nivel}
                      </Badge>
                      <Badge variant={estadoTone(inc.Inc_Estado)}>{inc.Inc_Estado}</Badge>
                      <PrioridadBadge prioridad={prioridadSugerida(inc.Inc_Nivel)} />
                      {inc.enLog && (
                        <Badge variant="secondary" className="text-[10px]">
                          En log actual
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">×{inc.Inc_Ocurrencias}</span>
                    </div>
                    <h3 className="text-sm font-bold text-brand-gray-900 line-clamp-2">{inc.Inc_Titulo}</h3>
                    {(inc.Inc_Archivo || inc.Inc_Fuente) && (
                      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                        {inc.Inc_Archivo
                          ? `${inc.Inc_Archivo}${inc.Inc_Linea != null ? `:${inc.Inc_Linea}` : ""}`
                          : null}
                        {inc.Inc_Fuente ? ` · ${inc.Inc_Fuente}` : null}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Primera: {fmtWhen(inc.Inc_Primera_Vez)}</span>
                      <span>Ultima: {fmtWhen(inc.Inc_Ultima_Vez)}</span>
                      {inc.Tar_Cod && (
                        <span className="font-semibold text-foreground">Tarea #{inc.Tar_Cod}</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setDetail(inc)}>
                        Detalle
                      </Button>
                      {canCreateTask &&
                        !inc.Tar_Cod &&
                        inc.Inc_Estado !== "Ignorada" &&
                        inc.Inc_Estado !== "Resuelta" && (
                          <Button type="button" size="sm" onClick={() => openTask(inc)}>
                            <ClipboardList className="size-3.5" />
                            Generar tarea
                          </Button>
                        )}
                      {inc.Inc_Estado === "Nueva" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void setEstado(inc, "En revision")}
                        >
                          Revisar
                        </Button>
                      )}
                      {inc.Inc_Estado !== "Ignorada" && inc.Inc_Estado !== "Resuelta" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void setEstado(inc, "Ignorada")}
                        >
                          <EyeOff className="size-3.5" />
                          Ignorar
                        </Button>
                      )}
                      {(inc.Inc_Estado === "Tarea creada" || inc.Inc_Estado === "En revision") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void setEstado(inc, "Resuelta")}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Resuelta
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
                <Table className="responsive-card-table min-w-[720px] lg:min-w-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">Incidencia</TableHead>
                      <TableHead className="w-[130px]">Proyecto</TableHead>
                      <TableHead className="w-[100px]">Nivel</TableHead>
                      <TableHead className="w-[110px]">Estado</TableHead>
                      <TableHead className="w-[90px]">Veces</TableHead>
                      <TableHead className="w-[150px]">Ultima</TableHead>
                      <TableHead className="min-w-[220px] text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pager.slice.map((inc) => (
                      <TableRow key={inc.Inc_Fingerprint}>
                        <TableCell data-label="Incidencia">
                          <div className="min-w-0">
                            <div className="mb-0.5 flex flex-wrap items-center gap-2">
                              {inc.Inc_Cod != null && (
                                <span className="font-mono text-xs text-muted-foreground">
                                  #{inc.Inc_Cod}
                                </span>
                              )}
                              {inc.enLog && (
                                <Badge variant="secondary" className="text-[10px]">
                                  En log
                                </Badge>
                              )}
                              {inc.Tar_Cod && (
                                <span className="text-[11px] font-semibold text-foreground">
                                  Tarea #{inc.Tar_Cod}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-brand-gray-900 line-clamp-2">
                              {inc.Inc_Titulo}
                            </p>
                            {(inc.Inc_Archivo || inc.Inc_Fuente) && (
                              <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                                {inc.Inc_Archivo
                                  ? `${inc.Inc_Archivo}${inc.Inc_Linea != null ? `:${inc.Inc_Linea}` : ""}`
                                  : null}
                                {inc.Inc_Fuente ? ` · ${inc.Inc_Fuente}` : null}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell data-label="Proyecto">
                          <Badge variant={proyectoTone(inc.Inc_Proyecto)}>
                            {inc.Inc_Proyecto_Label || "Sin proyecto"}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Nivel">
                          <Badge variant={nivelTone(inc.Inc_Nivel)}>{inc.Inc_Nivel}</Badge>
                        </TableCell>
                        <TableCell data-label="Estado">
                          <Badge variant={estadoTone(inc.Inc_Estado)}>{inc.Inc_Estado}</Badge>
                        </TableCell>
                        <TableCell data-label="Veces" className="tabular-nums">
                          ×{inc.Inc_Ocurrencias}
                        </TableCell>
                        <TableCell data-label="Ultima" className="text-xs text-muted-foreground">
                          {fmtWhen(inc.Inc_Ultima_Vez)}
                        </TableCell>
                        <TableCell data-label="Acciones" className="text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDetail(inc)}
                            >
                              Detalle
                            </Button>
                            {canCreateTask &&
                              !inc.Tar_Cod &&
                              inc.Inc_Estado !== "Ignorada" &&
                              inc.Inc_Estado !== "Resuelta" && (
                                <Button type="button" size="sm" onClick={() => openTask(inc)}>
                                  <ClipboardList className="size-3.5" />
                                  Tarea
                                </Button>
                              )}
                            {inc.Inc_Estado === "Nueva" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void setEstado(inc, "En revision")}
                              >
                                Revisar
                              </Button>
                            )}
                            {inc.Inc_Estado !== "Ignorada" && inc.Inc_Estado !== "Resuelta" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => void setEstado(inc, "Ignorada")}
                              >
                                <EyeOff className="size-3.5" />
                              </Button>
                            )}
                            {(inc.Inc_Estado === "Tarea creada" ||
                              inc.Inc_Estado === "En revision") && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => void setEstado(inc, "Resuelta")}
                              >
                                <CheckCircle2 className="size-3.5" />
                                Resuelta
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <PaginationBar
              page={pager.page}
              totalPages={pager.totalPages}
              total={pager.total}
              from={pager.from}
              to={pager.to}
              pageSize={pager.pageSize}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
            />
          </div>
        )}
      </main>

      <Dialog open={!!taskOpen} onOpenChange={(o) => !o && !taskSaving && setTaskOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generar tarea desde incidencia</DialogTitle>
            <DialogDescription>
              Se creara una tarea en el panel con el detalle del error EXA. Opcionalmente asignala a un
              colaborador.
            </DialogDescription>
          </DialogHeader>
          {taskOpen && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                <div className="mb-1 flex gap-2">
                  <Badge variant={nivelTone(taskOpen.Inc_Nivel)}>{taskOpen.Inc_Nivel}</Badge>
                  <PrioridadBadge prioridad={prio} />
                </div>
                <p className="font-semibold text-foreground line-clamp-3">{taskOpen.Inc_Titulo}</p>
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={prio} onChange={(e) => setPrio(e.target.value)}>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                  <option value="Baja">Baja</option>
                </Select>
              </div>
              {canAssignTask && <div className="space-y-2">
                <Label>Asignar a (opcional)</Label>
                <Select value={perCod} onChange={(e) => setPerCod(e.target.value)}>
                  <option value="">Sin asignar — queda Pendiente</option>
                  {asignables.map((a) => (
                    <option key={a.Per_Cod} value={String(a.Per_Cod)}>
                      {a.Nombre}
                      {a.Rol === "atencion" ? ` · ${roleLabel(a.Rol)}` : ""}
                      {a.Cedula ? ` · ${a.Cedula}` : ""}
                    </option>
                  ))}
                </Select>
              </div>}
              {taskError && <Alert variant="destructive">{taskError}</Alert>}
              {taskOk && <Alert>{taskOk}</Alert>}
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={taskSaving}
              onClick={() => setTaskOpen(null)}
            >
              Cancelar
            </Button>
            <Button type="button" disabled={taskSaving} onClick={() => void crearTarea()}>
              {taskSaving ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Crear tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setAnalisis(""); setAnalisisError(""); } }}>
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de incidencia</DialogTitle>
            <DialogDescription>
              {detail?.Inc_Proyecto_Label ? `${detail.Inc_Proyecto_Label} · ` : ""}
              {detail?.Inc_Archivo
                ? `${detail.Inc_Archivo}${detail.Inc_Linea != null ? `:${detail.Inc_Linea}` : ""}`
                : "Mensaje completo del log"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <pre className="max-h-[40vh] overflow-auto rounded-lg border border-border bg-[#141413] p-3 text-[11px] leading-relaxed text-[#e8e8e4] whitespace-pre-wrap break-words">
                {detail.Inc_Mensaje || detail.Inc_Titulo}
              </pre>
              {analisisError && <Alert variant="destructive">{analisisError}</Alert>}
              {analisis && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                  <p className="mb-1 text-xs font-semibold text-blue-900">Analisis sugerido por IA</p>
                  <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-blue-950">{analisis}</pre>
                </div>
              )}
              {detail.Inc_Solucion && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="mb-1 text-xs font-semibold text-emerald-900">Posible solucion (IA)</p>
                  <pre className="max-h-[30vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-emerald-950">
                    {detail.Inc_Solucion}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {detail?.Inc_Cod && (
              <Button type="button" variant="outline" disabled={analizando} onClick={() => void analizar(detail)}>
                {analizando ? <Loader2 className="size-4 animate-spin" /> : null}
                {analizando ? "Analizando..." : "Analizar con IA"}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
            {detail && !detail.Tar_Cod && detail.Inc_Estado !== "Ignorada" && (
              <Button
                type="button"
                onClick={() => {
                  setDetail(null);
                  openTask(detail);
                }}
              >
                Generar tarea
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!resolveOpen}
        onOpenChange={(o) => {
          if (!o && !resolving) {
            setResolveOpen(null);
            setSolucionText("");
            setSolucionError("");
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incidencia resuelta</DialogTitle>
            <DialogDescription>
              {resolveOpen?.Inc_Proyecto_Label || "EXA"} · se genero una posible solucion con IA para
              guiar el cierre.
            </DialogDescription>
          </DialogHeader>
          {resolving ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Analizando el error con Gemini...
            </div>
          ) : (
            <div className="space-y-3">
              {resolveOpen && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <Badge variant={proyectoTone(resolveOpen.Inc_Proyecto)} className="mb-2">
                    {resolveOpen.Inc_Proyecto_Label || "Sin proyecto"}
                  </Badge>
                  <p className="font-semibold text-foreground">{resolveOpen.Inc_Titulo}</p>
                </div>
              )}
              {solucionError && <Alert variant="destructive">{solucionError}</Alert>}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-1 text-xs font-semibold text-emerald-900">Posible solucion</p>
                <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-emerald-950">
                  {solucionText || "Sin texto generado."}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={resolving}
              onClick={() => {
                setResolveOpen(null);
                setSolucionText("");
                setSolucionError("");
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
