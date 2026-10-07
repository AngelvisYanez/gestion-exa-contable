"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { PaginationBar, FilterBar, ViewModeToggle, type ListViewMode } from "@/components/list-controls";
import {
  DateRangeFilter,
  TICKET_FECHA_PRESETS,
  detectTicketFechaPreset,
  rangoTicketsPreset,
  type DateRangeValue,
} from "@/components/date-range-filter";
import { PrioridadBadge } from "@/components/status-badges";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { usePagination } from "@/hooks/use-pagination";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KanbanBoard, type KanbanEstado } from "@/components/dashboard/kanban-board";
import type { Tarea } from "@/components/dashboard/types";
import { TicketDetalleDialog } from "@/components/tareas/ticket-detalle-dialog";
import { AvanceDialog } from "@/components/tareas/avance-dialog";
import { ticketAsTarea, type Ticket } from "@/lib/ticket-view";
import { fmtFechaHoraZona } from "@/lib/timezone";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { plainTextFromHtml } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";
import {
  EVIDENCIA_ACCEPT,
  EVIDENCIA_HELP,
  EVIDENCIA_MAX_BYTES,
  evidenciaLabel,
  isAllowedEvidenciaFile,
} from "@/lib/evidencia-files";

type Asignable = {
  Per_Cod: number;
  Usu_Cod: number | null;
  Nombre: string;
  Cedula?: string;
};

type EmpresaOpt = {
  Emp_Cod: number;
  Emp_Nom: string;
};

type Kpis = {
  total: number;
  nuevos: number;
  asignados: number;
  proceso: number;
  cerrados: number;
  sin_asignar?: number;
  resueltos?: number;
};

type Bandeja = "todos" | "sin_asignar" | "asignados" | "resueltos";

const BANDEJAS: Array<{ id: Bandeja; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "sin_asignar", label: "Sin asignar" },
  { id: "asignados", label: "Asignados" },
  { id: "resueltos", label: "Resueltos" },
];

const MAX_FOTOS = 5;

function estadoTone(estado: string) {
  if (estado === "Nuevo") return "warning" as const;
  if (estado === "Asignado") return "secondary" as const;
  if (estado === "En Proceso") return "info" as const;
  if (estado === "Cerrado") return "success" as const;
  return "muted" as const;
}

function origenLabel(db?: string | null) {
  const id = String(db || "");
  if (id === "servicios") return "Servicios";
  if (id === "relavera" || id.startsWith("relavera")) return "Relavera";
  return "EXA";
}

function origenEsRelavera(db?: string | null) {
  const id = String(db || "");
  return id === "relavera" || id.startsWith("relavera");
}

