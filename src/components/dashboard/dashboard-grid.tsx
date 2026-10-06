"use client";

import { useEffect, useMemo, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout/legacy";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import {
  DashboardPrefs,
  DashboardRole,
  LayoutItem,
  getDefaultPrefs,
  loadPrefs,
  metaFor,
  savePrefs,
} from "./widget-registry";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGrid = WidthProvider(GridLayout);

/** Por debajo de `lg`: una columna en teléfono y dos en tablet, sin arrastrar. */
const COMPACT_QUERY = "(max-width: 1023px)";

/** En tablet estos widgets comparten fila. El resto ocupa el ancho completo. */
const STACK_HALF = new Set(["overall", "cumplimiento", "equipo-cola", "accesos", "cola-personal"]);

/** Alto fijo para gráficos que miden el padre. El resto crece con el contenido. */
const STACK_FILL: Record<string, string> = {
  "rendimiento-onda": "h-[300px] sm:h-[340px]",
  "rendimiento-barras": "h-[320px] sm:h-[360px]",
  "rendimiento-radar": "h-[300px] sm:h-[340px]",
  "chart-estado": "h-[320px]",
  "chart-prioridad": "h-[320px]",
  "chart-tipo": "h-[320px]",
  actividad: "h-[260px] sm:h-[280px]",
  "carga-asignado": "h-[260px] sm:h-[300px]",
  "avance-persona": "h-[280px] sm:h-[320px]",
  metricas: "h-[340px] sm:h-[380px]",
  atrasadas: "h-[280px] sm:h-[320px]",
};

type Props = {
  role: DashboardRole;
  editMode: boolean;
  prefs: DashboardPrefs;
  onPrefsChange: (prefs: DashboardPrefs) => void;
  renderWidget: (id: string) => React.ReactNode;
};

export function useDashboardPrefs(role: DashboardRole) {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => getDefaultPrefs(role));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(loadPrefs(role));
    setReady(true);
  }, [role]);

  const update = (next: DashboardPrefs) => {
    setPrefs(next);
    savePrefs(role, next);
  };

  return { prefs, setPrefs: update, ready };
}

export function DashboardGrid({ role, editMode, prefs, onPrefsChange, renderWidget }: Props) {
  const compact = useMediaQuery(COMPACT_QUERY);
  const layout = useMemo(() => {
    const byId = new Map(prefs.layouts.map((l) => [l.i, l]));
    return prefs.enabled.map((id) => {
      const meta = metaFor(role, id);
      const saved = byId.get(id) || meta.defaultLayout;
      const minW = meta.defaultLayout.minW ?? 1;
      const minH = meta.defaultLayout.minH ?? 1;
      return {
        ...saved,
        i: id,
        w: Math.max(saved.w, minW),
        h: Math.max(saved.h, minH),
        minW,
        minH,
        static: !editMode,
      } satisfies LayoutItem;
    });
  }, [prefs, editMode, role]);

  const onLayoutChange = (next: readonly LayoutItem[]) => {
    if (!editMode) return;
    onPrefsChange({
      ...prefs,
      layouts: next.map((l) => ({
        i: l.i,
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        minW: l.minW,
        minH: l.minH,
      })),
    });
  };

  const removeWidget = (id: string) => {
    onPrefsChange({
      ...prefs,
      enabled: prefs.enabled.filter((w) => w !== id),
    });
  };

  if (compact) {
    return (
      <div className="dashboard-stack grid grid-cols-1 gap-3 sm:grid-cols-2">
        {prefs.enabled.map((id) => {
          const meta = metaFor(role, id);
          const fill = STACK_FILL[id];
          return (
            <div
              key={id}
              className={cn("min-w-0", !STACK_HALF.has(id) && "sm:col-span-2", fill)}
            >
              <WidgetShell title={meta.title} layout={fill ? "fill" : "auto"}>
                {renderWidget(id)}
              </WidgetShell>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <ResponsiveGrid
      className="dashboard-grid"
      layout={layout}
      cols={12}
      rowHeight={40}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      onLayoutChange={onLayoutChange}
      draggableHandle=".widget-drag-handle"
      isDraggable={editMode}
      isResizable={editMode}
      compactType="vertical"
      useCSSTransforms
    >
      {prefs.enabled.map((id) => {
        const meta = metaFor(role, id);
        return (
          <div key={id} className="h-full min-h-0">
            <WidgetShell title={meta.title} editMode={editMode} onRemove={() => removeWidget(id)}>
              {renderWidget(id)}
            </WidgetShell>
          </div>
        );
      })}
    </ResponsiveGrid>
  );
}
