"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, LayoutGrid, Loader2, Pencil, RefreshCw, Settings2, Ticket } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { CustomizeWidgetsDialog } from "@/components/dashboard/customize-dialog";
import { useDashboardPrefs } from "@/components/dashboard/dashboard-grid";
import {
  ActividadWidget,
  AvancePersonaWidget,
  CargaAsignadoWidget,
  CumplimientoWidget,
  EquipoColaWidget,
  ManagerAccesosWidget,
  ManagerKpisWidget,
  OverallWidget,
} from "@/components/dashboard/metric-widgets";
import {
  ApexEstadoWidget,
  RendimientoBarrasWidget,
  RendimientoOndaWidget,
  RendimientoRadarWidget,
} from "@/components/dashboard/apex-widgets";
import { DateRangeFilter, diaDesdePreset, type DateRangeValue } from "@/components/date-range-filter";
import { hoyFecha } from "@/lib/timezone";
import { DeveloperFilter } from "@/components/developer-filter";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DevDashboard } from "@/components/dashboard/dev-dashboard";
import type { TeamDayPoint } from "@/lib/dashboard";

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

type Metrics = {
  kpis: {
    total: number;
    completadas: number;
    proceso: number;
    pendientes: number;
    atrasadas: number;
    avance_promedio: number;
    tasa_cumplimiento: number;
  };
  porEstado: Array<{ label: string; value: number; color: string }>;
  porPrioridad: Array<{ label: string; value: number; color: string }>;
  porAsignado: Array<{
    Per_Cod: number;
    Nombre: string;
    total: number;
    completadas: number;
    proceso: number;
    pendientes: number;
    avance_promedio: number;
    cumplimiento: number;
  }>;
  serieEquipo: TeamDayPoint[];
  desarrolladores: Array<{ Per_Cod: number; Nombre: string }>;
  filtro: { perCod: number | null };
  sinAsignar: number;
  online: number;
  ausente: number;
  offline: number;
  ticketsNuevos: number;
  rango: { desde: string; hasta: string; min: string; max: string };
};

