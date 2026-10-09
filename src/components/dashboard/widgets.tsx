"use client";

import { Progress } from "@/components/ui/progress";
import { EstadoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNotifications } from "@/contexts/NotificationsContext";
import { Columns3, History, LayoutList, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBar } from "@/components/list-controls";
import { plainTextFromHtml } from "@/components/ui/rich-text";
import { hoyFecha } from "@/lib/timezone";
import { KanbanBoard, type KanbanEstado } from "./kanban-board";
import type { Dev, Kpis, Tarea } from "./types";

export type TareasViewMode = "lista" | "kanban";

export function OverallWidget({ kpis }: { kpis: Kpis | null }) {
  const tot = kpis?.total || 0;
  const seg = tot
    ? {
        p: Math.round(((kpis?.proceso || 0) / tot) * 100),
        f: Math.round(((kpis?.completadas || 0) / tot) * 100),
        c: Math.round(((kpis?.atrasadas || 0) / tot) * 100),
        pend: Math.round(((kpis?.pendientes || 0) / tot) * 100),
      }
    : { p: 0, f: 0, c: 0, pend: 0 };

  return (
    <div className="flex h-auto min-h-0 flex-col justify-between gap-2 overflow-hidden lg:h-full">
      <div className="min-w-0 shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Tareas</div>
        <div className="mt-0.5 flex items-end gap-1.5">
          <div className="text-3xl font-bold tabular-nums leading-none tracking-tight">{kpis?.total ?? 0}</div>
          <span className="mb-0.5 text-[11px] text-muted-foreground">totales</span>
        </div>
      </div>
      <div className="flex h-2 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="bg-sky-500 transition-all" style={{ width: `${seg.p}%` }} title="En proceso" />
        <div className="bg-red-500 transition-all" style={{ width: `${seg.c}%` }} title="Atrasadas" />
        <div className="bg-emerald-500 transition-all" style={{ width: `${seg.f}%` }} title="Finalizadas" />
        <div className="bg-slate-300 transition-all" style={{ width: `${seg.pend}%` }} title="Pendientes" />
      </div>
      <div className="grid shrink-0 grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 truncate"><span className="size-1.5 shrink-0 rounded-full bg-sky-500" />Proceso</span>
          <strong className="tabular-nums">{kpis?.proceso ?? 0}</strong>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 truncate"><span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />Hechas</span>
          <strong className="tabular-nums">{kpis?.completadas ?? 0}</strong>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 truncate"><span className="size-1.5 shrink-0 rounded-full bg-slate-400" />Pend.</span>
          <strong className="tabular-nums">{kpis?.pendientes ?? 0}</strong>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-1">
          <span className="flex min-w-0 items-center gap-1 truncate"><span className="size-1.5 shrink-0 rounded-full bg-red-500" />Atraso</span>
          <strong className="tabular-nums text-red-600">{kpis?.atrasadas ?? 0}</strong>
        </div>
      </div>
    </div>
  );
}

export function CumplimientoWidget({ kpis }: { kpis: Kpis | null }) {
  const pct = kpis?.tasa_cumplimiento ?? 0;
  return (
    <div className="flex h-auto min-h-0 flex-col justify-between gap-2 overflow-hidden lg:h-full">
      <div className="min-w-0 shrink-0">
        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cumplimiento</div>
        <div className="mt-0.5 text-3xl font-bold tabular-nums leading-none tracking-tight text-primary">{pct}%</div>
      </div>
      <Progress value={pct} className="h-2 shrink-0" />
      <div className="shrink-0 rounded-lg border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] leading-snug">
        Avance promedio:{" "}
        <strong className="text-foreground">{kpis?.avance_promedio ?? 0}%</strong>
      </div>
    </div>
  );
}

export function ProyectoWidget({ db }: { db: string }) {
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div>
        <div className="text-[11px] font-bold uppercase text-muted-foreground">Database</div>
        <div className="text-2xl font-bold">{db === "exa" ? "EXA" : db === "servicios" ? "Servicios" : db}</div>
      </div>
      <p className="text-sm text-muted-foreground">
        ExaMonitor reporta a <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/api/monitoreo</code>
      </p>
    </div>
  );
}

