"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Camera,
  Clock,
  FileText,
  History,
  Link2,
  Loader2,
  Paperclip,
  PauseCircle,
  Pencil,
  Sparkles,
  Ticket,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { ComplejidadBadge, EstadoBadge, PlazoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { RichTextHtml, isProbablyHtml, plainTextFromHtml } from "@/components/ui/rich-text";
import { useAuth } from "@/contexts/AuthContext";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { GenerarBriefDialog } from "@/components/tareas/generar-brief-dialog";
import { OfsercontAlcanceFields } from "@/components/tareas/ofsercont-alcance-fields";
import { TareaEditDialog } from "@/components/tareas/tarea-edit-dialog";
import type { TareaDetalle } from "@/lib/tareas";
import { fmtFechaHoraZona, hoyFecha, startOfDayZona } from "@/lib/timezone";
import { plazoDesdeFechas } from "@/lib/plazo-tarea";
import { cn } from "@/lib/utils";
import { evidenciaLabel } from "@/lib/evidencia-files";
import { AdjuntoPreviewDialog, esPdfAdjunto, type AdjuntoPreview } from "@/components/tareas/adjunto-preview-dialog";
import { ShareMenu, type CompartirEstado } from "@/components/tareas/share-menu";
import { tareaDetailUrl } from "@/lib/detail-link";

type Props = {
  tarea: Tarea | null;
  detailUrl: (tarCod: number) => string;
  onClose: () => void;
  onRegistrarAvance?: (t: Tarea) => void;
  onSaved?: () => void | Promise<void>;
  editExtraBody?: Record<string, unknown>;
  reloadKey?: number;
};

const CAPTURA_DIAS = [1, 3, 7, 15, 30] as const;

type TimelineItem =
  | {
      kind: "avance";
      key: string;
      at: string;
      avance: TareaDetalle["avances"][number];
    }
  | {
      kind: "asignacion";
      key: string;
      at: string;
      nombre: string;
    };

function fmtFechaHora(iso?: string | null) {
  return fmtFechaHoraZona(iso);
}

function briefAdjunto(
  rel: string | null | undefined,
  evidencias: TareaDetalle["evidencias_iniciales"]
) {
  if (!rel) return null;
  const file = rel.replace(/\\/g, "/").split("/").pop() || "";
  const ext = file.split(".").pop()?.toLowerCase() || "";
  const stem = file.replace(/\.[^.]+$/, "").slice(0, 40);
  if (!stem || !ext) return null;
  return (
    [...evidencias]
      .reverse()
      .find((e) => e.nombre.includes(stem) && e.nombre.toLowerCase().endsWith(`.${ext}`)) || null
  );
}

function BriefArchivos({
  mdRel,
  pdfRel,
  evidencias,
  onPreview,
}: {
  mdRel: string;
  pdfRel: string | null;
  evidencias: TareaDetalle["evidencias_iniciales"];
  onPreview: (archivo: AdjuntoPreview) => void;
}) {
  const items = [mdRel, pdfRel].filter((rel): rel is string => Boolean(rel));
  return (
    <div className="space-y-1.5">
      <div>Ultimo brief adjunto a la tarea</div>
      <div className="flex flex-wrap gap-2">
        {items.map((rel) => {
          const file = briefAdjunto(rel, evidencias);
          if (file && esPdfAdjunto(file)) {
            return (
              <button
                key={rel}
                type="button"
                onClick={() => onPreview({ url: file.url, nombre: file.nombre, tipo: "pdf" })}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 py-1 font-semibold text-foreground hover:bg-muted"
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="max-w-[220px] truncate">{file.nombre}</span>
              </button>
            );
          }
          return file ? (
            <a
              key={rel}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2 py-1 font-semibold text-foreground hover:bg-muted"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="max-w-[220px] truncate">{file.nombre}</span>
            </a>
          ) : (
            <code key={rel}>{rel}</code>
          );
        })}
      </div>
    </div>
  );
}

function vencimiento(fin?: string | null, abierta = true) {
  if (!fin || !abierta) return null;
  const hoy = startOfDayZona(hoyFecha());
  const f = startOfDayZona(String(fin).slice(0, 10));
  const diff = Math.round((f.getTime() - hoy.getTime()) / 86400000);
  if (diff < 0) return { text: `Atrasada ${-diff} dia(s)`, tone: "text-red-600" };
  if (diff === 0) return { text: "Vence hoy", tone: "text-amber-600" };
  if (diff <= 3) return { text: `Vence en ${diff} dia(s)`, tone: "text-amber-600" };
  return { text: `Vence en ${diff} dias`, tone: "text-muted-foreground" };
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function withCapturasQuery(
  baseUrl: string,
  opts: { dias?: number; desde?: string; hasta?: string }
) {
  const u = new URL(baseUrl, "http://local");
  if (opts.desde) u.searchParams.set("capturas_desde", opts.desde);
  if (opts.hasta) u.searchParams.set("capturas_hasta", opts.hasta);
  if (opts.dias != null && !opts.desde) u.searchParams.set("capturas_dias", String(opts.dias));
  return `${u.pathname}${u.search}`;
}

function textoParaCompartir(tarea: Tarea, detalle: TareaDetalle | null) {
  const actual = detalle?.tarea;
  const asignados = detalle?.asignados?.length ? detalle.asignados : tarea.Asignados;
  const lineas = [
    `Tarea #${tarea.Tar_Cod}: ${actual?.Tar_Titulo || tarea.Tar_Titulo}`,
    `Estado: ${actual?.Tar_Estado || tarea.Tar_Estado}`,
    `Prioridad: ${actual?.Tar_Prioridad || tarea.Tar_Prioridad}`,
    `Avance: ${actual?.Ava_Porcentaje ?? tarea.Ava_Porcentaje ?? 0}%`,
    `Asignados: ${asignados?.map((a) => a.Nombre).join(", ") || "Sin asignar"}`,
  ];
  const complejidad = actual?.Tar_Complejidad || tarea.Tar_Complejidad;
  if (complejidad) lineas.push(`Complejidad: ${complejidad}`);
  const inicio = actual?.Tar_Fecha_Inicio || tarea.Tar_Fecha_Inicio;
  const fin = actual?.Tar_Fecha_Fin || tarea.Tar_Fecha_Fin;
  const culminacion = actual?.Tar_Fecha_Culminacion || tarea.Tar_Fecha_Culminacion;
  if (inicio) lineas.push(`Inicio: ${fmtDate(inicio)}`);
  if (fin) {
    const plazo = plazoDesdeFechas(inicio, fin);
    lineas.push(`Fin: ${fmtDate(fin)}${plazo !== "Sin fechas" ? ` (${plazo})` : ""}`);
  }
  if (culminacion) lineas.push(`Culminada: ${fmtDate(culminacion)}`);
  if (actual?.Creador) lineas.push(`Creada por: ${actual.Creador}`);

  const descripcion = plainTextFromHtml(actual?.Tar_Descripcion || tarea.Tar_Descripcion);
  if (descripcion) lineas.push(`\nDescripción:\n${descripcion}`);
  if (actual?.Tar_Modulo) lineas.push(`Módulo: ${actual.Tar_Modulo}`);
  if (actual?.Tar_Proceso) lineas.push(`Proceso: ${actual.Tar_Proceso}`);
  if (actual?.Tar_Directorio) lineas.push(`Directorio: ${actual.Tar_Directorio}`);

  if (detalle?.evidencias_iniciales.length) {
    lineas.push("\nEvidencias iniciales:");
    for (const archivo of detalle.evidencias_iniciales) {
      lineas.push(`- ${archivo.nombre}: ${new URL(archivo.url, window.location.origin).href}`);
    }
  }
  if (detalle?.avances.length) {
    lineas.push("\nAvances:");
    for (const avance of detalle.avances) {
      const encabezado = [`${avance.Ava_Porcentaje}%`, avance.Autor, avance.Ava_Fecha && fmtFechaHoraZona(avance.Ava_Fecha)]
        .filter(Boolean)
        .join(" · ");
      lineas.push(`- ${encabezado}`);
      const realizado = plainTextFromHtml(avance.realizado);
      if (realizado) lineas.push(`  ${realizado}`);
      if (avance.apoyo) lineas.push(`  Ayudó: ${avance.apoyo}`);
      if (avance.siguiente) lineas.push(`  Siguiente: ${avance.siguiente}`);
      if (avance.bloqueos) lineas.push(`  Bloqueos: ${avance.bloqueos}`);
      if (avance.standby) lineas.push(`  Standby: ${avance.standby}`);
      if (avance.standby) lineas.push(`  Sin fecha de fin (en espera de feedback)`);
      if (avance.plazoAnterior) lineas.push(`  Plazo anterior: ${avance.plazoAnterior}`);
      for (const enlace of avance.enlaces) lineas.push(`  Enlace: ${enlace}`);
      for (const archivo of avance.adjuntos) {
        lineas.push(`  Adjunto: ${archivo.nombre} (${new URL(archivo.url, window.location.origin).href})`);
      }
    }
  }
  return lineas.join("\n");
}

export function TareaDetalleDialog({
  tarea,
  detailUrl,
  onClose,
  onRegistrarAvance,
  onSaved,
  editExtraBody,
  reloadKey,
}: Props) {
  const { user, db } = useAuth();
  const isManager = user?.role === "manager";
  const canDesk = user?.role === "manager" || user?.role === "atencion";
  const [data, setData] = useState<(TareaDetalle & { can_view_capturas?: boolean }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("detalle");
  const [capturasDias, setCapturasDias] = useState<(typeof CAPTURA_DIAS)[number] | "rango" | "todo">(7);
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const [preview, setPreview] = useState<AdjuntoPreview | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [alcance, setAlcance] = useState({ modulo: "", proceso: "", directorio: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [compartirEstado, setCompartirEstado] = useState<CompartirEstado>(null);
  const [localReload, setLocalReload] = useState(0);
  const tarCod = tarea?.Tar_Cod ?? null;
  const fetchReloadKey = (reloadKey || 0) + localReload;

  useEffect(() => {
    if (!tarCod) {
      setData(null);
      setTab("detalle");
      return;
    }
    let cancel = false;
    setLoading(true);
    setError("");
    const opts =
      capturasDias === "rango" && rangoDesde
        ? { desde: rangoDesde, hasta: rangoHasta || undefined }
        : capturasDias === "todo"
          ? { dias: 365 }
          : { dias: capturasDias as number };
    fetch(withCapturasQuery(detailUrl(tarCod), opts))
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j.success) throw new Error(j.message || "No se pudo cargar el detalle");
        setData(j as TareaDetalle & { can_view_capturas?: boolean });
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarCod, fetchReloadKey, capturasDias, rangoDesde, rangoHasta]);

  const t = data?.tarea;

  useEffect(() => {
    setAlcance({
      modulo: t?.Tar_Modulo || "",
      proceso: t?.Tar_Proceso || "",
      directorio: t?.Tar_Directorio || "",
    });
  }, [tarea?.Tar_Cod, t?.Tar_Modulo, t?.Tar_Proceso, t?.Tar_Directorio]);
  const pct = t?.Ava_Porcentaje ?? tarea?.Ava_Porcentaje ?? 0;
  const abierta = (t?.Tar_Estado ?? tarea?.Tar_Estado) !== "Finalizada" && pct < 100;
  const venc = vencimiento(t?.Tar_Fecha_Fin ?? tarea?.Tar_Fecha_Fin, abierta);
  const r = data?.resumen;
  const asignados: Array<{
    Per_Cod?: number;
    Tas_Cod: number;
    Nombre: string;
    Fecha_Asignacion?: string | null;
  }> =
    data?.asignados && data.asignados.length > 0
      ? data.asignados
      : tarea?.Asignados && tarea.Asignados.length > 0
        ? tarea.Asignados
        : [];
  const estadoActual = t?.Tar_Estado ?? tarea?.Tar_Estado ?? "";
  // Afiliación ticket ↔ tarea (lista o detalle, mientras carga el detalle).
  const ticketsVinculados = data?.tickets_vinculados?.length
    ? data.tickets_vinculados
    : (tarea?.Tickets_Vinculados || []);
  const canEdit = hasRolePermission(user, "tareas.editar") && (canDesk || (user?.role === "developer" &&
    !!user.usuCod && user.usuCod > 0 &&
    Number(t?.Usu_Creador ?? tarea?.Usu_Creador) === user.usuCod));
  const canDelete = isManager && hasRolePermission(user, "tareas.eliminar");
  const canAvance = hasRolePermission(user, "tareas.avance");
  const asignadoSinPersona =
    (estadoActual === "Asignado" || estadoActual === "En Proceso") && asignados.length === 0;
  const canViewCapturas = isManager || data?.can_view_capturas === true;

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const a of data?.avances ?? []) {
      if (!a.Ava_Fecha) continue;
      items.push({ kind: "avance", key: `ava-${a.Ava_Cod}`, at: a.Ava_Fecha, avance: a });
    }
    for (const as of data?.asignados ?? []) {
      if (!as.Fecha_Asignacion) continue;
      items.push({
        kind: "asignacion",
        key: `asig-${as.Tas_Cod}`,
        at: as.Fecha_Asignacion,
        nombre: as.Nombre,
      });
    }
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return items;
  }, [data]);

  const sesDb = String(editExtraBody?.Ses_Dat_Dis || db || "exa");
  const tituloTarea = t?.Tar_Titulo || tarea?.Tar_Titulo || "esta tarea";

  const textoCompartir = () => {
    if (!tarea) return "";
    const detalleActual = data?.tarea.Tar_Cod === tarea.Tar_Cod ? data : null;
    return textoParaCompartir(tarea, detalleActual);
  };

  const borrarTarea = async () => {
    if (!tarCod || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          Ses_Dat_Dis: sesDb,
          Tar_Cod: tarCod,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudo borrar la tarea");
      setDeleteOpen(false);
      await onSaved?.();
      onClose();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "No se pudo borrar la tarea");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog
      open={!!tarea}
      onOpenChange={(o) => {
        if (!o) {
          setCompartirEstado(null);
          onClose();
          setPreview(null);
        }
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 space-y-3 border-b border-border/60 px-4 pb-4 pt-6 sm:px-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <span className="font-mono text-xs text-muted-foreground">#{tarea?.Tar_Cod}</span>
              <PrioridadBadge prioridad={t?.Tar_Prioridad ?? tarea?.Tar_Prioridad ?? "Media"} />
              {(t?.Tar_Complejidad || tarea?.Tar_Complejidad) && (
                <ComplejidadBadge complejidad={t?.Tar_Complejidad ?? tarea?.Tar_Complejidad} />
              )}
              <EstadoBadge estado={t?.Tar_Estado ?? tarea?.Tar_Estado ?? ""} />
              {venc && <span className={cn("text-xs font-bold", venc.tone)}>{venc.text}</span>}
            </div>
            <DialogTitle className="text-xl leading-snug">{t?.Tar_Titulo ?? tarea?.Tar_Titulo}</DialogTitle>
            <DialogDescription className="sr-only">Detalle de la tarea</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3">
            <Progress value={Math.min(100, pct)} className="h-2.5 flex-1" />
            <span className="text-lg font-bold tabular-nums">{pct}%</span>
          </div>

          {ticketsVinculados.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-900">
                <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wide text-amber-700">
                  <Ticket className="size-3.5" />
                  Ticket de origen
                </span>
                {ticketsVinculados.map((tv) => (
                  <Link
                    key={`${tv.Tic_Db}-${tv.Tic_Cod}`}
                    href={`/tickets?detalle=${tv.Tic_Cod}&db=${encodeURIComponent(tv.Tic_Db || "exa")}`}
                    title={tv.Titulo || `Ticket #${tv.Tic_Cod}`}
                    className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold underline decoration-amber-300 underline-offset-2 hover:text-amber-700"
                  >
                    <span className="shrink-0">#{tv.Tic_Cod}</span>
                    <span className="max-w-[14rem] truncate font-medium">{tv.Titulo || "Sin asunto"}</span>
                    {tv.Estado && (
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 text-[10px] font-bold uppercase",
                          tv.Estado === "Cerrado"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        )}
                      >
                        {tv.Estado}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-amber-800">
                Al registrar 100% de avance en esta tarea, el ticket vinculado se cierra
                automáticamente.
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {error && <Alert variant="destructive" className="mb-4">{error}</Alert>}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className={cn("grid h-auto gap-1 max-sm:flex", canViewCapturas ? "grid-cols-3" : "grid-cols-2")}>
              <TabsTrigger value="detalle" className="gap-1.5 text-xs sm:text-sm">
                <FileText className="size-3.5 shrink-0" />
                Detalle
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5 text-xs sm:text-sm">
                <History className="size-3.5 shrink-0" />
                Timeline
                {timeline.length > 0 && (
                  <span className="rounded bg-muted px-1 text-[10px] tabular-nums">{timeline.length}</span>
                )}
              </TabsTrigger>
              {canViewCapturas && (
                <TabsTrigger value="capturas" className="gap-1.5 text-xs sm:text-sm">
                  <Camera className="size-3.5 shrink-0" />
                  Capturas
                  {(data?.capturas_meta?.total_periodo ?? data?.capturas?.length ?? 0) > 0 && (
                    <span className="rounded bg-muted px-1 text-[10px] tabular-nums">
                      {data?.capturas_meta?.total_periodo ?? data?.capturas?.length ?? 0}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="detalle" className="mt-4 space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="space-y-1.5 rounded-xl border border-border/70 p-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Inicio:</span>
                    <strong>{fmtDate(t?.Tar_Fecha_Inicio ?? tarea?.Tar_Fecha_Inicio)}</strong>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CalendarClock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Fin:</span>
                    <strong>{fmtDate(t?.Tar_Fecha_Fin ?? tarea?.Tar_Fecha_Fin)}</strong>
                    <PlazoBadge
                      inicio={t?.Tar_Fecha_Inicio ?? tarea?.Tar_Fecha_Inicio}
                      fin={t?.Tar_Fecha_Fin ?? tarea?.Tar_Fecha_Fin}
                      estado={t?.Tar_Estado ?? tarea?.Tar_Estado}
                    />
                  </div>
                  {t?.Tar_Fecha_Culminacion && (
                    <div className="flex items-center gap-2">
                      <CalendarClock className="size-4 text-emerald-600" />
                      <span className="text-muted-foreground">Culminada:</span>
                      <strong>{fmtDate(t.Tar_Fecha_Culminacion)}</strong>
                    </div>
                  )}
                  {t?.Creador && (
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Creada por:</span>
                      <strong className="truncate">{t.Creador}</strong>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <UserPlus className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Apoyo:</span>
                    <strong className="truncate">
                      {t?.Apoyo ?? tarea?.Apoyo ?? "Sin apoyo"}
                    </strong>
                  </div>
                </div>
                <div className="rounded-xl border border-border/70 p-3">
                  <div className="mb-1.5 flex items-center gap-2 text-muted-foreground">
                    <Users className="size-4" />
                    Asignados
                  </div>
                  {asignados.length ? (
                    <ul className="space-y-1">
                      {asignados.map((a) => (
                        <li key={a.Tas_Cod || a.Per_Cod} className="flex items-center justify-between gap-2">
                          <strong className="truncate">{a.Nombre}</strong>
                          {a.Fecha_Asignacion && (
                            <span className="text-[11px] text-muted-foreground">{fmtDate(a.Fecha_Asignacion)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : asignadoSinPersona ? (
                    <div className="space-y-1">
                      <span className="text-amber-700">Estado «{estadoActual}» sin persona</span>
                      <p className="text-[11px] text-muted-foreground">
                        {canDesk
                          ? "Usa Editar y elige a quien asignar."
                          : "Aun no hay registro de a quien se asigno."}
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Sin asignar</span>
                  )}
                </div>
              </div>

              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Descripcion
                </h3>
                {loading && !data ? (
                  <div className="h-10 animate-pulse rounded-lg bg-muted" />
                ) : (
                  <div className="rounded-xl bg-muted/40 p-3">
                    <RichTextHtml html={t?.Tar_Descripcion || tarea?.Tar_Descripcion} />
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border/70 p-3 text-sm">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Brief / alcance OFSERCONT
                </h3>
                <OfsercontAlcanceFields
                  db={db}
                  idPrefix={`tarea-${tarea?.Tar_Cod || "n"}`}
                  value={alcance}
                  onChange={setAlcance}
                />
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  {alcance.directorio ? (
                    <div>
                      Directorio: <code>{alcance.directorio}</code>
                    </div>
                  ) : null}
                  {t?.Tar_Brief_Md ? (
                    <BriefArchivos
                      mdRel={t.Tar_Brief_Md}
                      pdfRel={t.Tar_Brief_Pdf}
                      evidencias={data?.evidencias_iniciales || []}
                      onPreview={setPreview}
                    />
                  ) : null}
                </div>
              </section>

              {(data?.evidencias_iniciales?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Evidencias iniciales
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {data!.evidencias_iniciales.map((f) =>
                      f.esImagen ? (
                        <button
                          key={f.ruta}
                          type="button"
                          title={f.nombre}
                          onClick={() => setPreview({ url: f.url, nombre: f.nombre, tipo: "imagen" })}
                          className="overflow-hidden rounded-lg border border-border/70"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.nombre} className="aspect-video w-full object-cover" />
                        </button>
                      ) : esPdfAdjunto(f) ? (
                        <button
                          key={f.ruta}
                          type="button"
                          onClick={() => setPreview({ url: f.url, nombre: f.nombre, tipo: "pdf" })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-left text-[11px] font-semibold hover:bg-muted"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">PDF</span>
                            <span className="line-clamp-1">{f.nombre}</span>
                          </span>
                        </button>
                      ) : (
                        <a
                          key={f.ruta}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          download={!f.esImagen}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-[11px] font-semibold hover:bg-muted"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block text-[9px] uppercase tracking-wide text-muted-foreground">
                              {evidenciaLabel(f.nombre)}
                            </span>
                            <span className="line-clamp-1">{f.nombre}</span>
                          </span>
                        </a>
                      )
                    )}
                  </div>
                </section>
              )}

              {r && (
                <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={History} label="Avances" value={r.total_avances} />
                  <Stat icon={Clock} label="Horas report." value={r.horas_reportadas} />
                  <Stat icon={Paperclip} label="Evidencias" value={r.evidencias} />
                  <Stat
                    icon={TrendingUp}
                    label="Tiempo activo"
                    value={
                      r.minutos_activos >= 60
                        ? `${Math.round((r.minutos_activos / 60) * 10) / 10} h`
                        : `${r.minutos_activos} min`
                    }
                  />
                </section>
              )}
              {r && r.registros_telemetria > 0 && (
                <p className="-mt-1 text-[11px] text-muted-foreground">
                  ExaMonitor: {r.lineas.toLocaleString("es-EC")} lineas est. · {r.teclas.toLocaleString("es-EC")}{" "}
                  teclas · {r.clicks.toLocaleString("es-EC")} clics · {r.capturas} capturas · ultima actividad{" "}
                  {fmtFechaHora(r.ultima_actividad)}
                </p>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {loading && !data && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Cargando...
                </div>
              )}
              {!loading && timeline.length === 0 && (
                <p className="rounded-lg border border-dashed border-border/70 py-10 text-center text-xs text-muted-foreground">
                  Aun no hay avances ni cambios registrados.
                </p>
              )}
              <ol className="relative space-y-3 border-l-2 border-border/70 pl-4">
                {timeline.map((item) =>
                  item.kind === "asignacion" ? (
                    <li key={item.key} className="relative">
                      <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-background bg-violet-500" />
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-violet-800">
                          <UserPlus className="size-3.5" />
                          Asignacion
                        </span>
                        <span className="text-muted-foreground">{fmtFechaHora(item.at)}</span>
                      </div>
                      <p className="mt-1 text-sm">
                        Se asigno a <strong>{item.nombre}</strong>
                      </p>
                    </li>
                  ) : (
                    <li key={item.key} className="relative">
                      <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-background bg-sky-500" />
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <strong className="text-sm tabular-nums">{item.avance.Ava_Porcentaje}%</strong>
                        <span
                          className={cn(
                            "font-bold tabular-nums",
                            item.avance.Ava_Delta > 0
                              ? "text-emerald-600"
                              : item.avance.Ava_Delta < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                          )}
                        >
                          {item.avance.Ava_Delta > 0 ? `+${item.avance.Ava_Delta}` : item.avance.Ava_Delta}
                        </span>
                        <span className="text-muted-foreground">{fmtFechaHora(item.avance.Ava_Fecha)}</span>
                        {item.avance.Autor && (
                          <span className="text-muted-foreground">· {item.avance.Autor}</span>
                        )}
                        {item.avance.apoyo && (
                          <span className="text-muted-foreground">· Ayudó: {item.avance.apoyo}</span>
                        )}
                        {item.avance.horas ? (
                          <span className="text-muted-foreground">· {item.avance.horas} h</span>
                        ) : null}
                      </div>
                      {item.avance.realizado &&
                        (isProbablyHtml(item.avance.realizado) ? (
                          <RichTextHtml html={item.avance.realizado} className="mt-1 text-sm" />
                        ) : (
                          <p className="mt-1 whitespace-pre-wrap text-sm">{item.avance.realizado}</p>
                        ))}
                      {item.avance.siguiente && (
                        <p className="mt-1 flex gap-1.5 text-xs text-sky-800">
                          <ArrowRight className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            <strong>Siguiente:</strong> {item.avance.siguiente}
                          </span>
                        </p>
                      )}
                      {item.avance.bloqueos && (
                        <p className="mt-1 flex gap-1.5 text-xs text-amber-800">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            <strong>Bloqueos:</strong> {item.avance.bloqueos}
                          </span>
                        </p>
                      )}
                      {item.avance.standby && (
                        <p className="mt-1 flex gap-1.5 text-xs text-violet-800">
                          <PauseCircle className="mt-0.5 size-3.5 shrink-0" />
                          <span>
                            <strong>Standby:</strong> {item.avance.standby}
                            {" · sin fecha de fin"}
                            {item.avance.plazoAnterior
                              ? ` (plazo anterior: ${item.avance.plazoAnterior})`
                              : ""}
                          </span>
                        </p>
                      )}
                      {(item.avance.enlaces.length > 0 || item.avance.adjuntos.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.avance.enlaces.map((u) => (
                            <a
                              key={u}
                              href={u}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-[260px] items-center gap-1 rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800 hover:underline"
                            >
                              <Link2 className="size-3 shrink-0" />
                              <span className="truncate">{u.replace(/^https?:\/\//, "")}</span>
                            </a>
                          ))}
                          {item.avance.adjuntos.map((f) =>
                            f.esImagen ? (
                              <button
                                key={f.ruta}
                                type="button"
                                title={f.nombre}
                                onClick={() => setPreview({ url: f.url, nombre: f.nombre, tipo: "imagen" })}
                                className="overflow-hidden rounded-md border border-border/70"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={f.url}
                                  alt={f.nombre}
                                  className="h-16 w-24 object-cover transition hover:opacity-80"
                                />
                              </button>
                            ) : esPdfAdjunto(f) ? (
                              <button
                                key={f.ruta}
                                type="button"
                                onClick={() => setPreview({ url: f.url, nombre: f.nombre, tipo: "pdf" })}
                                className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                              >
                                <FileText className="size-3" />
                                <span>PDF {f.nombre}</span>
                              </button>
                            ) : (
                              <a
                                key={f.ruta}
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                download
                                className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                              >
                                <FileText className="size-3" />
                                <span>
                                  <span className="mr-1 text-[9px] uppercase text-muted-foreground">
                                    {evidenciaLabel(f.nombre)}
                                  </span>
                                  {f.nombre}
                                </span>
                              </a>
                            )
                          )}
                        </div>
                      )}
                    </li>
                  )
                )}
              </ol>
            </TabsContent>

            {canViewCapturas && (
              <TabsContent value="capturas" className="mt-4 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Historial de screenshots vinculados a esta asignacion (ExaMonitor). Sirve para
                  evaluar tiempo activo y si se trabajo en la tarea.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground">Periodo</span>
                  <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
                    {CAPTURA_DIAS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setCapturasDias(d)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                          capturasDias === d
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {d}d
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCapturasDias("todo")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                        capturasDias === "todo"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCapturasDias("rango")}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-bold transition-colors",
                        capturasDias === "rango"
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Rango
                    </button>
                  </div>
                  {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>

                {capturasDias === "rango" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <span className="block text-xs text-muted-foreground">Desde</span>
                      <DatePicker
                        size="sm"
                        className="w-[158px]"
                        value={rangoDesde}
                        max={rangoHasta || undefined}
                        onChange={setRangoDesde}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-xs text-muted-foreground">Hasta</span>
                      <DatePicker
                        size="sm"
                        className="w-[158px]"
                        value={rangoHasta}
                        min={rangoDesde || undefined}
                        onChange={setRangoHasta}
                      />
                    </div>
                  </div>
                )}

                {!loading && (data?.capturas?.length ?? 0) === 0 && (
                  <p className="rounded-lg border border-dashed border-border/70 py-10 text-center text-xs text-muted-foreground">
                    No hay capturas en el periodo seleccionado para esta tarea.
                    {r?.primera_actividad
                      ? ` Actividad registrada desde ${fmtFechaHora(r.primera_actividad)}.`
                      : " El colaborador debe seleccionar esta tarea en ExaMonitor."}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(data?.capturas ?? []).map((c) => (
                    <button
                      key={c.Tel_Cod}
                      type="button"
                      className="group block overflow-hidden rounded-md border border-border/70 text-left transition hover:border-sky-300"
                      onClick={() => setPreview({ url: c.Url, nombre: `Captura ${fmtFechaHora(c.Fecha)}`, tipo: "imagen" })}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={c.Url}
                        alt=""
                        loading="lazy"
                        className="aspect-video w-full object-cover transition group-hover:opacity-90"
                      />
                      <span className="block px-1.5 py-1 text-[10px] text-muted-foreground">
                        {fmtFechaHora(c.Fecha)}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="shrink-0 border-t border-border/60 px-4 py-4 sm:px-6">
          <span
            aria-live="polite"
            className={cn("mb-2 block text-xs text-muted-foreground", !compartirEstado && "sr-only")}
          >
            {compartirEstado === "error" ? "No se pudo copiar o compartir el detalle." : compartirEstado === "copiado" ? "Detalle copiado." : ""}
          </span>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-start">
            {tarea && canDelete && (
              <div className="contents sm:mr-auto sm:flex">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setDeleteError("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="size-4" />
                  Borrar
                </Button>
              </div>
            )}
            <div className="contents sm:ml-auto sm:flex sm:min-w-0 sm:flex-1 sm:flex-wrap sm:justify-end sm:gap-2">
              <ShareMenu title={`Tarea #${tarea?.Tar_Cod ?? ""}: ${tituloTarea}`} getText={textoCompartir} getUrl={() => tareaDetailUrl(window.location.origin, tarea!.Tar_Cod)} onStatus={setCompartirEstado} disabled={!tarea} />
              <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={() => { setCompartirEstado(null); setPreview(null); onClose(); }}>
                Cerrar
              </Button>
              {tarea && isManager && canEdit && (
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setBriefOpen(true)}>
                  <Sparkles className="size-4" />
                  Generar brief
                </Button>
              )}
              {canEdit && tarea && (
                <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  Editar
                </Button>
              )}
              {canAvance && onRegistrarAvance && tarea && abierta && (
                <Button type="button" variant="success" className="col-span-2 w-full sm:w-auto" onClick={() => onRegistrarAvance(tarea)}>
                  Registrar avance
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      <TareaEditDialog
        open={editOpen}
        tarea={tarea}
        detailUrl={detailUrl}
        extraBody={editExtraBody}
        onClose={() => setEditOpen(false)}
        onSaved={async () => {
          setLocalReload((n) => n + 1);
          await onSaved?.();
        }}
      />

      <GenerarBriefDialog
        open={briefOpen && isManager}
        tarea={isManager ? tarea : null}
        detalle={isManager ? t || null : null}
        alcance={alcance}
        onClose={() => setBriefOpen(false)}
        onGenerated={async () => {
          setLocalReload((n) => n + 1);
          await onSaved?.();
        }}
      />

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (deleting) return;
          setDeleteOpen(o);
          if (!o) setDeleteError("");
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Borrar tarea</DialogTitle>
            <DialogDescription>
              La tarea #{tarCod} «{tituloTarea}» dejara de verse en el tablero y se quitara de los asignados.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <Alert variant="destructive">{deleteError}</Alert> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void borrarTarea()}>
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdjuntoPreviewDialog archivo={preview} onClose={() => setPreview(null)} />
    </Dialog>
  );
}
