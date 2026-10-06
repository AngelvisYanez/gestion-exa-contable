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
import { FilterBar } from "@/components/list-controls";
import { PrioridadBadge } from "@/components/status-badges";
import { useAuth } from "@/contexts/AuthContext";
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
  enLog: boolean;
};

type Asignable = {
  Per_Cod: number;
  Nombre: string;
  Cedula?: string;
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

export default function IncidenciasPage() {
  const { db, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<Incidencia[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [logConfigured, setLogConfigured] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [q, setQ] = useState("");

  const [taskOpen, setTaskOpen] = useState<Incidencia | null>(null);
  const [perCod, setPerCod] = useState("");
  const [prio, setPrio] = useState("Alta");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskOk, setTaskOk] = useState("");

  const [detail, setDetail] = useState<Incidencia | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url =
        `/api/incidencias?Ses_Dat_Dis=${encodeURIComponent(db)}` +
        `&estado=${encodeURIComponent(filtroEstado)}` +
        `&nivel=${encodeURIComponent(filtroNivel)}` +
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
  }, [db, filtroEstado, filtroNivel, q]);

  useEffect(() => {
    void load();
  }, [load]);

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
          perCodAsignar: perCod ? Number(perCod) : undefined,
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

  return (
    <>
      <Topbar title="Incidencias" subtitle="Logs de error EXA" />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-4 py-6 sm:px-6">
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
              <code className="rounded bg-black/10 px-1">.env</code> apuntando a{" "}
              <code className="rounded bg-black/10 px-1">exa-error.log</code>
              {logFiles[0] ? ` (probado: ${logFiles[0].path})` : ""}.
            </Alert>
          </div>
        )}

        {logConfigured && (
          <p className="mb-4 text-[11px] text-muted-foreground">
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
          <Button type="button" variant="secondary" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Escanear
          </Button>
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
          <div className="space-y-3">
            {rows.map((inc) => (
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {inc.Inc_Cod != null && (
                        <span className="font-mono text-xs text-muted-foreground">#{inc.Inc_Cod}</span>
                      )}
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
                      <span className="text-[11px] text-muted-foreground">
                        ×{inc.Inc_Ocurrencias}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-brand-gray-900 line-clamp-2">
                      {inc.Inc_Titulo}
                    </h3>
                    {(inc.Inc_Archivo || inc.Inc_Fuente) && (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">
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
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setDetail(inc)}>
                      Detalle
                    </Button>
                    {!inc.Tar_Cod &&
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
                </div>
              </article>
            ))}
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
              <div className="space-y-2">
                <Label>Asignar a (opcional)</Label>
                <Select value={perCod} onChange={(e) => setPerCod(e.target.value)}>
                  <option value="">Sin asignar — queda Pendiente</option>
                  {asignables.map((a) => (
                    <option key={a.Per_Cod} value={String(a.Per_Cod)}>
                      {a.Nombre}
                      {a.Cedula ? ` · ${a.Cedula}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
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

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de incidencia</DialogTitle>
            <DialogDescription>
              {detail?.Inc_Archivo
                ? `${detail.Inc_Archivo}${detail.Inc_Linea != null ? `:${detail.Inc_Linea}` : ""}`
                : "Mensaje completo del log"}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <pre className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-[#141413] p-3 text-[11px] leading-relaxed text-[#e8e8e4] whitespace-pre-wrap break-words">
              {detail.Inc_Mensaje || detail.Inc_Titulo}
            </pre>
          )}
          <DialogFooter>
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
    </>
  );
}
