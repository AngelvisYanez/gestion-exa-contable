"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Keyboard, Loader2, MousePointerClick, RefreshCw, Timer } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { DateRangeFilter, rangoDesdePreset, type DateRangeValue } from "@/components/date-range-filter";
import { PaginationBar, FilterBar, ViewModeToggle, type ListViewMode } from "@/components/list-controls";
import { EstadoBadge, fechaLocal } from "@/components/status-badges";
import { fmtFechaHoraZona } from "@/lib/timezone";
import { useAuth } from "@/contexts/AuthContext";
import type { Dev } from "@/components/dashboard/types";
import { usePagination } from "@/hooks/use-pagination";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HistItem = {
  Tel_Cod: number;
  Tel_Fecha_Hora: string;
  Tel_Hora_Local?: string;
  Tel_Porc_Actividad: number;
  Tel_Ventana_Activa: string | null;
  Tel_Clicks: number;
  Tel_Teclas: number;
  Tel_Lineas_Estimadas: number;
  Tel_Captura_Url: string;
  Tar_Titulo: string | null;
  Tel_Es_IDE: number;
};

function fmtNum(n: number) {
  return new Intl.NumberFormat("es-EC").format(n || 0);
}

function horaLocal(raw?: string | null, local?: string | null) {
  if (local && !local.startsWith("—")) return local;
  return fmtFechaHoraZona(raw, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function horarioLabel(d: Dev) {
  if (!d.Mon_Horario_Activo) return "Sin horario automatico";
  const rango = `${d.Mon_Hora_Inicio || "08:00"}–${d.Mon_Hora_Fin || "17:00"}`;
  if (d.Mon_En_Almuerzo) return `${rango} · Almuerzo`;
  if (d.Mon_En_Horario) return `${rango} · En horario`;
  return `${rango} · Fuera de horario`;
}

function ActMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const color = v >= 70 ? "#059669" : v >= 40 ? "#0284c7" : "#d97706";
  return (
    <div className="flex items-center gap-2" title={`Rendimiento ${v}%`}>
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {v}%
      </span>
    </div>
  );
}

function CapturaThumb({ src, onOpen }: { src: string; onOpen: () => void }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className="flex h-36 items-center justify-center bg-muted text-xs text-muted-foreground">
        Sin captura
      </div>
    );
  }
  return (
    <button type="button" className="block w-full" onClick={onOpen}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="captura"
        className="h-36 w-full object-cover"
        onError={() => setBroken(true)}
      />
    </button>
  );
}