export function KpisWidget({ kpis }: { kpis: Kpis | null }) {
  const items = [
    { label: "Total", value: kpis?.total ?? 0, tone: "text-sky-700", bg: "from-sky-50 to-white border-sky-100" },
    { label: "Finalizadas", value: kpis?.completadas ?? 0, tone: "text-emerald-700", bg: "from-emerald-50 to-white border-emerald-100" },
    { label: "Proceso", value: kpis?.proceso ?? 0, tone: "text-primary", bg: "from-red-50 to-white border-red-100" },
    { label: "Pendientes", value: kpis?.pendientes ?? 0, tone: "text-slate-700", bg: "from-slate-50 to-white border-slate-200" },
    { label: "Atrasadas", value: kpis?.atrasadas ?? 0, tone: "text-red-700", bg: "from-rose-50 to-white border-rose-100" },
    { label: "Avance", value: `${kpis?.avance_promedio ?? 0}%`, tone: "text-sky-700", bg: "from-sky-50 to-white border-sky-100" },
  ];
  return (
    <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((k) => (
        <div
          key={k.label}
          className={cn(
            "rounded-xl border bg-gradient-to-b p-2.5 shadow-sm",
            k.bg
          )}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k.label}</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${k.tone}`}>{k.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ActividadWidget() {
  const { items } = useNotifications();
  const recent = items.slice(0, 5);

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
      {recent.map((n) => (
        <div
          key={n.id}
          className={cn(
            "min-w-0 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-background px-2.5 py-1.5",
            !n.read && "border-sky-200 bg-sky-50/50"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-bold">{n.title}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {new Date(n.at).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{n.message}</p>
        </div>
      ))}
      {recent.length === 0 && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          La actividad del equipo aparecera aqui en tiempo real.
        </p>
      )}
    </div>
  );
}

export function DevsOnlineWidget({
  devs,
  onOpenHistorial,
}: {
  devs: Dev[];
  onOpenHistorial: (d: Dev) => void;
}) {
  const online = devs.filter((d) => d.Estado_Conexion === "Online").length;
  const ausente = devs.filter((d) => d.Estado_Conexion === "Ausente").length;
  const off = devs.length - online - ausente;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{online} online</Badge>
        <Badge variant="warning">{ausente} ausente</Badge>
        <Badge variant="muted">{off} off</Badge>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto">
        {devs.slice(0, 8).map((d) => (
          <button
            key={d.Per_Cod}
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left hover:bg-muted/50"
            onClick={() => onOpenHistorial(d)}
          >
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold">{d.Nombre || "Sin nombre en ficha"}</div>
              <div className="truncate text-[10px] text-muted-foreground">{d.Ultima_Ventana || "Sin ventana"}</div>
            </div>
            <EstadoBadge estado={d.Estado_Conexion} />
          </button>
        ))}
        {devs.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">Sin datos de monitoreo</p>
        )}
      </div>
    </div>
  );
}

export function AtrasadasWidget({
  tareas,
  onAvance,
}: {
  tareas: Tarea[];
  onAvance: (t: Tarea) => void;
}) {
  const hoy = hoyFecha();
  const atrasadas = tareas.filter((t) => {
    const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
    return t.Tar_Estado !== "Finalizada" && (t.Ava_Porcentaje || 0) < 100 && !!fin && fin < hoy;
  });

  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarea</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead>Avance</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {atrasadas.slice(0, 12).map((t) => (
            <TableRow key={t.Tar_Cod}>
              <TableCell>
                <div className="font-semibold">{t.Tar_Titulo}</div>
                <div className="mt-1 flex gap-1">
                  <PrioridadBadge prioridad={t.Tar_Prioridad} />
                  <EstadoBadge estado={t.Tar_Estado} />
                </div>
              </TableCell>
              <TableCell className="text-xs text-red-600">{fmtDate(t.Tar_Fecha_Fin)}</TableCell>
              <TableCell className="text-xs font-bold">{t.Ava_Porcentaje || 0}%</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onAvance(t)}>
                  Avance
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {atrasadas.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                No hay tareas atrasadas.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function FiltrosWidget({
  q,
  setQ,
  filtroEstado,
  setFiltroEstado,
  viewMode,
  setViewMode,
  onNueva,
}: {
  q: string;
  setQ: (v: string) => void;
  filtroEstado: string;
  setFiltroEstado: (v: string) => void;
  viewMode: TareasViewMode;
  setViewMode: (v: TareasViewMode) => void;
  onNueva: () => void;
}) {
  return (
    <FilterBar className="h-full">
      <div className="relative w-[220px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 min-h-0 pl-9 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarea..." />
      </div>
      <Select
        value={filtroEstado}
        onChange={(e) => setFiltroEstado(e.target.value)}
        wrapperClassName="w-[170px]"
        className="h-9 min-h-0 w-full py-0 text-sm"
      >
        <option value="todos">Todos los estados</option>
        <option value="Pendiente">Pendiente</option>
        <option value="Asignado">Asignado</option>
        <option value="En Proceso">En Proceso</option>
        <option value="Finalizada">Finalizada</option>
      </Select>
      <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
        <button
          type="button"
          onClick={() => setViewMode("lista")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
            viewMode === "lista" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <LayoutList className="size-3.5" />
          Lista
        </button>
        <button
          type="button"
          onClick={() => setViewMode("kanban")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
            viewMode === "kanban" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Columns3 className="size-3.5" />
          Kanban
        </button>
      </div>
      <Button type="button" className="h-9" onClick={onNueva}>
        <Plus />
        Nueva tarea
      </Button>
    </FilterBar>
  );
}

export function TareasWidget({
  tareas,
  loading,
  viewMode,
  onAvance,
  onMoveEstado,
}: {
  tareas: Tarea[];
  loading: boolean;
  viewMode: TareasViewMode;
  onAvance: (t: Tarea) => void;
  onMoveEstado: (t: Tarea, estado: KanbanEstado) => Promise<void> | void;
}) {
  if (viewMode === "kanban") {
    return (
      <div className="h-[360px] min-h-0 overflow-hidden sm:h-[420px]">
        <KanbanBoard
          tareas={tareas}
          loading={loading}
          onAvance={onAvance}
          onMoveEstado={onMoveEstado}
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:text-muted-foreground">
          <TableRow className="border-border hover:bg-muted">
            <TableHead>#</TableHead>
            <TableHead>Tarea</TableHead>
            <TableHead>Asignados</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead>Avance</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tareas.map((t) => (
            <TableRow key={t.Tar_Cod}>
              <TableCell className="font-mono text-muted-foreground">{t.Tar_Cod}</TableCell>
              <TableCell>
                <div className="font-semibold">{t.Tar_Titulo}</div>
                {t.Tar_Descripcion && (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {plainTextFromHtml(t.Tar_Descripcion)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t.Asignados.length ? t.Asignados.map((a) => a.Nombre).join(", ") : "Sin asignar"}
              </TableCell>
              <TableCell><PrioridadBadge prioridad={t.Tar_Prioridad} /></TableCell>
              <TableCell><EstadoBadge estado={t.Tar_Estado} /></TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmtDate(t.Tar_Fecha_Fin)}</TableCell>
              <TableCell>
                <div className="flex min-w-[110px] items-center gap-2">
                  <Progress value={Math.min(100, t.Ava_Porcentaje || 0)} className="h-2 w-16" />
                  <span className="text-xs font-bold tabular-nums">{t.Ava_Porcentaje || 0}%</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => onAvance(t)}>
                  Avance
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && tareas.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                No hay tareas en esta BD / filtro.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function MonitoreoWidget({
  devs,
  loading,
  onToggle,
  onIntervalo,
  onBandeja,
  onHistorial,
}: {
  devs: Dev[];
  loading: boolean;
  onToggle: (d: Dev) => void;
  onIntervalo: (d: Dev, minutos: number) => void;
  onBandeja: (d: Dev, patch: { Mon_Forzar_Bandeja?: number; Mon_Permitir_Salir?: number }) => void;
  onHistorial: (d: Dev) => void;
}) {
  return (
    <div className="h-full overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted [&_th]:text-muted-foreground">
          <TableRow className="border-border hover:bg-muted">
            <TableHead>Desarrollador</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Ventana</TableHead>
            <TableHead>Hoy</TableHead>
            <TableHead>Intervalo</TableHead>
            <TableHead>Monitoreo</TableHead>
            <TableHead>Bandeja / Salida</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {devs.map((d) => (
            <TableRow key={d.Per_Cod} className="align-top">
              <TableCell>
                <div className="font-semibold">{d.Nombre || "Sin nombre en ficha"}</div>
                <div className="text-xs text-muted-foreground">
                  {[d.Cedula, d.Cargo].filter(Boolean).join(" · ") || "Sin cédula en ficha"}
                </div>
              </TableCell>
              <TableCell>
                <EstadoBadge estado={d.Estado_Conexion} />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {d.Ultima_Conexion ? String(d.Ultima_Conexion).replace("T", " ").slice(0, 19) : "Sin conexion"}
                </div>
              </TableCell>
              <TableCell className="max-w-[220px]">
                <div className="truncate text-xs font-medium" title={d.Ultima_Ventana}>{d.Ultima_Ventana || "—"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{d.Ultimo_Proceso || ""}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <div>{d.Minutos_Activos_Hoy} min · {d.Promedio_Actividad_Hoy}%</div>
                <div>{d.Total_Clicks_Hoy} clk · {d.Total_Teclas_Hoy} tec · +{d.Total_Lineas_Hoy} lin</div>
              </TableCell>
              <TableCell>
                <Select
                  value={String(d.Mon_Intervalo_Minutos)}
                  onChange={(e) => onIntervalo(d, Number(e.target.value))}
                  className="h-8 w-[90px] text-xs"
                >
                  {[1, 2, 5, 10, 15, 30].map((n) => (
                    <option key={n} value={n}>{n} min</option>
                  ))}
                </Select>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch checked={!!d.Mon_Activo} onCheckedChange={() => onToggle(d)} />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {d.Mon_Activo ? "Activo" : "Pausado"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px]">
                    <Switch
                      checked={!!(d.Mon_Forzar_Bandeja ?? 1)}
                      onCheckedChange={() =>
                        onBandeja(d, { Mon_Forzar_Bandeja: d.Mon_Forzar_Bandeja ? 0 : 1 })
                      }
                    />
                    <span className="font-medium text-muted-foreground">Forzar bandeja</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px]">
                    <Switch
                      checked={!!d.Mon_Permitir_Salir}
                      onCheckedChange={() =>
                        onBandeja(d, { Mon_Permitir_Salir: d.Mon_Permitir_Salir ? 0 : 1 })
                      }
                    />
                    <span className="font-medium text-muted-foreground">Permitir salir</span>
                  </label>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="outline" size="sm" onClick={() => onHistorial(d)}>
                  <History />
                  Historial
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && devs.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                Sin desarrolladores con monitoreo.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
