"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleCheck,
  ClipboardList,
  FileBarChart,
  Gauge,
  History,
  Layers,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  Ticket,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { KanbanBoard, type KanbanEstado, workItemKey } from "@/components/dashboard/kanban-board";
import type { Tarea } from "@/components/dashboard/types";
import { KpiCarousel } from "@/components/kpi-carousel";
import { PaginationBar, FilterBar, ViewModeToggle, type ListViewMode } from "@/components/list-controls";
import { EstadoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import { AvanceDialog } from "@/components/tareas/avance-dialog";
import { MetricasPanel, metricasKpiItems } from "@/components/tareas/metricas-panel";
import { ReporteDialog } from "@/components/tareas/reporte-dialog";
import { TareaDetalleDialog } from "@/components/tareas/tarea-detalle-dialog";
import { TicketDetalleDialog } from "@/components/tareas/ticket-detalle-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { usePagination } from "@/hooks/use-pagination";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DIAS_SIN_ACTUALIZAR,
  calcularMetricas,
  diasDesde,
  tareaAbierta,
  type Actividad,
} from "@/lib/metricas-avance";
import { fechaEnZona, hoyFecha, startOfDayZona } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { plainTextFromHtml } from "@/components/ui/rich-text";

type Kpis = {
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  atrasadas: number;
  avance_promedio: number;
  tareas?: number;
  tickets?: number;
};

type Filtro = "abiertas" | "atrasadas" | "sin_actualizar" | "finalizadas" | "todas";
type TipoFiltro = "todos" | "tarea" | "ticket";

const FILTROS: Array<{ id: Filtro; label: string }> = [
  { id: "abiertas", label: "Abiertas" },
  { id: "atrasadas", label: "Atrasadas" },
  { id: "sin_actualizar", label: "Sin actualizar" },
  { id: "finalizadas", label: "Finalizadas" },
  { id: "todas", label: "Todas" },
];

const TIPO_TABS: Array<{ id: TipoFiltro; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "tarea", label: "Tareas" },
  { id: "ticket", label: "Tickets" },
];

const PERIODOS = [7, 14, 30, 60, 90] as const;
type PeriodoPreset = (typeof PERIODOS)[number] | "rango";

function ymdHace(dias: number) {
  const hoy = startOfDayZona(hoyFecha());
  return fechaEnZona(new Date(hoy.getTime() - (dias - 1) * 24 * 3600 * 1000));
}

function esAtrasada(t: Tarea) {
  const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
  return tareaAbierta(t) && !!fin && fin < hoyFecha();
}

function esSinActualizar(t: Tarea) {
  if (!tareaAbierta(t)) return false;
  if (t.tipo === "ticket") return false;
  const d = diasDesde(t.Ava_Ultima_Fecha);
  return d == null || d >= DIAS_SIN_ACTUALIZAR;
}

function esTicket(t: Tarea) {
  return t.tipo === "ticket";
}