export default function HomePage() {
  const { db, user, loading: authLoading } = useAuth();
  const { lastTaskEventAt } = useNotifications();
  const empCod = 96;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [m, setM] = useState<Metrics | null>(null);
  const [rango, setRango] = useState<DateRangeValue>(() => diaDesdePreset("hoy"));
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);
  const [perCod, setPerCod] = useState<number | null>(null);
  const [devs, setDevs] = useState<Array<{ Per_Cod: number; Nombre: string }>>([]);
  const initialized = useRef(false);

  const [editMode, setEditMode] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const { prefs, setPrefs, ready } = useDashboardPrefs("manager");

  const isDev = user?.role === "developer";
  const isAtencion = user?.role === "atencion";

  const load = useCallback(
    async (override?: { rango?: DateRangeValue; perCod?: number | null }) => {
      if (isDev || isAtencion || authLoading || !user) return;
      setLoading(true);
      setError("");
      try {
        const hoy = hoyFecha();
        const desde = override?.rango?.desde || rango.desde || hoy;
        const hasta = override?.rango?.hasta || rango.hasta || hoy;
        const filtroPer = override?.perCod !== undefined ? override.perCod : perCod;
        const qs = new URLSearchParams({
          Ses_Dat_Dis: db,
          Emp_Cod: String(empCod),
        });
        if (desde) qs.set("desde", desde);
        if (hasta) qs.set("hasta", hasta);
        if (filtroPer && filtroPer > 0) qs.set("Per_Cod", String(filtroPer));
        const res = await fetch(`/api/dashboard?${qs.toString()}`);
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "Error al cargar metricas");
        setM(j as Metrics);
        if (Array.isArray(j.desarrolladores)) setDevs(j.desarrolladores);
        if (j.rango) {
          setBounds({ min: j.rango.min, max: j.rango.max });
          if (!initialized.current) {
            // Mantener filtro por dia (hoy) al iniciar; no abrir todo el historial
            const inicial = override?.rango || diaDesdePreset("hoy", {
              min: j.rango.min,
              max: j.rango.max,
            });
            setRango(inicial);
            initialized.current = true;
          } else if (override?.rango) {
            setRango(override.rango);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [db, empCod, rango.desde, rango.hasta, perCod, isDev, authLoading, user]
  );

  useEffect(() => {
    if (authLoading || isDev || !user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, empCod, isDev, authLoading, user]);

  useEffect(() => {
    if (isDev || isAtencion || authLoading || !lastTaskEventAt) return;
    const t = setTimeout(() => void load(), 500);
    return () => clearTimeout(t);
  }, [lastTaskEventAt, load, isDev, isAtencion, authLoading]);

  if (authLoading) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Cargando..." />
        <main className="mx-auto flex w-full min-w-0 max-w-[1400px] items-center justify-center px-4 py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </main>
      </>
    );
  }

  if (isDev) {
    return (
      <>
        <Topbar title="Dashboard" subtitle={user?.name || "Tu resumen personal"} />
        <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-3 py-4 sm:px-6 sm:py-6">
          <DevDashboard userName={user?.name} />
        </main>
      </>
    );
  }

  if (isAtencion) {
    return (
      <>
        <Topbar title="Atencion al cliente" subtitle={user?.name || "Asignacion"} />
        <main className="mx-auto w-full min-w-0 max-w-3xl animate-fade-in space-y-4 px-4 py-6 sm:px-6">
          <p className="text-sm text-brand-gray-600">
            Puedes crear y asignar tareas y tickets. El monitoreo, las capturas y la configuracion
            quedan reservados al encargado.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/tareas"
              className="rounded-xl border border-brand-gray-200 bg-white p-4 transition hover:border-brand-red/40"
            >
              <ClipboardList className="mb-2 size-5 text-brand-red" />
              <p className="font-bold text-brand-gray-900">Tareas</p>
              <p className="text-xs text-brand-gray-500">Crear y asignar al equipo</p>
            </Link>
            <Link
              href="/tickets"
              className="rounded-xl border border-brand-gray-200 bg-white p-4 transition hover:border-brand-red/40"
            >
              <Ticket className="mb-2 size-5 text-brand-red" />
              <p className="font-bold text-brand-gray-900">Tickets</p>
              <p className="text-xs text-brand-gray-500">Bandeja y asignacion</p>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const applyRango = (next: DateRangeValue) => {
    setRango(next);
    if (next.desde && next.hasta) void load({ rango: next });
  };

  const applyDev = (next: number | null) => {
    setPerCod(next);
    void load({ perCod: next });
  };

  const resetMax = () => {
    if (!bounds) return;
    const next = { desde: bounds.min, hasta: bounds.max };
    setRango(next);
    void load({ rango: next });
  };

  const k = m?.kpis;
  const selectedDev = perCod ? devs.find((d) => d.Per_Cod === perCod) : null;

  const renderWidget = (id: string) => {
    switch (id) {
      case "kpis":
        return <ManagerKpisWidget kpis={k || null} />;
      case "overall":
        return <OverallWidget kpis={k || null} />;
      case "cumplimiento":
        return <CumplimientoWidget kpis={k || null} />;
      case "equipo-cola":
        return (
          <EquipoColaWidget
            online={m?.online ?? 0}
            ausente={m?.ausente ?? 0}
            offline={m?.offline ?? 0}
            sinAsignar={m?.sinAsignar ?? 0}
            ticketsNuevos={m?.ticketsNuevos ?? 0}
          />
        );
      case "accesos":
        return <ManagerAccesosWidget ticketsNuevos={m?.ticketsNuevos ?? 0} />;
      case "chart-estado":
        return (
          <ApexEstadoWidget
            slices={m?.porEstado || []}
            centerLabel="tareas"
          />
        );
      case "chart-prioridad":
        return (
          <ApexEstadoWidget
            slices={m?.porPrioridad || []}
            centerLabel="prio"
          />
        );
      case "actividad":
        return <ActividadWidget />;
      case "rendimiento-onda":
        return <RendimientoOndaWidget serie={m?.serieEquipo || []} />;
      case "rendimiento-barras":
        return <RendimientoBarrasWidget rows={m?.porAsignado || []} />;
      case "rendimiento-radar":
        return <RendimientoRadarWidget rows={m?.porAsignado || []} />;
      case "carga-asignado":
        return <CargaAsignadoWidget rows={m?.porAsignado || []} />;
      case "avance-persona":
        return <AvancePersonaWidget rows={m?.porAsignado || []} />;
      default:
        return null;
    }
  };

  return (
    <>
      <Topbar title="Dashboard" subtitle={user?.name || "Metricas del proyecto"} />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-brand-gray-900">
              Resumen operativo
            </h1>
            <p className="text-sm text-muted-foreground">
              <span className="sm:hidden">KPIs, metricas y graficos</span>
              <span className="hidden sm:inline">Widgets personalizables · KPIs, metricas y graficos</span>
              {selectedDev ? ` · ${selectedDev.Nombre}` : ""}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button type="button" variant="secondary" className="h-10 flex-1 sm:flex-none" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Actualizar
            </Button>
            <Button
              type="button"
              variant={editMode ? "default" : "outline"}
              className="hidden h-10 lg:inline-flex"
              onClick={() => setEditMode((v) => !v)}
            >
              <Pencil />
              {editMode ? "Terminar edicion" : "Editar layout"}
            </Button>
            <Button type="button" variant="secondary" className="h-10 flex-1 sm:flex-none" onClick={() => setCustomizeOpen(true)}>
              <Settings2 />
              <span className="sm:hidden">Widgets</span>
              <span className="hidden sm:inline">Personalizar</span>
            </Button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <DateRangeFilter
            variant="day-and-range"
            value={
              rango.desde && rango.hasta
                ? rango
                : diaDesdePreset("hoy", { min: bounds?.min, max: bounds?.max })
            }
            min={bounds?.min}
            max={bounds?.max}
            onChange={applyRango}
            onResetMax={resetMax}
            disabled={loading && !m}
          />
          <DeveloperFilter
            value={perCod}
            options={devs}
            onChange={applyDev}
            disabled={loading && !m}
          />
          {editMode && (
            <Badge variant="info" className="hidden h-9 gap-1 lg:inline-flex">
              <LayoutGrid className="size-3" />
              Arrastra por el encabezado · redimensiona desde la esquina
            </Badge>
          )}
        </div>

        {error && (
          <div className="mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
        )}

        {ready && (
          <DashboardGrid
            role="manager"
            editMode={editMode}
            prefs={prefs}
            onPrefsChange={setPrefs}
            renderWidget={renderWidget}
          />
        )}

        <CustomizeWidgetsDialog
          role="manager"
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
      </main>
    </>
  );
}