function fmtWhen(v: string) {
  if (!v) return "—";
  const formatted = fmtFechaHoraZona(v, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return formatted === "—" ? "—" : formatted;
}

export default function TicketsPage() {
  const { db, user, loading: authLoading } = useAuth();
  const isDev = user?.role === "developer";
  const puedeAsignar = user?.role === "manager" || user?.role === "atencion";
  const { lastTaskEventAt } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [empQuery, setEmpQuery] = useState("");
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [bandeja, setBandeja] = useState<Bandeja>("todos");
  const [rango, setRango] = useState<DateRangeValue>(() => rangoTicketsPreset("hoy"));
  const [todasLasFechas, setTodasLasFechas] = useState(false);
  const [vistaLista, setVistaLista] = useState(false);
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ListViewMode>("lista");
  const [avanceTarea, setAvanceTarea] = useState<Tarea | null>(null);
  const [detalleCod, setDetalleCod] = useState<number | null>(null);
  const [detalleDb, setDetalleDb] = useState<string | null>(null);
  const pager = usePagination(tickets, {
    resetKey: `${bandeja}|${q}|${rango.desde}|${rango.hasta}`,
  });
  const detalleTicket =
    detalleCod != null
      ? tickets.find(
          (t) => t.Tic_Cod === detalleCod && (!detalleDb || t.Db_Origen === detalleDb)
        ) ?? null
      : null;
  const bandejasVisibles = isDev
    ? [
        { id: "asignados" as Bandeja, label: "Abiertos" },
        { id: "resueltos" as Bandeja, label: "Resueltos" },
        { id: "todos" as Bandeja, label: "Todos" },
      ]
    : BANDEJAS;

  const abrirDetalle = (t: Ticket) => {
    setDetalleCod(t.Tic_Cod);
    setDetalleDb(t.Db_Origen || null);
  };

  const [formOpen, setFormOpen] = useState(false);
  const [formEnviadoPor, setFormEnviadoPor] = useState("");
  const [formEmpresa, setFormEmpresa] = useState("");
  const [formEmpCod, setFormEmpCod] = useState("");
  const [formTel, setFormTel] = useState("");
  const [formProceso, setFormProceso] = useState("Modificar");
  const [formTitulo, setFormTitulo] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrio, setFormPrio] = useState("Media");
  const [formFotos, setFormFotos] = useState<File[]>([]);
  const [formError, setFormError] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);

  const [assignOpen, setAssignOpen] = useState<Ticket | null>(null);
  const [assignUsus, setAssignUsus] = useState<number[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");

  useEffect(() => {
    const urls = formFotos.map((f) => URL.createObjectURL(f));
    setFotoPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [formFotos]);

  const resetForm = () => {
    setFormEnviadoPor("");
    setFormEmpresa("");
    setFormEmpCod("");
    setEmpQuery("");
    setFormTel("");
    setFormProceso("Modificar");
    setFormTitulo("");
    setFormDesc("");
    setFormPrio("Media");
    setFormFotos([]);
    setFormError("");
  };

  const addFotos = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).filter((f) => {
      if (f.size > EVIDENCIA_MAX_BYTES) {
        setFormError(`"${f.name}" supera ${Math.round(EVIDENCIA_MAX_BYTES / (1024 * 1024))} MB.`);
        return false;
      }
      if (!isAllowedEvidenciaFile(f)) {
        setFormError(`"${f.name}": formato no permitido.`);
        return false;
      }
      return true;
    });
    setFormFotos((prev) => [...prev, ...next].slice(0, MAX_FOTOS));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        Ses_Dat_Dis: db,
        bandeja,
        q,
        limit: "2000",
      });
      if (!todasLasFechas) {
        params.set("desde", rango.desde);
        params.set("hasta", rango.hasta);
      }
      if (puedeAsignar) params.set("assignees", "1");
      const url = `/api/tickets?${params.toString()}`;
      const res = await fetch(url);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error al cargar tickets");
      setTickets(j.tickets || []);
      setAsignables(j.asignables || []);
      setEmpresas(j.empresas || []);
      setKpis(j.kpis || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [bandeja, q, rango.desde, rango.hasta, db, todasLasFechas, puedeAsignar]);

  const vistaIniciada = useRef(false);
  useEffect(() => {
    if (authLoading || !user || vistaIniciada.current) return;
    vistaIniciada.current = true;
    if (user.role === "developer") {
      setBandeja("asignados");
      setTodasLasFechas(true);
    }
    setVistaLista(true);
  }, [authLoading, user]);

  useEffect(() => {
    if (!vistaLista) return;
    void load();
  }, [vistaLista, load]);

  useEffect(() => {
    if (!lastTaskEventAt || !vistaLista) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [lastTaskEventAt, load, vistaLista]);

  const crearTicket = async () => {
    if (!formTitulo.trim()) {
      setFormError("El titulo es obligatorio.");
      return;
    }
    if (!plainTextFromHtml(formDesc).trim() && !formDesc.trim()) {
      setFormError("La descripcion del problema es obligatoria.");
      return;
    }
    setFormSaving(true);
    setFormError("");
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          Ses_Dat_Dis: db,
          titulo: formTitulo,
          descripcion: formDesc,
          prioridad: formPrio,
          enviadoPor: formEnviadoPor,
          empresa: formEmpCod
            ? empresas.find((e) => String(e.Emp_Cod) === formEmpCod)?.Emp_Nom || formEmpresa
            : "TODAS EMPRESAS",
          empCod: formEmpCod ? Number(formEmpCod) : undefined,
          telefono: formTel,
          proceso: formProceso,
          usuCreador: user?.usuCod || undefined,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo crear");
      const ticCod = Number(j.ticket?.Tic_Cod || 0);

      if (ticCod > 0 && formFotos.length) {
        const fd = new FormData();
        fd.set("Tic_Cod", String(ticCod));
        for (const f of formFotos) fd.append("files", f);
        const up = await fetch("/api/evidencias", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok || !uj.success) throw new Error(uj.message || "No se subieron las evidencias");
        const adjuntos = (uj.adjuntos || []).map((a: { ruta: string }) => a.ruta);
        if (adjuntos.length) {
          const att = await fetch("/api/tickets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "attach_evidencias",
              Ses_Dat_Dis: db,
              Tic_Cod: ticCod,
              adjuntos,
            }),
          });
          const aj = await att.json();
          if (!att.ok || !aj.success) throw new Error(aj.message || "No se vincularon las evidencias");
        }
      }

      setFormOpen(false);
      resetForm();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error");
    } finally {
      setFormSaving(false);
    }
  };

  const asignar = async () => {
    if (!assignOpen || assignUsus.length === 0) {
      setAssignError("Selecciona al menos un desarrollador del equipo.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    try {
      const asignados = assignUsus.map((usu) => {
        const chosen = asignables.find((a) => a.Usu_Cod === usu);
        return { Usu_Cod: usu, Per_Cod: chosen?.Per_Cod };
      });
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          Ses_Dat_Dis: assignOpen.Db_Origen || db,
          Db_Origen: assignOpen.Db_Origen || undefined,
          Tic_Cod: assignOpen.Tic_Cod,
          asignados,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo asignar");
      setAssignOpen(null);
      setAssignUsus([]);
      await load();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Error");
    } finally {
      setAssignSaving(false);
    }
  };

  const abrirAsignar = (t: Ticket) => {
    const ids =
      t.Asignados && t.Asignados.length
        ? t.Asignados.map((a) => a.Usu_Cod)
        : t.Asignado_Usu_Cod
          ? [t.Asignado_Usu_Cod]
          : [];
    setAssignError("");
    setAssignUsus(ids);
    setAssignOpen(t);
  };

  const setEstado = async (t: Ticket, estado: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estado",
          Ses_Dat_Dis: t.Db_Origen || db,
          Db_Origen: t.Db_Origen || undefined,
          Tic_Cod: t.Tic_Cod,
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

  const kanbanItems = useMemo(() => tickets.map(ticketAsTarea), [tickets]);

  const moverKanban = async (t: Tarea, estado: KanbanEstado) => {
    const ticCod = t.Tic_Cod || t.Tar_Cod;
    const ticket = tickets.find(
      (x) => x.Tic_Cod === ticCod && (!t.Db_Origen || x.Db_Origen === t.Db_Origen)
    );
    if (!ticket) return;
    if (estado === "Finalizada") return;
    const next = estado === "Pendiente" ? "Nuevo" : estado;
    await setEstado(ticket, next);
  };

  return (
    <>
      <Topbar
        title={isDev ? "Mis tickets" : "Tickets"}
        subtitle={
          isDev
            ? todasLasFechas
              ? "Asignados a ti · EXA, Servicios y Relavera"
              : `Asignados a ti · ${rango.desde} a ${rango.hasta}`
            : todasLasFechas
              ? "EXA, Servicios y Relavera juntos"
              : `EXA, Servicios y Relavera · ${rango.desde} a ${rango.hasta}`
        }
      />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-4 py-6 sm:px-6">
        <div className={cn("mb-5 grid grid-cols-2 gap-3", isDev ? "sm:grid-cols-3" : "sm:grid-cols-4")}>
          {(isDev
            ? [
                { label: "Total", value: kpis?.total ?? 0, tone: "text-sky-700", id: "todos" as Bandeja },
                {
                  label: "Abiertos",
                  value: kpis?.asignados ?? 0,
                  tone: "text-violet-700",
                  id: "asignados" as Bandeja,
                },
                {
                  label: "Resueltos",
                  value: kpis?.resueltos ?? kpis?.cerrados ?? 0,
                  tone: "text-emerald-700",
                  id: "resueltos" as Bandeja,
                },
              ]
            : [
                { label: "Total", value: kpis?.total ?? 0, tone: "text-sky-700", id: "todos" as Bandeja },
                {
                  label: "Sin asignar",
                  value: kpis?.sin_asignar ?? kpis?.nuevos ?? 0,
                  tone: "text-amber-700",
                  id: "sin_asignar" as Bandeja,
                },
                {
                  label: "Asignados",
                  value: kpis?.asignados ?? 0,
                  tone: "text-violet-700",
                  id: "asignados" as Bandeja,
                },
                {
                  label: "Resueltos",
                  value: kpis?.resueltos ?? kpis?.cerrados ?? 0,
                  tone: "text-emerald-700",
                  id: "resueltos" as Bandeja,
                },
              ]
          ).map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => setBandeja(k.id)}
              className={cn(
                "rounded-xl border bg-card p-3 text-left shadow-sm transition-colors",
                bandeja === k.id ? "border-sky-400 ring-2 ring-sky-200" : "border-border/80 hover:border-sky-200"
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {k.label}
              </div>
              <div className={cn("mt-1 text-2xl font-bold tabular-nums", k.tone)}>{k.value}</div>
            </button>
          ))}
        </div>

        <div className="mb-4 space-y-2">
          <FilterBar>
            <div className="flex h-10 max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 px-1 shadow-sm">
              {isDev && (
                <button
                  type="button"
                  onClick={() => setTodasLasFechas(true)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                    todasLasFechas
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Todas
                </button>
              )}
              {TICKET_FECHA_PRESETS.map((p) => {
                const activo = !todasLasFechas && detectTicketFechaPreset(rango) === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setTodasLasFechas(false);
                      setRango(rangoTicketsPreset(p.id));
                    }}
                    className={cn(
                      "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                      activo
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <DateRangeFilter
              compact
              value={rango}
              onChange={(next) => {
                setTodasLasFechas(false);
                setRango(next);
              }}
            />
            <Button type="button" variant="secondary" className="h-9" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Actualizar
            </Button>
            {puedeAsignar && (
              <Button
                type="button"
                className="h-9"
                onClick={() => {
                  setFormError("");
                  setFormOpen(true);
                }}
              >
                <Plus />
                Nuevo ticket
              </Button>
            )}
          </FilterBar>
          <FilterBar>
            <div className="relative w-full min-w-0 sm:w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 min-h-0 pl-9 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por #, tema, empresa..."
              />
            </div>
            <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40 p-0.5">
              {bandejasVisibles.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBandeja(b.id)}
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                    bandeja === b.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <ViewModeToggle value={viewMode} onChange={setViewMode} withKanban />
          </FilterBar>
        </div>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        <div
          className={cn(
            "mb-6 w-full min-w-0",
            viewMode === "kanban" &&
              "flex h-[min(70dvh,calc(100dvh-18rem))] min-h-[320px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-2 shadow-sm sm:p-3"
          )}
        >
            {viewMode === "kanban" ? (
              <KanbanBoard
                tareas={kanbanItems}
                loading={loading}
                onAvance={(t) => setAvanceTarea(t)}
                onMoveEstado={moverKanban}
                onOpen={(t) => {
                  setDetalleCod(t.Tic_Cod || t.Tar_Cod);
                  setDetalleDb(t.Db_Origen || null);
                }}
                className="min-h-0 flex-1"
              />
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pager.slice.map((t) => (
                  <article
                    key={`${t.Db_Origen || "db"}-${t.Tic_Cod}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrirDetalle(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        abrirDetalle(t);
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand-navy/30",
                      t.Tic_Estado === "Nuevo" ? "border-amber-200 bg-amber-50/30" : "border-border/80"
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{t.Tic_Cod}</span>
                      <Badge variant={t.Db_Origen === "servicios" ? "warning" : origenEsRelavera(t.Db_Origen) ? "secondary" : "info"}>
                        {origenLabel(t.Db_Origen)}
                      </Badge>
                      <Badge variant={estadoTone(t.Tic_Estado)}>{t.Tic_Estado}</Badge>
                      <PrioridadBadge prioridad={t.Tic_Prioridad} />
                    </div>
                    <h3 className="line-clamp-2 text-sm font-bold text-brand-gray-900">{t.Tic_Titulo}</h3>
                    {t.Tic_Descripcion && (
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                        {plainTextFromHtml(t.Tic_Descripcion)}
                      </p>
                    )}
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <div>Llego: {fmtWhen(t.Tic_Fecha_Llegada)}</div>
                      {(t.Enviado_Por || t.Creador_Nombre) && (
                        <div>
                          Enviado por:{" "}
                          <strong className="text-foreground">
                            {t.Enviado_Por || t.Creador_Nombre}
                          </strong>
                        </div>
                      )}
                      <div className="inline-flex items-center gap-1">
                        <Building2 className="size-3" />
                        {t.Emp_Nom || "Empresa no indicada"}
                      </div>
                      {t.Proceso && <div>Proceso: {t.Proceso}</div>}
                      {t.Tic_Tel && <div>Tel: {t.Tic_Tel}</div>}
                      <div>
                        Desarrollador:{" "}
                        <strong className="text-foreground">{t.Asignado_Nombre || "Sin asignar"}</strong>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {puedeAsignar && t.Tic_Estado !== "Cerrado" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirAsignar(t);
                          }}
                        >
                          <UserPlus className="size-3.5" />
                          {t.Asignado_Usu_Cod ? "Reasignar" : "Asignar"}
                        </Button>
                      )}
                      {t.Tic_Estado === "Asignado" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            void setEstado(t, "En Proceso");
                          }}
                        >
                          En proceso
                        </Button>
                      )}
                      {t.Tic_Estado !== "Cerrado" && t.Asignado_Usu_Cod && (
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAvanceTarea(ticketAsTarea(t));
                          }}
                        >
                          Avance
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/80 bg-card shadow-sm">
                <Table className="min-w-[1180px]">
                  <TableHeader className="bg-slate-900 [&_th]:text-slate-200">
                    <TableRow className="border-0 hover:bg-slate-900">
                      <TableHead className="w-16 whitespace-nowrap text-slate-200">#</TableHead>
                      <TableHead className="min-w-[240px] text-slate-200">Ticket</TableHead>
                      <TableHead className="w-[110px] whitespace-nowrap text-slate-200">Estado</TableHead>
                      <TableHead className="w-[100px] whitespace-nowrap text-slate-200">Prioridad</TableHead>
                      <TableHead className="min-w-[160px] text-slate-200">Empresa</TableHead>
                      <TableHead className="min-w-[160px] text-slate-200">Contacto</TableHead>
                      <TableHead className="min-w-[140px] text-slate-200">Desarrollador</TableHead>
                      <TableHead className="min-w-[210px] whitespace-nowrap text-slate-200">Llegada</TableHead>
                      <TableHead className="w-[280px] whitespace-nowrap text-right text-slate-200">
                        Acciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pager.slice.map((t) => (
                      <TableRow
                        key={`${t.Db_Origen || "db"}-${t.Tic_Cod}`}
                        className={cn(
                          "cursor-pointer",
                          t.Tic_Estado === "Nuevo" ? "bg-amber-50/40" : undefined
                        )}
                        onClick={() => abrirDetalle(t)}
                      >
                        <TableCell className="whitespace-nowrap font-mono text-muted-foreground">
                          {t.Tic_Cod}
                          <div
                            className={cn(
                              "text-[10px] font-sans font-bold",
                              t.Db_Origen === "servicios" ? "text-amber-700" : origenEsRelavera(t.Db_Origen) ? "text-violet-700" : "text-sky-700"
                            )}
                          >
                            {origenLabel(t.Db_Origen)}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[240px]">
                          <div className="font-semibold leading-snug">{t.Tic_Titulo}</div>
                          {t.Tic_Descripcion && (
                            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {plainTextFromHtml(t.Tic_Descripcion)}
                            </div>
                          )}
                          {t.Proceso && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Proceso: {t.Proceso}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={estadoTone(t.Tic_Estado)}>{t.Tic_Estado}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <PrioridadBadge prioridad={t.Tic_Prioridad} />
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs text-muted-foreground">
                          {t.Emp_Nom || "Empresa no indicada"}
                        </TableCell>
                        <TableCell className="min-w-[160px] text-xs">
                          <div className="font-medium text-foreground">
                            {t.Enviado_Por || t.Creador_Nombre || "—"}
                          </div>
                          {t.Tic_Tel && (
                            <div className="text-muted-foreground">{t.Tic_Tel}</div>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[140px] whitespace-nowrap text-xs">
                          {t.Asignado_Nombre || (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell className="min-w-[210px] whitespace-nowrap text-xs text-muted-foreground">
                          {fmtWhen(t.Tic_Fecha_Llegada)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                            {puedeAsignar && t.Tic_Estado !== "Cerrado" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirAsignar(t);
                                }}
                              >
                                <UserPlus className="size-3.5" />
                                {t.Asignado_Usu_Cod ? "Reasignar" : "Asignar"}
                              </Button>
                            )}
                            {t.Tic_Estado === "Asignado" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void setEstado(t, "En Proceso");
                                }}
                              >
                                En proceso
                              </Button>
                            )}
                            {t.Tic_Estado !== "Cerrado" && t.Asignado_Usu_Cod && (
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAvanceTarea(ticketAsTarea(t));
                                }}
                              >
                                Avance
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && tickets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                          {isDev
                            ? "No tienes tickets asignados en este filtro."
                            : `No hay tickets entre ${rango.desde} y ${rango.hasta}. Prueba otro periodo.`}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {!loading && tickets.length === 0 && viewMode === "grid" && (
              <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                {isDev
                  ? "No tienes tickets asignados en este filtro."
                  : `No hay tickets entre ${rango.desde} y ${rango.hasta}. Prueba otro periodo.`}
              </div>
            )}

            {viewMode !== "kanban" && (
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
            )}
        </div>

        {loading && (
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="size-3.5 animate-spin" />
            Cargando tickets...
          </div>
        )}

        <TicketDetalleDialog
          ticket={detalleTicket ? ticketAsTarea(detalleTicket) : null}
          onClose={() => setDetalleCod(null)}
          onRegistrarAvance={(t) => setAvanceTarea(t)}
        />
        <AvanceDialog
          tarea={avanceTarea}
          endpoint="/api/tickets"
          extraBody={{ Ses_Dat_Dis: avanceTarea?.Db_Origen || db }}
          onClose={() => setAvanceTarea(null)}
          onSaved={async () => {
            setAvanceTarea(null);
            await load();
          }}
        />

        <Dialog
          open={formOpen}
          onOpenChange={(o) => {
            setFormOpen(o);
            if (!o) resetForm();
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo ticket</DialogTitle>
              <DialogDescription>
                Mismo formato que llega por WhatsApp. Este ticket nuevo se guarda en{" "}
                {origenLabel(db)}. La lista muestra EXA, Servicios y Relavera juntos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {formError ? <Alert variant="destructive">{formError}</Alert> : null}
              <div className="space-y-2">
                <Label>Enviado por</Label>
                <Input
                  value={formEnviadoPor}
                  onChange={(e) => setFormEnviadoPor(e.target.value)}
                  disabled={formSaving}
                  placeholder="DAYSE PATRICIA LABANDA RUIZ"
                />
              </div>
              <div className="space-y-2">
                <Label>Empresa</Label>
                <Input
                  value={empQuery}
                  onChange={(e) => setEmpQuery(e.target.value)}
                  disabled={formSaving}
                  placeholder="Buscar empresa..."
                />
                <Select
                  value={formEmpCod}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormEmpCod(value);
                    if (!value) {
                      setFormEmpresa("TODAS EMPRESAS");
                      return;
                    }
                    const found = empresas.find((x) => String(x.Emp_Cod) === value);
                    setFormEmpresa(found?.Emp_Nom || "");
                  }}
                  disabled={formSaving}
                >
                  <option value="">TODAS EMPRESAS</option>
                  {empresas
                    .filter((e) => {
                      const q = empQuery.trim().toLowerCase();
                      if (!q || String(e.Emp_Cod) === formEmpCod) return true;
                      return e.Emp_Nom.toLowerCase().includes(q);
                    })
                    .map((e) => (
                      <option key={e.Emp_Cod} value={e.Emp_Cod}>
                        {e.Emp_Nom}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Telefono</Label>
                  <Input
                    value={formTel}
                    onChange={(e) => setFormTel(e.target.value)}
                    disabled={formSaving}
                    placeholder="0939147553"
                    inputMode="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Proceso</Label>
                  <Input
                    value={formProceso}
                    onChange={(e) => setFormProceso(e.target.value)}
                    disabled={formSaving}
                    placeholder="Modificar"
                    list="ticket-procesos"
                  />
                  <datalist id="ticket-procesos">
                    <option value="Modificar" />
                    <option value="Consultar" />
                    <option value="Crear" />
                    <option value="Eliminar" />
                    <option value="Soporte" />
                  </datalist>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Titulo</Label>
                <Input
                  value={formTitulo}
                  onChange={(e) => setFormTitulo(e.target.value)}
                  disabled={formSaving}
                  placeholder="LIBERAS ASIENTOS DE PROVISION"
                />
              </div>
              <div className="space-y-2">
                <Label>Descripcion</Label>
                <RichTextEditor
                  value={formDesc}
                  onChange={setFormDesc}
                  disabled={formSaving}
                  placeholder="Descripcion del problema que reporta el usuario..."
                />
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={formPrio} onChange={(e) => setFormPrio(e.target.value)} disabled={formSaving}>
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Evidencias / adjuntos</Label>
                <input
                  ref={fotoRef}
                  type="file"
                  accept={EVIDENCIA_ACCEPT}
                  multiple
                  className="hidden"
                  disabled={formSaving}
                  onChange={(e) => {
                    addFotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={formSaving || formFotos.length >= MAX_FOTOS}
                  onClick={() => fotoRef.current?.click()}
                >
                  <ImagePlus className="size-4" />
                  Adjuntar archivos ({formFotos.length}/{MAX_FOTOS})
                </Button>
                {formFotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {formFotos.map((f, i) => (
                      <div
                        key={`${f.name}-${i}`}
                        className="relative overflow-hidden rounded-lg border border-border/70"
                      >
                        {fotoPreviews[i] && f.type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={fotoPreviews[i]} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted p-2 text-center">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground">
                              {evidenciaLabel(f.name)}
                            </span>
                            <span className="line-clamp-2 text-[10px] font-medium">{f.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                          disabled={formSaving}
                          onClick={() => setFormFotos((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label="Quitar evidencia"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">{EVIDENCIA_HELP}</p>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)} disabled={formSaving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void crearTicket()} disabled={formSaving}>
                {formSaving ? <Loader2 className="animate-spin" /> : null}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!assignOpen} onOpenChange={(o) => !o && setAssignOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Asignar ticket</DialogTitle>
              <DialogDescription>
                #{assignOpen?.Tic_Cod} · {origenLabel(assignOpen?.Db_Origen)} · {assignOpen?.Tic_Titulo}.
                Puedes marcar varios del equipo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {assignError ? <Alert variant="destructive">{assignError}</Alert> : null}
              <div className="space-y-2">
                <Label>Equipo ({assignUsus.length})</Label>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-2">
                  {asignables.filter((a) => a.Usu_Cod).length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      No hay personas del equipo con usuario EXA.
                    </p>
                  ) : (
                    asignables
                      .filter((a) => a.Usu_Cod)
                      .map((a) => {
                        const checked = assignUsus.includes(a.Usu_Cod!);
                        return (
                          <label
                            key={a.Usu_Cod}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-sky-700"
                              checked={checked}
                              disabled={assignSaving}
                              onChange={() => {
                                const id = a.Usu_Cod!;
                                setAssignUsus((prev) =>
                                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                                );
                              }}
                            />
                            <span>
                              {a.Nombre}
                              {a.Cedula ? ` · ${a.Cedula}` : ""}
                            </span>
                          </label>
                        );
                      })
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAssignOpen(null)} disabled={assignSaving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void asignar()} disabled={assignSaving}>
                {assignSaving ? <Loader2 className="animate-spin" /> : <UserPlus />}
                Asignar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