export default function MisTareasPage() {
  const { user } = useAuth();
  const { lastTaskEventAt } = useNotifications();
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<PeriodoPreset>(7);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [viewMode, setViewMode] = useState<ListViewMode>("kanban");
  const [q, setQ] = useState("");
  const [avanceCod, setAvanceCod] = useState<number | null>(null);
  const [detalleKey, setDetalleKey] = useState<string | null>(null);
  const [detalleReload, setDetalleReload] = useState(0);
  const [reporteOpen, setReporteOpen] = useState(false);

  const avanceTarea = tareas.find((t) => !esTicket(t) && t.Tar_Cod === avanceCod) ?? null;
  const detalleItem = detalleKey ? tareas.find((t) => workItemKey(t) === detalleKey) ?? null : null;
  const detalleTarea = detalleItem && !esTicket(detalleItem) ? detalleItem : null;
  const detalleTicket = detalleItem && esTicket(detalleItem) ? detalleItem : null;

  const loadTareas = useCallback(async (proj: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ project: proj });
      if (periodo === "rango" && desde && hasta) {
        params.set("desde", desde);
        params.set("hasta", hasta);
      } else {
        params.set("dias", String(periodo === "rango" ? 7 : periodo));
      }
      const res = await fetch(`/api/mis-tareas?${params}`);
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudieron cargar las tareas");
      setTareas(j.tareas || []);
      setKpis(j.kpis || null);
      setActividad(j.actividad || null);
      setWarning(j.warning || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [periodo, desde, hasta]);

  useEffect(() => {
    // Emp 96 / aud_tareas viven en exa; ignorar toggle de proyecto
    void loadTareas("exa");
  }, [loadTareas]);

  useEffect(() => {
    if (!lastTaskEventAt) return;
    const t = setTimeout(() => void loadTareas("exa"), 400);
    return () => clearTimeout(t);
  }, [lastTaskEventAt, loadTareas]);

  const soloTareas = useMemo(() => tareas.filter((t) => !esTicket(t)), [tareas]);
  const metricas = useMemo(
    () =>
      calcularMetricas(
        soloTareas,
        actividad,
        periodo === "rango" ? 7 : periodo,
        periodo === "rango" && desde && hasta ? { desde, hasta } : null
      ),
    [soloTareas, actividad, periodo, desde, hasta]
  );

  const porTipo = useMemo(() => {
    if (tipoFiltro === "tarea") return tareas.filter((t) => !esTicket(t));
    if (tipoFiltro === "ticket") return tareas.filter(esTicket);
    return tareas;
  }, [tareas, tipoFiltro]);

  const conteosTipo = useMemo(
    () => ({
      todos: tareas.length,
      tarea: tareas.filter((t) => !esTicket(t)).length,
      ticket: tareas.filter(esTicket).length,
    }),
    [tareas]
  );

  const conteos = useMemo(
    () => ({
      abiertas: porTipo.filter(tareaAbierta).length,
      atrasadas: porTipo.filter(esAtrasada).length,
      sin_actualizar: porTipo.filter(esSinActualizar).length,
      finalizadas: porTipo.filter((t) => !tareaAbierta(t)).length,
      todas: porTipo.length,
    }),
    [porTipo]
  );

  const visibles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return porTipo.filter((t) => {
      if (filtro === "abiertas" && !tareaAbierta(t)) return false;
      if (filtro === "atrasadas" && !esAtrasada(t)) return false;
      if (filtro === "sin_actualizar" && !esSinActualizar(t)) return false;
      if (filtro === "finalizadas" && tareaAbierta(t)) return false;
      if (!needle) return true;
      return (
        String(t.Tar_Cod).includes(needle) ||
        String(t.Tic_Cod || "").includes(needle) ||
        t.Tar_Titulo.toLowerCase().includes(needle) ||
        plainTextFromHtml(t.Tar_Descripcion).toLowerCase().includes(needle)
      );
    });
  }, [porTipo, filtro, q]);

  const pager = usePagination(visibles, {
    resetKey: `${tipoFiltro}|${filtro}|${q}`,
  });

  const moveEstado = async (t: Tarea, estado: KanbanEstado | "Cerrado" | "Resuelto") => {
    const nextKanban =
      estado === "Cerrado" || estado === "Resuelto" || estado === "Finalizada"
        ? ("Finalizada" as KanbanEstado)
        : (estado as KanbanEstado);
    setTareas((prev) =>
      prev.map((row) =>
        workItemKey(row) === workItemKey(t)
          ? {
              ...row,
              Tar_Estado: nextKanban,
              ...(nextKanban === "Finalizada" && !esTicket(row)
                ? { Ava_Porcentaje: Math.max(row.Ava_Porcentaje || 0, 100) }
                : {}),
            }
          : row
      )
    );
    try {
      if (esTicket(t)) {
        const res = await fetch("/api/mis-tareas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "ticket_estado",
            project: "exa",
            Tic_Cod: t.Tic_Cod ?? t.Tar_Cod,
            estado,
          }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "No se pudo cambiar el estado del ticket");
      } else {
        const res = await fetch("/api/tareas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            Ses_Dat_Dis: "exa",
            Tar_Cod: t.Tar_Cod,
            estado: nextKanban,
          }),
        });
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "No se pudo cambiar el estado");
      }
      await loadTareas("exa");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al mover");
      await loadTareas("exa");
    }
  };

  return (
    <>
      <Topbar title="Mis tareas" subtitle={user?.name || "Asignadas a ti"} />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-4 py-6 sm:px-6">
        <FilterBar className="mb-4">
          <Button type="button" variant="secondary" className="h-9" onClick={() => void loadTareas("exa")} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
          <Button type="button" className="h-9" onClick={() => setReporteOpen(true)} disabled={!soloTareas.length}>
            <FileBarChart />
            Reporte de avance
          </Button>
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
            {PERIODOS.map((d) => (
              <button
                key={d}
                type="button"
                title={`Ultimos ${d} dias`}
                onClick={() => setPeriodo(d)}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                  periodo === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {d}d
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setDesde((v) => v || ymdHace(7));
                setHasta((v) => v || hoyFecha());
                setPeriodo("rango");
              }}
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                periodo === "rango" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Rango
            </button>
          </div>
          {periodo === "rango" && (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="date"
                aria-label="Desde"
                value={desde}
                max={hasta || hoyFecha()}
                onChange={(e) => setDesde(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">a</span>
              <input
                type="date"
                aria-label="Hasta"
                value={hasta}
                min={desde || undefined}
                max={hoyFecha()}
                onChange={(e) => setHasta(e.target.value)}
                className="h-9 rounded-md border border-border bg-background px-2 text-xs"
              />
            </div>
          )}
        </FilterBar>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}
        {warning && (
          <div className="mb-4">
            <Alert variant="warning">{warning}</Alert>
          </div>
        )}

        {(kpis || soloTareas.length > 0) && (
          <div className="mb-3">
            <KpiCarousel
              items={[
                ...(kpis
                  ? [
                      { label: "Total", value: kpis.total, tone: "info" as const, icon: Layers },
                      { label: "Tareas", value: kpis.tareas ?? soloTareas.length, tone: "default" as const, icon: ClipboardList },
                      { label: "Tickets", value: kpis.tickets ?? conteosTipo.ticket, tone: "warning" as const, icon: Ticket },
                      { label: "Finalizadas", value: kpis.completadas, tone: "success" as const, icon: CircleCheck },
                      { label: "En proceso", value: kpis.proceso, tone: "default" as const, icon: PlayCircle },
                      { label: "Avance medio", value: `${kpis.avance_promedio}%`, tone: "info" as const, icon: Gauge },
                    ]
                  : []),
                ...(soloTareas.length > 0 ? metricasKpiItems(metricas) : []),
              ]}
            />
          </div>
        )}

        {soloTareas.length > 0 && (
          <div className="mb-6">
            <MetricasPanel m={metricas} showKpis={false} onOpenTarea={(t) => setDetalleKey(workItemKey(t))} />
          </div>
        )}

        <FilterBar className="mb-3">
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
            {TIPO_TABS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setTipoFiltro(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                  tipoFiltro === f.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.id === "ticket" && <Ticket className="size-3" />}
                {f.label}
                <span className="rounded bg-muted px-1 text-[10px] tabular-nums">{conteosTipo[f.id]}</span>
              </button>
            ))}
          </div>
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                  filtro === f.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded bg-muted px-1 text-[10px] tabular-nums",
                    (f.id === "atrasadas" || f.id === "sin_actualizar") && conteos[f.id] > 0 && "bg-red-100 text-red-700"
                  )}
                >
                  {conteos[f.id]}
                </span>
              </button>
            ))}
          </div>
          <div className="relative w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 min-h-0 pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} withKanban />
        </FilterBar>

        <div
          className={cn(
            "rounded-xl border border-border/80 bg-card p-3 shadow-sm sm:p-4",
            viewMode === "kanban" &&
              "flex h-[min(70dvh,calc(100dvh-14rem))] min-h-[280px] w-full min-w-0 flex-col overflow-hidden sm:h-[min(72dvh,calc(100dvh-12rem))]"
          )}
        >
          {viewMode === "kanban" ? (
            <KanbanBoard
              tareas={visibles}
              loading={loading}
              onAvance={(t) => {
                if (!esTicket(t)) setAvanceCod(t.Tar_Cod);
              }}
              onMoveEstado={moveEstado}
              onOpen={(t) => setDetalleKey(workItemKey(t))}
            />
          ) : viewMode === "grid" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pager.slice.map((t) => {
                  const ticket = esTicket(t);
                  const atrasada = esAtrasada(t);
                  const stale = esSinActualizar(t);
                  return (
                    <div
                      key={workItemKey(t)}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDetalleKey(workItemKey(t))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetalleKey(workItemKey(t));
                        }
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl border border-border/70 bg-background p-3.5 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/40",
                        atrasada && "border-red-200",
                        stale && "border-amber-200"
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        {ticket ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Ticket className="size-3" />
                            Ticket #{t.Tic_Cod ?? t.Tar_Cod}
                          </span>
                        ) : (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                            Tarea #{t.Tar_Cod}
                          </span>
                        )}
                        <PrioridadBadge prioridad={t.Tar_Prioridad} />
                      </div>
                      <div className="line-clamp-2 text-sm font-bold">{t.Tar_Titulo}</div>
                      {t.Tar_Descripcion && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {plainTextFromHtml(t.Tar_Descripcion)}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <EstadoBadge estado={t.Tar_Estado} />
                        {!ticket && (
                          <span className={cn("text-[11px]", atrasada ? "font-bold text-red-600" : "text-muted-foreground")}>
                            Fin {fmtDate(t.Tar_Fecha_Fin)}
                          </span>
                        )}
                      </div>
                      {!ticket && (
                        <div className="mt-3 flex items-center gap-2">
                          <Progress value={Math.min(100, t.Ava_Porcentaje || 0)} className="h-2 flex-1" />
                          <span className="text-xs font-bold tabular-nums">{t.Ava_Porcentaje || 0}%</span>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!ticket && tareaAbierta(t) && (
                          <Button
                            type="button"
                            variant="success"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAvanceCod(t.Tar_Cod);
                            }}
                          >
                            Avance
                          </Button>
                        )}
                        {ticket && t.Tar_Estado !== "Finalizada" && (
                          <>
                            {t.Tar_Estado !== "En Proceso" && (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void moveEstado(t, "En Proceso");
                                }}
                              >
                                En proceso
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="success"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                void moveEstado(t, "Resuelto");
                              }}
                            >
                              Resuelto
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!loading && visibles.length === 0 && (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {tareas.length ? "No hay elementos con este filtro." : "No tienes tareas ni tickets asignados."}
                </p>
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
            </>
          ) : (
            <>
              <Card className="overflow-hidden border-0 shadow-none">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1200px]">
                    <TableHeader className="bg-slate-900 [&_th]:text-slate-200">
                      <TableRow className="border-0 hover:bg-slate-900">
                        <TableHead className="w-[90px] whitespace-nowrap text-slate-200">Tipo</TableHead>
                        <TableHead className="w-16 whitespace-nowrap text-slate-200">#</TableHead>
                        <TableHead className="min-w-[240px] text-slate-200">Titulo</TableHead>
                        <TableHead className="w-[100px] whitespace-nowrap text-slate-200">Prioridad</TableHead>
                        <TableHead className="w-[120px] whitespace-nowrap text-slate-200">Estado</TableHead>
                        <TableHead className="w-[110px] whitespace-nowrap text-slate-200">Fin</TableHead>
                        <TableHead className="w-[140px] whitespace-nowrap text-slate-200">Avance</TableHead>
                        <TableHead className="min-w-[140px] whitespace-nowrap text-slate-200">
                          Ultimo avance
                        </TableHead>
                        <TableHead className="w-[220px] whitespace-nowrap text-right text-slate-200">
                          Acciones
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {pager.slice.map((t) => {
                      const ticket = esTicket(t);
                      const d = diasDesde(t.Ava_Ultima_Fecha);
                      const atrasada = esAtrasada(t);
                      const stale = esSinActualizar(t);
                      return (
                        <TableRow
                          key={workItemKey(t)}
                          className="cursor-pointer"
                          onClick={() => setDetalleKey(workItemKey(t))}
                        >
                          <TableCell className="whitespace-nowrap">
                            {ticket ? (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                <Ticket className="size-3" />
                                Ticket
                              </span>
                            ) : (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                Tarea
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-muted-foreground">
                            {ticket ? t.Tic_Cod ?? t.Tar_Cod : t.Tar_Cod}
                          </TableCell>
                          <TableCell className="min-w-[240px]">
                            <div className="font-semibold leading-snug">{t.Tar_Titulo}</div>
                            {t.Tar_Descripcion && (
                              <div className="line-clamp-1 text-xs text-muted-foreground">
                                {plainTextFromHtml(t.Tar_Descripcion)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <PrioridadBadge prioridad={t.Tar_Prioridad} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <EstadoBadge estado={t.Tar_Estado} />
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap text-xs",
                              atrasada ? "font-bold text-red-600" : "text-muted-foreground"
                            )}
                          >
                            {ticket ? "—" : fmtDate(t.Tar_Fecha_Fin)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {ticket ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <div className="flex min-w-[120px] items-center gap-2">
                                <Progress value={Math.min(100, t.Ava_Porcentaje || 0)} className="h-2 w-20" />
                                <span className="text-xs font-bold tabular-nums">{t.Ava_Porcentaje || 0}%</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "whitespace-nowrap text-xs",
                              stale ? "font-semibold text-amber-700" : "text-muted-foreground"
                            )}
                          >
                            {ticket ? (
                              "—"
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <History className="size-3" />
                                {t.Ava_Total || 0} · {d == null ? "nunca" : d === 0 ? "hoy" : `hace ${d} d`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                              {!ticket && tareaAbierta(t) && (
                                <Button
                                  type="button"
                                  variant="success"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAvanceCod(t.Tar_Cod);
                                  }}
                                >
                                  Avance
                                </Button>
                              )}
                              {ticket && t.Tar_Estado !== "Finalizada" && (
                                <>
                                  {t.Tar_Estado !== "En Proceso" && (
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void moveEstado(t, "En Proceso");
                                      }}
                                    >
                                      En proceso
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="success"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void moveEstado(t, "Resuelto");
                                    }}
                                  >
                                    Resuelto
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!loading && visibles.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                          {tareas.length
                            ? "No hay elementos con este filtro."
                            : "No tienes tareas ni tickets asignados."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  </Table>
                </div>
              </Card>
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
            </>
          )}
        </div>

        {loading && (
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="size-3.5 animate-spin" />
            Cargando...
          </div>
        )}

        <TareaDetalleDialog
          tarea={detalleTarea}
          detailUrl={(cod) => `/api/mis-tareas?project=exa&detalle=${cod}`}
          onClose={() => setDetalleKey(null)}
          onRegistrarAvance={(t) => setAvanceCod(t.Tar_Cod)}
          editExtraBody={{ Ses_Dat_Dis: "exa" }}
          onSaved={async () => {
            await loadTareas("exa");
            setDetalleReload((n) => n + 1);
          }}
          reloadKey={detalleReload}
        />

        <TicketDetalleDialog
          ticket={detalleTicket}
          onClose={() => setDetalleKey(null)}
          onMoveEstado={moveEstado}
        />

        <AvanceDialog
          tarea={avanceTarea}
          endpoint="/api/mis-tareas"
          extraBody={{ project: "exa" }}
          onClose={() => setAvanceCod(null)}
          onSaved={async () => {
            await loadTareas("exa");
            setDetalleReload((n) => n + 1);
          }}
        />

        <ReporteDialog
          open={reporteOpen}
          onClose={() => setReporteOpen(false)}
          usuario={user?.name || "Colaborador"}
          tareas={soloTareas}
          actividad={actividad}
          periodo={periodo}
          desde={desde}
          hasta={hasta}
        />
      </main>
    </>
  );
}
