"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  Camera,
  FileText,
  History,
  Loader2,
  Phone,
  Ticket,
  User,
  Wrench,
} from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { EstadoBadge, PrioridadBadge, fmtDate } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { RichTextHtml } from "@/components/ui/rich-text";
import { useAuth } from "@/contexts/AuthContext";
import { fmtFechaHoraZona } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { evidenciaLabel } from "@/lib/evidencia-files";

type AvanceTicket = {
  Ava_Cod: number;
  Ava_Porcentaje: number;
  Ava_Fecha: string | null;
  Autor: string | null;
  realizado: string;
  adjuntos: Array<{ ruta: string; url: string; nombre: string; esImagen: boolean }>;
};

type Props = {
  ticket: Tarea | null;
  onClose: () => void;
  onRegistrarAvance?: (t: Tarea) => void;
};

const CAPTURA_DIAS = [1, 3, 7, 15, 30, 90] as const;

type CapItem = { Tel_Cod: number; Per_Cod: number; Fecha: string; Url: string };

export function TicketDetalleDialog({ ticket, onClose, onRegistrarAvance }: Props) {
  const { db, user } = useAuth();
  const isManager = user?.role === "manager";
  const open = !!ticket && ticket.tipo === "ticket";
  const cerrado = ticket?.Tar_Estado === "Finalizada";
  const ticCod = ticket?.Tic_Cod ?? ticket?.Tar_Cod ?? 0;
  const [tab, setTab] = useState("detalle");
  const [capturasDias, setCapturasDias] = useState<(typeof CAPTURA_DIAS)[number] | "rango" | "todo">(
    30
  );
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const [capturas, setCapturas] = useState<CapItem[]>([]);
  const [resumen, setResumen] = useState<{
    minutos_activos: number;
    capturas: number;
    primera_actividad: string | null;
    ultima_actividad: string | null;
  } | null>(null);
  const [loadingCap, setLoadingCap] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [avances, setAvances] = useState<AvanceTicket[]>([]);

  const timeline = useMemo(() => {
    if (!ticket) return [];
    const items: Array<{ key: string; label: string; detail: string; at?: string | null }> = [];
    if (ticket.Tar_Fecha_Inicio) {
      items.push({
        key: "llegada",
        label: "Llegada",
        detail: "Ticket registrado en el sistema",
        at: ticket.Tar_Fecha_Inicio,
      });
    }
    if (ticket.Asignados?.length) {
      items.push({
        key: "asignacion",
        label: "Asignacion",
        detail: `Asignado a ${ticket.Asignados.map((a) => a.Nombre).join(", ")}`,
        at: ticket.Fecha_Asignacion || ticket.Ava_Ultima_Fecha || ticket.Tar_Fecha_Inicio,
      });
    }
    if (ticket.Tar_Estado === "En Proceso") {
      items.push({
        key: "proceso",
        label: "En proceso",
        detail: "El ticket esta en atencion",
        at: ticket.Ava_Ultima_Fecha,
      });
    }
    if (cerrado && ticket.Tar_Fecha_Culminacion) {
      items.push({
        key: "cierre",
        label: "Resuelto",
        detail: "Ticket marcado como finalizado",
        at: ticket.Tar_Fecha_Culminacion,
      });
    }
    return items;
  }, [ticket, cerrado]);

  useEffect(() => {
    if (!open || !ticCod) return;
    let cancel = false;
    const sp = new URLSearchParams({
      historial: String(ticCod),
      Ses_Dat_Dis: db,
    });
    if (ticket?.Db_Origen) sp.set("Db_Origen", ticket.Db_Origen);
    fetch(`/api/tickets?${sp}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancel && j.success) setAvances(j.avances || []);
      })
      .catch(() => {
        if (!cancel) setAvances([]);
      });
    return () => {
      cancel = true;
    };
  }, [open, ticCod, db, ticket?.Db_Origen]);

  useEffect(() => {
    if (!open || !isManager || !ticCod || tab !== "capturas") return;
    let cancel = false;
    setLoadingCap(true);
    const sp = new URLSearchParams({
      Ses_Dat_Dis: db,
      detalle: String(ticCod),
    });
    if (capturasDias === "rango" && rangoDesde) {
      sp.set("capturas_desde", rangoDesde);
      if (rangoHasta) sp.set("capturas_hasta", rangoHasta);
    } else if (capturasDias === "todo") {
      sp.set("capturas_dias", "365");
    } else {
      sp.set("capturas_dias", String(capturasDias));
    }
    fetch(`/api/tickets?${sp}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        if (!j.success) throw new Error(j.message || "Error");
        setCapturas(j.capturas || []);
        setResumen(j.resumen || null);
      })
      .catch(() => {
        if (!cancel) {
          setCapturas([]);
          setResumen(null);
        }
      })
      .finally(() => !cancel && setLoadingCap(false));
    return () => {
      cancel = true;
    };
  }, [open, isManager, ticCod, tab, capturasDias, rangoDesde, rangoHasta, db]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setTab("detalle");
          setZoom(null);
        }
      }}
    >
      <DialogContent className="flex max-h-[92dvh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <div className="shrink-0 space-y-2 border-b border-border/60 px-6 pb-4 pt-6">
          <DialogHeader className="space-y-2 text-left">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                <Ticket className="size-3" />
                Ticket
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                #{ticket?.Tic_Cod ?? ticket?.Tar_Cod}
              </span>
              <PrioridadBadge prioridad={ticket?.Tar_Prioridad ?? "Media"} />
              <EstadoBadge estado={ticket?.Tar_Estado ?? ""} />
            </div>
            <DialogTitle className="text-xl leading-snug">{ticket?.Tar_Titulo}</DialogTitle>
            <DialogDescription className="sr-only">Detalle del ticket</DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList
              className={cn(
                "grid h-auto gap-1",
                isManager ? "grid-cols-3" : "grid-cols-2"
              )}
            >
              <TabsTrigger value="detalle" className="gap-1.5 text-xs sm:text-sm">
                <FileText className="size-3.5 shrink-0" />
                Detalle
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5 text-xs sm:text-sm">
                <History className="size-3.5 shrink-0" />
                Timeline
              </TabsTrigger>
              {isManager && (
                <TabsTrigger value="capturas" className="gap-1.5 text-xs sm:text-sm">
                  <Camera className="size-3.5 shrink-0" />
                  Capturas
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="detalle" className="mt-4 space-y-4">
              <div className="space-y-2 rounded-xl border border-border/70 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Llegada:</span>
                  <strong>{fmtDate(ticket?.Tar_Fecha_Inicio)}</strong>
                </div>
                {ticket?.Fecha_Asignacion && (
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-sky-700" />
                    <span className="text-muted-foreground">Asignado el:</span>
                    <strong>{fmtFechaHoraZona(ticket.Fecha_Asignacion)}</strong>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Avance:</span>
                  <strong className="tabular-nums">{ticket?.Ava_Porcentaje || 0}%</strong>
                </div>
                {ticket?.Tar_Fecha_Culminacion && (
                  <div className="flex items-center gap-2">
                    <CalendarClock className="size-4 text-emerald-600" />
                    <span className="text-muted-foreground">Cierre:</span>
                    <strong>{fmtDate(ticket.Tar_Fecha_Culminacion)}</strong>
                  </div>
                )}
                {ticket?.Asignados?.length ? (
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Asignado:</span>
                    <strong className="truncate">
                      {ticket.Asignados.map((a) => a.Nombre).join(", ")}
                    </strong>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="size-4" />
                    Sin asignar
                  </div>
                )}
                {ticket?.Enviado_Por && (
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Enviado por:</span>
                    <strong className="truncate">{ticket.Enviado_Por}</strong>
                  </div>
                )}
                {ticket?.Creador_Nombre && ticket.Creador_Nombre !== ticket.Enviado_Por && (
                  <div className="flex items-center gap-2">
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Creado por:</span>
                    <strong className="truncate">{ticket.Creador_Nombre}</strong>
                  </div>
                )}
                {ticket?.Emp_Nom && (
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Empresa:</span>
                    <strong className="truncate">{ticket.Emp_Nom}</strong>
                  </div>
                )}
                {ticket?.Tic_Tel && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Telefono:</span>
                    <strong>{ticket.Tic_Tel}</strong>
                  </div>
                )}
                {ticket?.Proceso && (
                  <div className="flex items-center gap-2">
                    <Wrench className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Proceso:</span>
                    <strong>{ticket.Proceso}</strong>
                  </div>
                )}
              </div>

              <section>
                <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Descripcion
                </h3>
                <div className="rounded-xl bg-muted/40 p-3">
                  <RichTextHtml html={ticket?.Tar_Descripcion} />
                </div>
              </section>

              {avances.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Avances
                  </h3>
                  {avances.map((a) => (
                    <article key={a.Ava_Cod} className="rounded-xl border border-border/70 p-3">
                      <div className="flex flex-wrap items-baseline gap-2 text-xs">
                        <strong className="tabular-nums">{a.Ava_Porcentaje}%</strong>
                        <span className="font-semibold">{a.Autor || "Sin nombre"}</span>
                        {a.Ava_Fecha && (
                          <span className="text-muted-foreground">{fmtFechaHoraZona(a.Ava_Fecha)}</span>
                        )}
                      </div>
                      {a.realizado && (
                        <div className="mt-2">
                          <RichTextHtml html={a.realizado} />
                        </div>
                      )}
                      {a.adjuntos.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {a.adjuntos.map((f) =>
                            f.esImagen ? (
                              <a key={f.ruta} href={f.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.url} alt={f.nombre} className="aspect-video w-full object-cover" />
                              </a>
                            ) : (
                              <a
                                key={f.ruta}
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg border px-2 py-2 text-[11px]"
                              >
                                <FileText className="size-4 shrink-0" />
                                <span className="line-clamp-2">{f.nombre}</span>
                              </a>
                            )
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}

              {(ticket?.Evidencias?.length ?? 0) > 0 && (
                <section>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Evidencias
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {ticket!.Evidencias!.map((f) =>
                      f.esImagen ? (
                        <a
                          key={f.ruta}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-lg border border-border/70"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.nombre} className="aspect-square w-full object-cover" />
                        </a>
                      ) : (
                        <a
                          key={f.ruta}
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-border/70 bg-muted/40 p-2 text-center text-[11px] font-medium hover:bg-muted"
                        >
                          <FileText className="size-5 text-muted-foreground" />
                          <span className="text-[9px] font-bold uppercase text-muted-foreground">
                            {evidenciaLabel(f.nombre)}
                          </span>
                          <span className="line-clamp-2">{f.nombre}</span>
                        </a>
                      )
                    )}
                  </div>
                </section>
              )}

              {ticket?.Tic_Obs && ticket.Tic_Obs !== "N/A" && ticket.Tic_Obs !== ticket.Proceso && (
                <section>
                  <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Observaciones
                  </h3>
                  <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm leading-relaxed">
                    {ticket.Tic_Obs}
                  </p>
                </section>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {timeline.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/70 py-10 text-center text-xs text-muted-foreground">
                  Sin eventos registrados.
                </p>
              ) : (
                <ol className="relative space-y-3 border-l-2 border-border/70 pl-4">
                  {timeline.map((ev) => (
                    <li key={ev.key} className="relative">
                      <span className="absolute -left-[23px] top-1 size-3 rounded-full border-2 border-background bg-amber-500" />
                      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                        <strong>{ev.label}</strong>
                        {ev.at && <span className="text-muted-foreground">{fmtDate(ev.at)}</span>}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{ev.detail}</p>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            {isManager && (
              <TabsContent value="capturas" className="mt-4 space-y-3">
                <p className="text-[11px] text-muted-foreground">
                  Screenshots ligados a este ticket (ExaMonitor). Usa el rango para verificar si se
                  trabajo en la asignacion.
                </p>
                {resumen && (
                  <p className="text-[11px] text-muted-foreground">
                    Tiempo activo: <strong>{resumen.minutos_activos} min</strong> ·{" "}
                    {resumen.capturas} capturas totales
                    {resumen.primera_actividad
                      ? ` · desde ${fmtFechaHoraZona(resumen.primera_actividad)}`
                      : ""}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex flex-wrap rounded-lg border border-border bg-muted/40 p-0.5">
                    {CAPTURA_DIAS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setCapturasDias(d)}
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-bold",
                          capturasDias === d
                            ? "bg-background shadow-sm"
                            : "text-muted-foreground"
                        )}
                      >
                        {d}d
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCapturasDias("todo")}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-bold",
                        capturasDias === "todo"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground"
                      )}
                    >
                      Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setCapturasDias("rango")}
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-bold",
                        capturasDias === "rango"
                          ? "bg-background shadow-sm"
                          : "text-muted-foreground"
                      )}
                    >
                      Rango
                    </button>
                  </div>
                  {loadingCap && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                </div>
                {capturasDias === "rango" && (
                  <div className="flex flex-wrap gap-2">
                    <DatePicker
                      size="sm"
                      className="w-[158px]"
                      value={rangoDesde}
                      max={rangoHasta || undefined}
                      onChange={setRangoDesde}
                    />
                    <DatePicker
                      size="sm"
                      className="w-[158px]"
                      value={rangoHasta}
                      min={rangoDesde || undefined}
                      onChange={setRangoHasta}
                    />
                  </div>
                )}
                {!loadingCap && capturas.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border/70 py-8 text-center text-xs text-muted-foreground">
                    Sin capturas en el periodo. El asignado debe seleccionar este ticket en
                    ExaMonitor.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {capturas.map((c) => (
                    <button
                      key={c.Tel_Cod}
                      type="button"
                      className="overflow-hidden rounded-md border border-border/70 text-left"
                      onClick={() => setZoom(c.Url)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.Url} alt="" className="aspect-video w-full object-cover" />
                      <span className="block px-1.5 py-1 text-[10px] text-muted-foreground">
                        {fmtFechaHoraZona(c.Fecha)}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/60 px-6 py-4 sm:gap-0">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          {ticket && onRegistrarAvance && !cerrado && (
            <Button type="button" variant="success" onClick={() => onRegistrarAvance(ticket)}>
              Registrar avance
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[94dvh] max-w-5xl overflow-auto p-2 sm:p-4">
          <DialogTitle className="sr-only">Captura ampliada</DialogTitle>
          {zoom && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={zoom} alt="captura" className="max-h-[80dvh] w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
