"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { TicketDetalleDialog } from "@/components/tareas/ticket-detalle-dialog";
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
  const { db, user } = useAuth();
  const { lastTaskEventAt } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [bandeja, setBandeja] = useState<Bandeja>("todos");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<ListViewMode>("lista");
  const [detalleCod, setDetalleCod] = useState<number | null>(null);
  const pager = usePagination(tickets, { resetKey: `${bandeja}|${q}` });
  const detalleTicket =
    detalleCod != null ? tickets.find((t) => t.Tic_Cod === detalleCod) ?? null : null;

  const [formOpen, setFormOpen] = useState(false);
  const [formEnviadoPor, setFormEnviadoPor] = useState("");
  const [formEmpresa, setFormEmpresa] = useState("");
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
  const [assignUsu, setAssignUsu] = useState("");
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
      const url = `/api/tickets?Ses_Dat_Dis=${encodeURIComponent(db)}&bandeja=${encodeURIComponent(bandeja)}&q=${encodeURIComponent(q)}&assignees=1&limit=300`;
      const res = await fetch(url);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error al cargar tickets");
      setTickets(j.tickets || []);
      setAsignables(j.asignables || []);
      setKpis(j.kpis || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [db, bandeja, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastTaskEventAt) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [lastTaskEventAt, load]);

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
          empresa: formEmpresa,
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
    if (!assignOpen || !assignUsu) {
      setAssignError("Selecciona un desarrollador del equipo.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    try {
      const chosen = asignables.find((a) => String(a.Usu_Cod) === assignUsu);
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          Ses_Dat_Dis: db,
          Tic_Cod: assignOpen.Tic_Cod,
          Usu_Cod: Number(assignUsu),
          Per_Cod: chosen?.Per_Cod,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo asignar");
      setAssignOpen(null);
      setAssignUsu("");
      await load();
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : "Error");
    } finally {
      setAssignSaving(false);
    }
  };

  const setEstado = async (t: Ticket, estado: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "estado",
          Ses_Dat_Dis: db,
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

  return (
    <>
      <Topbar title="Tickets" subtitle="Tabla EXA · tickets recibidos" />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-4 py-6 sm:px-6">
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
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
          ].map((k) => (
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

        <FilterBar className="mb-4">
          <div className="relative w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 min-h-0 pl-9 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por #, tema, empresa..."
            />
          </div>
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-0.5">
            {BANDEJAS.map((b) => (
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
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button type="button" variant="secondary" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
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
        </FilterBar>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        <div className="mb-6 w-full min-w-0">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {pager.slice.map((t) => (
                  <article
                    key={t.Tic_Cod}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetalleCod(t.Tic_Cod)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetalleCod(t.Tic_Cod);
                      }
                    }}
                    className={cn(
                      "cursor-pointer rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-brand-navy/30",
                      t.Tic_Estado === "Nuevo" ? "border-amber-200 bg-amber-50/30" : "border-border/80"
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{t.Tic_Cod}</span>
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
                      {t.Tic_Estado !== "Cerrado" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAssignError("");
                            setAssignUsu(t.Asignado_Usu_Cod ? String(t.Asignado_Usu_Cod) : "");
                            setAssignOpen(t);
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
                      {t.Tic_Estado !== "Cerrado" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          onClick={(e) => {
                            e.stopPropagation();
                            void setEstado(t, "Cerrado");
                          }}
                        >
                          Resuelto
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
                        key={t.Tic_Cod}
                        className={cn(
                          "cursor-pointer",
                          t.Tic_Estado === "Nuevo" ? "bg-amber-50/40" : undefined
                        )}
                        onClick={() => setDetalleCod(t.Tic_Cod)}
                      >
                        <TableCell className="whitespace-nowrap font-mono text-muted-foreground">
                          {t.Tic_Cod}
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
                            {t.Tic_Estado !== "Cerrado" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignError("");
                                  setAssignUsu(t.Asignado_Usu_Cod ? String(t.Asignado_Usu_Cod) : "");
                                  setAssignOpen(t);
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
                            {t.Tic_Estado !== "Cerrado" && (
                              <Button
                                type="button"
                                size="sm"
                                variant="success"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void setEstado(t, "Cerrado");
                                }}
                              >
                                Resuelto
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && tickets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                          No hay tickets en este filtro.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {!loading && tickets.length === 0 && viewMode === "grid" && (
              <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
                No hay tickets en este filtro.
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

        {loading && (
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="size-3.5 animate-spin" />
            Cargando tickets...
          </div>
        )}

        <TicketDetalleDialog
          ticket={detalleTicket ? ticketAsTarea(detalleTicket) : null}
          onClose={() => setDetalleCod(null)}
          onMoveEstado={async () => {
            if (!detalleTicket) return;
            await setEstado(detalleTicket, "Cerrado");
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
                Mismo formato que llega por WhatsApp: remitente, empresa, telefono, proceso, titulo y
                descripcion del problema.
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
                  value={formEmpresa}
                  onChange={(e) => setFormEmpresa(e.target.value)}
                  disabled={formSaving}
                  placeholder="LABANDA RUIZ DAYSE PATRICIA"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                #{assignOpen?.Tic_Cod} {assignOpen?.Tic_Titulo}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {assignError ? <Alert variant="destructive">{assignError}</Alert> : null}
              <div className="space-y-2">
                <Label>Desarrollador</Label>
                <Select value={assignUsu} onChange={(e) => setAssignUsu(e.target.value)} disabled={assignSaving}>
                  <option value="">Seleccionar...</option>
                  {asignables
                    .filter((a) => a.Usu_Cod)
                    .map((a) => (
                      <option key={a.Usu_Cod!} value={a.Usu_Cod!}>
                        {a.Nombre}
                        {a.Cedula ? ` · ${a.Cedula}` : ""}
                      </option>
                    ))}
                </Select>
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
