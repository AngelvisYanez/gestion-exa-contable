"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, Pencil, RefreshCw, Settings2 } from "lucide-react";
import { CustomizeWidgetsDialog } from "@/components/dashboard/customize-dialog";
import { useDashboardPrefs } from "@/components/dashboard/dashboard-grid";
import type { Tarea } from "@/components/dashboard/types";
import {
  ActividadWidget,
  ChartEstadoWidget,
  ColaPersonalWidget,
  DevAccesosWidget,
  DevKpisExtraWidget,
  DevKpisWidget,
  MisAtrasadasWidget,
} from "@/components/dashboard/metric-widgets";
import { MetricasPanel } from "@/components/tareas/metricas-panel";
import { TareaDetalleDialog } from "@/components/tareas/tarea-detalle-dialog";
import { AvanceDialog } from "@/components/tareas/avance-dialog";
import { ReporteDialog } from "@/components/tareas/reporte-dialog";
import { useNotifications } from "@/contexts/NotificationsContext";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calcularMetricas,
  tareaAbierta,
  type Actividad,
} from "@/lib/metricas-avance";
import { hoyFecha } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const DashboardGrid = dynamic(
  () => import("@/components/dashboard/dashboard-grid").then((m) => m.DashboardGrid),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Cargando dashboard...
      </div>
    ),
  }
);

type Kpis = {
  total: number;
  completadas: number;
  proceso: number;
  pendientes: number;
  atrasadas: number;
  avance_promedio: number;
  tasa_cumplimiento?: number;
  tareas?: number;
  tickets?: number;
};

function esTicket(t: Tarea) {
  return t.tipo === "ticket";
}

function esAtrasada(t: Tarea) {
  const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
  return tareaAbierta(t) && !!fin && fin < hoyFecha();
}