export default function MonitoreoPage() {
  const { db } = useAuth();
  const hoy = fechaLocal();
  const [devs, setDevs] = useState<Dev[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<ListViewMode>("lista");
  const [rango, setRango] = useState<DateRangeValue>({ desde: hoy, hasta: hoy });
  const pager = usePagination(devs, { resetKey: `${rango.desde}|${rango.hasta}` });
  const [histOpen, setHistOpen] = useState(false);
  const [histNombre, setHistNombre] = useState("");
  const [histPer, setHistPer] = useState(0);
  const [histRango, setHistRango] = useState<DateRangeValue>({
    desde: hoy,
    hasta: hoy,
  });
  const [histBounds, setHistBounds] = useState<{ min: string; max: string } | null>(null);
  const [histItems, setHistItems] = useState<HistItem[]>([]);
  const histPager = usePagination(histItems, {
    resetKey: `${histPer}|${histRango.desde}|${histRango.hasta}`,
  });
  const [histHint, setHistHint] = useState("");
  const [histTotal, setHistTotal] = useState(0);
  const [zoom, setZoom] = useState<string | null>(null);

  const loadDevs = useCallback(
    async (override?: DateRangeValue) => {
      const r = override || rango;
      if (!r.desde || !r.hasta) return;
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams({
          Ses_Dat_Dis: db,
          desde: r.desde,
          hasta: r.hasta,
        });
        const res = await fetch(`/api/devs?${qs.toString()}`);
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "Error al cargar monitoreo");
        setDevs(j.desarrolladores || []);
        if (j.rango?.desde && j.rango?.hasta) {
          setRango({ desde: j.rango.desde, hasta: j.rango.hasta });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [db, rango]
  );

  useEffect(() => {
    void loadDevs({ desde: hoy, hasta: hoy });
    // Carga inicial con hoy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const applyRango = (next: DateRangeValue) => {
    setRango(next);
    if (next.desde && next.hasta) void loadDevs(next);
  };

  const patchDev = async (d: Dev, patch: Record<string, number>) => {
    await fetch("/api/devs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Ses_Dat_Dis: db,
        Per_Cod: d.Per_Cod,
        Mon_Activo: d.Mon_Activo,
        Mon_Intervalo_Minutos: d.Mon_Intervalo_Minutos,
        Mon_Captura_Pantalla: d.Mon_Captura_Pantalla,
        ...patch,
      }),
    });
    await loadDevs();
  };

  const totales = useMemo(() => {
    let minutos = 0;
    let clicks = 0;
    let teclas = 0;
    for (const d of devs) {
      minutos += d.Minutos_Activos_Hoy || 0;
      clicks += d.Total_Clicks_Hoy || 0;
      teclas += d.Total_Teclas_Hoy || 0;
    }
    return { minutos, clicks, teclas };
  }, [devs]);

  const esHoy = rango.desde === hoy && rango.hasta === hoy;
  const labelPeriodo = (() => {
    if (esHoy) return "Hoy";
    const ayer = rangoDesdePreset("ayer", { hoy });
    if (rango.desde === ayer.desde && rango.hasta === ayer.hasta) return "Ayer";
    const semana = rangoDesdePreset("semana", { hoy });
    if (rango.desde === semana.desde && rango.hasta === semana.hasta) return "Ultima semana";
    const mes = rangoDesdePreset("mes", { hoy });
    if (rango.desde === mes.desde && rango.hasta === mes.hasta) return "Ultimo mes";
    if (rango.desde === rango.hasta) return rango.desde;
    return `${rango.desde} → ${rango.hasta}`;
  })();

  const applyHistHint = (fechas: Array<{ Fecha: string; Total_Capturas: number }> | undefined) => {
    if (fechas?.length) {
      setHistHint(
        "Dias con datos: " +
          fechas
            .slice(0, 8)
            .map((f) => `${f.Fecha} (${f.Total_Capturas})`)
            .join(" · ")
      );
    } else setHistHint("");
  };

  const cargarHistorial = async (perCod: number, rangoH: DateRangeValue) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        view: "historial",
        Ses_Dat_Dis: db,
        Per_Cod: String(perCod),
        Fecha: rangoH.hasta || fechaLocal(),
        autoFecha: "0",
        desde: rangoH.desde,
        hasta: rangoH.hasta,
      });
      const res = await fetch(`/api/devs?${qs.toString()}`);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error historial");

      const bounds = j.rango_disponible as { min: string; max: string } | undefined;
      if (bounds?.min && bounds?.max) setHistBounds(bounds);

      setHistRango({
        desde: (j.desde as string) || rangoH.desde,
        hasta: (j.hasta as string) || rangoH.hasta,
      });
      setHistItems(j.historial || []);
      setHistTotal(j.total_registros || (j.historial || []).length);
      applyHistHint(j.fechas_disponibles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  /** Abre historial con el rango máximo disponible del desarrollador. */
  const abrirHistorial = async (d: Dev) => {
    setHistPer(d.Per_Cod);
    setHistNombre(d.Nombre);
    setHistOpen(true);
    setHistItems([]);
    setHistHint("");
    setHistTotal(0);
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        view: "historial",
        Ses_Dat_Dis: db,
        Per_Cod: String(d.Per_Cod),
        Fecha: fechaLocal(),
        rangoMaximo: "1",
      });
      const res = await fetch(`/api/devs?${qs.toString()}`);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Error historial");

      const bounds = j.rango_disponible as { min: string; max: string } | undefined;
      if (bounds?.min && bounds?.max) setHistBounds(bounds);

      setHistRango({
        desde: (j.desde as string) || bounds?.min || fechaLocal(),
        hasta: (j.hasta as string) || bounds?.max || fechaLocal(),
      });
      setHistItems(j.historial || []);
      setHistTotal(j.total_registros || (j.historial || []).length);
      applyHistHint(j.fechas_disponibles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const applyHistRango = (next: DateRangeValue) => {
    setHistRango(next);
    if (histPer > 0 && next.desde && next.hasta) {
      void cargarHistorial(histPer, next);
    }
  };

  const resetHistMax = () => {
    if (!histBounds || histPer <= 0) return;
    const next = { desde: histBounds.min, hasta: histBounds.max };
    setHistRango(next);
    void cargarHistorial(histPer, next);
  };

  const online = devs.filter((d) => d.Estado_Conexion === "Online").length;

  return (
    <>
      <Topbar title="Monitoreo" subtitle="ExaMonitor en vivo" />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in space-y-4 px-4 py-6 sm:px-6">
        <FilterBar>
          <Button type="button" variant="secondary" className="h-9" onClick={() => void loadDevs()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Badge variant="success" className="h-9">{online} online</Badge>
          <Badge variant="muted" className="h-9">{devs.length} total</Badge>
          <DateRangeFilter
            value={rango}
            onChange={applyRango}
            disabled={loading}
            compact
            showPresets
          />
        </FilterBar>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Timer className="size-3.5" />
              Minutos activos
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-sky-700">{fmtNum(totales.minutos)}</div>
            <div className="text-[11px] text-muted-foreground">{labelPeriodo}</div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <MousePointerClick className="size-3.5" />
              Clicks
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{fmtNum(totales.clicks)}</div>
            <div className="text-[11px] text-muted-foreground">{labelPeriodo}</div>
          </div>
          <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              <Keyboard className="size-3.5" />
              Teclas
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{fmtNum(totales.teclas)}</div>
            <div className="text-[11px] text-muted-foreground">{labelPeriodo}</div>
          </div>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}

        <Alert variant="info">
          Estado en vivo desde <strong>ExaMonitor.exe</strong>. Las metricas de minutos, clicks y teclas
          corresponden al rango seleccionado. Politicas en{" "}
          <a href="/configuracion/examonitor" className="font-bold underline">
            Config. ExaMonitor
          </a>
          .
        </Alert>

        {viewMode === "grid" ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pager.slice.map((d) => (
                <Card key={d.Per_Cod} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{d.Nombre || "Sin nombre en ficha"}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.Cedula ? `Cédula ${d.Cedula}` : "Sin cédula en ficha"}
                      </div>
                    </div>
                    <EstadoBadge estado={d.Estado_Conexion} />
                  </div>
                  <div className="truncate text-xs font-medium">{d.Ultima_Ventana || "—"}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{d.Ultimo_Proceso || ""}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {d.Ultima_Conexion ? horaLocal(d.Ultima_Conexion) : "Sin conexion"}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-foreground">{horarioLabel(d)}</div>
                  <div className="mt-2">
                    <ActMeter value={d.Promedio_Actividad_Hoy || d.Ultimo_Porcentaje} />
                  </div>
                  {d.Ultima_Captura_Url ? (
                    <div className="mt-2 overflow-hidden rounded-lg border border-border/70">
                      <CapturaThumb
                        key={d.Ultima_Captura_Url}
                        src={d.Ultima_Captura_Url}
                        onOpen={() => setZoom(d.Ultima_Captura_Url)}
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-center">
                      <div className="text-[9px] font-bold uppercase text-muted-foreground">Min</div>
                      <div className="text-sm font-bold tabular-nums text-sky-700">
                        {fmtNum(d.Minutos_Activos_Hoy)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-center">
                      <div className="text-[9px] font-bold uppercase text-muted-foreground">Clicks</div>
                      <div className="text-sm font-bold tabular-nums text-violet-700">
                        {fmtNum(d.Total_Clicks_Hoy)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 px-2 py-1.5 text-center">
                      <div className="text-[9px] font-bold uppercase text-muted-foreground">Teclas</div>
                      <div className="text-sm font-bold tabular-nums text-emerald-700">
                        {fmtNum(d.Total_Teclas_Hoy)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{labelPeriodo}</span>
                    <span>Ahora {d.Ultimo_Porcentaje || 0}%</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Select
                      value={String(d.Mon_Intervalo_Minutos)}
                      onChange={(e) => void patchDev(d, { Mon_Intervalo_Minutos: Number(e.target.value) })}
                      className="h-8 w-[90px] text-xs"
                    >
                      {[1, 2, 5, 10, 15, 30].map((n) => (
                        <option key={n} value={n}>
                          {n} min
                        </option>
                      ))}
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!d.Mon_Activo}
                        onCheckedChange={() => void patchDev(d, { Mon_Activo: d.Mon_Activo ? 0 : 1 })}
                      />
                      <span className="text-xs font-semibold text-muted-foreground">
                        {d.Mon_Activo ? "Activo" : "Pausado"}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => void abrirHistorial(d)}
                  >
                    <History />
                    Historial
                  </Button>
                </Card>
              ))}
            </div>
            {!loading && devs.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sin desarrolladores con monitoreo.
              </p>
            )}
          </>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader className="bg-muted [&_th]:text-muted-foreground">
                <TableRow className="border-border hover:bg-muted">
                  <TableHead>Desarrollador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Ventana</TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      <Timer className="size-3.5" />
                      Minutos
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      <MousePointerClick className="size-3.5" />
                      Clicks
                    </span>
                  </TableHead>
                  <TableHead>
                    <span className="inline-flex items-center gap-1">
                      <Keyboard className="size-3.5" />
                      Teclas
                    </span>
                  </TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.slice.map((d) => (
                  <TableRow key={d.Per_Cod} className="align-top">
                    <TableCell>
                      <div className="font-semibold">{d.Nombre || "Sin nombre en ficha"}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.Cedula ? `Cédula ${d.Cedula}` : "Sin cédula en ficha"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={d.Estado_Conexion} />
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {d.Ultima_Conexion ? horaLocal(d.Ultima_Conexion) : "Sin conexion"}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium">{horarioLabel(d)}</div>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <div className="truncate text-xs font-medium">{d.Ultima_Ventana || "—"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{d.Ultimo_Proceso || ""}</div>
                    </TableCell>
                    <TableCell>
                      <ActMeter value={d.Promedio_Actividad_Hoy || d.Ultimo_Porcentaje} />
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {fmtNum(d.Minutos_Activos_Hoy)} min
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-bold tabular-nums text-violet-700">
                      {fmtNum(d.Total_Clicks_Hoy)}
                    </TableCell>
                    <TableCell className="text-sm font-bold tabular-nums text-emerald-700">
                      {fmtNum(d.Total_Teclas_Hoy)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(d.Mon_Intervalo_Minutos)}
                        onChange={(e) => void patchDev(d, { Mon_Intervalo_Minutos: Number(e.target.value) })}
                        className="h-8 w-[90px] text-xs"
                      >
                        {[1, 2, 5, 10, 15, 30].map((n) => (
                          <option key={n} value={n}>
                            {n} min
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!d.Mon_Activo}
                          onCheckedChange={() => void patchDev(d, { Mon_Activo: d.Mon_Activo ? 0 : 1 })}
                        />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {d.Mon_Activo ? "Activo" : "Pausado"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button type="button" variant="outline" size="sm" onClick={() => void abrirHistorial(d)}>
                        <History />
                        Historial
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && devs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      Sin desarrolladores con monitoreo.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
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

        {loading && (
          <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <Loader2 className="size-3.5 animate-spin" />
            Cargando...
          </div>
        )}

        <Dialog open={histOpen} onOpenChange={setHistOpen}>
          <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Historial: {histNombre}</DialogTitle>
              <DialogDescription>
                Capturas y telemetria · BD {db}
                {histTotal > 0 ? ` · ${histTotal} registros` : ""}
              </DialogDescription>
            </DialogHeader>
            <FilterBar>
              <DateRangeFilter
                value={histRango}
                min={histBounds?.min}
                max={histBounds?.max}
                onChange={applyHistRango}
                onResetMax={resetHistMax}
                compact
                showPresets
              />
            </FilterBar>
            {histHint && <p className="truncate text-xs text-muted-foreground">{histHint}</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {histPager.slice.map((it) => (
                <Card key={it.Tel_Cod} className="overflow-hidden">
                  <CapturaThumb
                    key={it.Tel_Captura_Url || it.Tel_Cod}
                    src={it.Tel_Captura_Url}
                    onOpen={() => setZoom(it.Tel_Captura_Url)}
                  />
                  <CardContent className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2 text-sm font-bold">
                      <span>{horaLocal(it.Tel_Fecha_Hora, it.Tel_Hora_Local)}</span>
                      <ActMeter value={it.Tel_Porc_Actividad} />
                    </div>
                    <div className="truncate text-xs font-semibold">
                      {it.Tel_Ventana_Activa || "Sin ventana"}
                      {it.Tel_Es_IDE ? " · IDE" : ""}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{it.Tar_Titulo || "Tarea general"}</div>
                    <div className="flex gap-3 pt-1 text-[10px] text-muted-foreground">
                      <span>{fmtNum(it.Tel_Clicks)} clk</span>
                      <span>{fmtNum(it.Tel_Teclas)} tec</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!loading && histItems.length === 0 && (
                <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
                  Sin registros en el rango seleccionado
                </p>
              )}
            </div>
            <PaginationBar
              page={histPager.page}
              totalPages={histPager.totalPages}
              total={histPager.total}
              from={histPager.from}
              to={histPager.to}
              pageSize={histPager.pageSize}
              onPageChange={histPager.setPage}
              onPageSizeChange={histPager.setPageSize}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
          <DialogContent className="max-w-5xl border-0 bg-transparent p-0 shadow-none">
            <DialogTitle className="sr-only">Captura ampliada</DialogTitle>
            {zoom ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={zoom} alt="zoom" className="max-h-[90dvh] w-full rounded-lg object-contain" />
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}