export function DevDashboard({ userName }: { userName?: string }) {
  const { lastTaskEventAt } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [items, setItems] = useState<Tarea[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [periodo, setPeriodo] = useState<7 | 30>(7);
  const [detalleCod, setDetalleCod] = useState<number | null>(null);
  const [avanceCod, setAvanceCod] = useState<number | null>(null);
  const [detalleReload, setDetalleReload] = useState(0);
  const [reporteOpen, setReporteOpen] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { prefs, setPrefs, ready } = useDashboardPrefs("developer");

  const soloTareas = useMemo(() => items.filter((t) => !esTicket(t)), [items]);
  const tickets = useMemo(() => items.filter(esTicket), [items]);
  const detalleTarea = soloTareas.find((t) => t.Tar_Cod === detalleCod) ?? null;
  const avanceTarea = soloTareas.find((t) => t.Tar_Cod === avanceCod) ?? null;
  const atrasadasList = useMemo(() => items.filter(esAtrasada), [items]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mis-tareas?project=exa&dias=30`);
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudieron cargar tus metricas");
      setItems(j.tareas || []);
      setKpis(j.kpis || null);
      setActividad(j.actividad || null);
      setWarning(j.warning || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lastTaskEventAt) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [lastTaskEventAt, load]);

  const metricas = useMemo(
    () => calcularMetricas(soloTareas, actividad, periodo),
    [soloTareas, actividad, periodo]
  );

  const porEstado = useMemo(() => {
    const counts = {
      Pendiente: 0,
      Asignado: 0,
      "En Proceso": 0,
      Finalizada: 0,
    };
    for (const t of items) {
      const e = t.Tar_Estado || "Pendiente";
      if (e === "Finalizada" || (t.Ava_Porcentaje || 0) >= 100) counts.Finalizada++;
      else if (e === "En Proceso") counts["En Proceso"]++;
      else if (e === "Asignado") counts.Asignado++;
      else counts.Pendiente++;
    }
    return [
      { label: "Pendiente", value: counts.Pendiente, color: "#94a3b8" },
      { label: "Asignado", value: counts.Asignado, color: "#8b5cf6" },
      { label: "En Proceso", value: counts["En Proceso"], color: "#0ea5e9" },
      { label: "Finalizada", value: counts.Finalizada, color: "#10b981" },
    ].filter((s) => s.value > 0);
  }, [items]);

  const porTipo = useMemo(
    () =>
      [
        { label: "Tareas", value: soloTareas.length, color: "#0284c7" },
        { label: "Tickets", value: tickets.length, color: "#d97706" },
      ].filter((s) => s.value > 0),
    [soloTareas.length, tickets.length]
  );

  const abiertas = items.filter(tareaAbierta).length;
  const atrasadas = items.filter(esAtrasada).length;
  const ticketsAbiertos = tickets.filter(tareaAbierta).length;

  const cumplimiento =
    kpis?.tasa_cumplimiento != null
      ? `${kpis.tasa_cumplimiento}%`
      : kpis?.total
        ? `${Math.round(((kpis.completadas || 0) / kpis.total) * 1000) / 10}%`
        : "—";

  const renderWidget = (id: string) => {
    switch (id) {
      case "kpis":
        return (
          <DevKpisWidget
            total={kpis?.total ?? items.length}
            tareas={kpis?.tareas ?? soloTareas.length}
            tickets={kpis?.tickets ?? tickets.length}
            ticketsAbiertos={ticketsAbiertos}
            completadas={kpis?.completadas ?? 0}
            proceso={kpis?.proceso ?? 0}
            atrasadas={kpis?.atrasadas ?? atrasadas}
            abiertas={abiertas}
          />
        );
      case "kpis-extra":
        return (
          <DevKpisExtraWidget
            avance={kpis ? `${kpis.avance_promedio}%` : "—"}
            cumplimiento={cumplimiento}
            avancesPeriodo={metricas.avances}
            tareasTocadas={metricas.tareasTocadas}
            horasActivas={metricas.horasActivas}
            horasReportadas={metricas.horasReportadas}
            periodo={periodo}
          />
        );
      case "chart-estado":
        return <ChartEstadoWidget slices={porEstado} total={items.length} centerLabel="items" />;
      case "chart-tipo":
        return <ChartEstadoWidget slices={porTipo} total={items.length} centerLabel="total" />;
      case "cola-personal":
        return (
          <ColaPersonalWidget
            abiertas={abiertas}
            ticketsAbiertos={ticketsAbiertos}
            atrasadas={atrasadas}
          />
        );
      case "metricas":
        return <MetricasPanel m={metricas} compact onOpenTarea={(t) => setDetalleCod(t.Tar_Cod)} />;
      case "atrasadas":
        return (
          <MisAtrasadasWidget
            tareas={atrasadasList}
            onOpen={(t) => {
              if (!esTicket(t)) setDetalleCod(t.Tar_Cod);
            }}
          />
        );
      case "actividad":
        return <ActividadWidget />;
      case "accesos":
        return <DevAccesosWidget onReporte={() => setReporteOpen(true)} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-brand-gray-900">Tu resumen</h1>
          <p className="text-sm text-muted-foreground">
            Widgets personalizables · KPIs y metricas de tus asignaciones
          </p>
        </div>
        <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto">
          <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriodo(d)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-bold transition-colors",
                  periodo === d
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Ultimos {d} dias
              </button>
            ))}
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
          <Button
            type="button"
            variant={editMode ? "default" : "outline"}
            onClick={() => setEditMode((v) => !v)}
          >
            <Pencil />
            {editMode ? "Terminar" : "Editar layout"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setCustomizeOpen(true)}>
            <Settings2 />
            Personalizar
          </Button>
        </div>
      </div>

      {editMode && (
        <div className="mb-3">
          <Badge variant="info" className="gap-1">
            <LayoutGrid className="size-3" />
            Arrastra por el encabezado · redimensiona desde la esquina
          </Badge>
        </div>
      )}

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

      {ready && (
        <DashboardGrid
          role="developer"
          editMode={editMode}
          prefs={prefs}
          onPrefsChange={setPrefs}
          renderWidget={renderWidget}
        />
      )}

      <CustomizeWidgetsDialog
        role="developer"
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        prefs={prefs}
        onPrefsChange={setPrefs}
      />

      {loading && (
        <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          <Loader2 className="size-3.5 animate-spin" />
          Cargando metricas...
        </div>
      )}

      <TareaDetalleDialog
        tarea={detalleTarea}
        detailUrl={(cod) => `/api/mis-tareas?project=exa&detalle=${cod}`}
        onClose={() => setDetalleCod(null)}
        onRegistrarAvance={(t) => setAvanceCod(t.Tar_Cod)}
        editExtraBody={{ Ses_Dat_Dis: "exa" }}
        onSaved={async () => {
          await load();
          setDetalleReload((n) => n + 1);
        }}
        reloadKey={detalleReload}
      />
      <AvanceDialog
        tarea={avanceTarea}
        endpoint="/api/mis-tareas"
        extraBody={{ project: "exa" }}
        onClose={() => setAvanceCod(null)}
        onSaved={async () => {
          await load();
          setDetalleReload((n) => n + 1);
        }}
      />
      <ReporteDialog
        open={reporteOpen}
        onClose={() => setReporteOpen(false)}
        usuario={userName || "Colaborador"}
        tareas={soloTareas}
        actividad={actividad}
        periodo={periodo}
      />
    </>
  );
}
