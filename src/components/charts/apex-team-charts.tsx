"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import type { AssigneeMetric, TeamDayPoint } from "@/lib/dashboard";

const ReactApexChart = dynamic(() => import("react-apexcharts").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-muted-foreground">
      Cargando grafico...
    </div>
  ),
});

const BRAND = {
  red: "#b91c1c",
  sky: "#0284c7",
  emerald: "#059669",
  amber: "#d97706",
  violet: "#7c3aed",
};

function baseChart(): ApexOptions {
  return {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "inherit",
      animations: { enabled: true, speed: 600 },
      background: "transparent",
    },
    grid: {
      borderColor: "#e7e5e4",
      strokeDashArray: 4,
      padding: { left: 8, right: 8, top: 0, bottom: 0 },
    },
    dataLabels: { enabled: false },
    legend: {
      position: "top",
      horizontalAlign: "left",
      fontSize: "11px",
      fontWeight: 600,
      itemMargin: { horizontal: 8, vertical: 0 },
    },
    tooltip: {
      theme: "light",
      style: { fontSize: "12px" },
    },
    xaxis: {
      labels: {
        style: { fontSize: "10px", colors: "#78716c" },
        rotate: 0,
        hideOverlappingLabels: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { fontSize: "10px", colors: "#78716c" },
        formatter: (v) => `${Math.round(v)}`,
      },
    },
  };
}

function shortName(nombre: string) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(" ") || "—";
  return `${parts[0]} ${parts[1][0]}.`;
}

/** Onda (area suave) de actividad y avance del equipo. */
export function TeamWaveChart({
  serie,
  height = 240,
}: {
  serie: TeamDayPoint[];
  height?: number | string;
}) {
  const categories = useMemo(() => serie.map((d) => d.label), [serie]);
  const series = useMemo(
    () => [
      { name: "Avances", data: serie.map((d) => d.avances) },
      { name: "Completadas", data: serie.map((d) => d.completadas) },
      { name: "Avance %", data: serie.map((d) => d.avance_promedio) },
    ],
    [serie]
  );

  const options = useMemo<ApexOptions>(() => {
    const base = baseChart();
    return {
      ...base,
      chart: {
        ...base.chart,
        type: "area",
        sparkline: { enabled: false },
        parentHeightOffset: 0,
        redrawOnParentResize: true,
      },
      colors: [BRAND.sky, BRAND.emerald, BRAND.red],
      legend: { show: false },
      stroke: { curve: "smooth", width: [2.5, 2.5, 2], colors: [BRAND.sky, BRAND.emerald, BRAND.red] },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      markers: { size: 0, hover: { size: 4 } },
      xaxis: {
        ...base.xaxis,
        categories,
        tickAmount: Math.min(6, Math.max(2, categories.length - 1)),
      },
      yaxis: [
        {
          seriesName: "Avances",
          min: 0,
          forceNiceScale: true,
          labels: {
            style: { fontSize: "10px", colors: BRAND.sky },
            formatter: (v) => `${Math.round(v)}`,
          },
        },
        {
          seriesName: "Avances",
          show: false,
        },
        {
          seriesName: "Avance %",
          opposite: true,
          min: 0,
          max: 100,
          labels: {
            style: { fontSize: "10px", colors: BRAND.red },
            formatter: (v) => `${Math.round(v)}%`,
          },
        },
      ],
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (val, opts) => {
            const name = opts?.w?.globals?.seriesNames?.[opts.seriesIndex] || "";
            if (name === "Avance %") return `${val}%`;
            return `${val}`;
          },
        },
      },
    };
  }, [categories]);

  if (!serie.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin actividad en el periodo
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ReactApexChart type="area" height={height} series={series} options={options} />
    </div>
  );
}

/** Barras agrupadas: carga y avance por persona. */
export function TeamBarsChart({
  rows,
  height = 240,
}: {
  rows: AssigneeMetric[];
  height?: number;
}) {
  const top = useMemo(() => rows.filter((r) => r.total > 0).slice(0, 8), [rows]);
  const categories = useMemo(() => top.map((r) => shortName(r.Nombre)), [top]);
  const series = useMemo(
    () => [
      { name: "Total", data: top.map((r) => r.total) },
      { name: "Completadas", data: top.map((r) => r.completadas) },
      { name: "En proceso", data: top.map((r) => r.proceso) },
    ],
    [top]
  );

  const options = useMemo<ApexOptions>(() => {
    const base = baseChart();
    return {
      ...base,
      chart: { ...base.chart, type: "bar" },
      colors: [BRAND.sky, BRAND.emerald, BRAND.amber],
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "58%",
          borderRadius: 4,
          borderRadiusApplication: "end",
        },
      },
      xaxis: {
        ...base.xaxis,
        categories,
        labels: {
          style: { fontSize: "10px", colors: "#78716c" },
          rotate: categories.length > 5 ? -25 : 0,
          trim: true,
        },
      },
    };
  }, [categories]);

  if (!top.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin asignaciones
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ReactApexChart type="bar" height={height} series={series} options={options} />
    </div>
  );
}

/** Radar de rendimiento relativo del equipo. */
export function TeamRadarChart({
  rows,
  height = 260,
}: {
  rows: AssigneeMetric[];
  height?: number;
}) {
  const top = useMemo(() => rows.filter((r) => r.total > 0).slice(0, 5), [rows]);
  const maxTotal = Math.max(1, ...top.map((r) => r.total));

  const series = useMemo(
    () =>
      top.map((r) => ({
        name: shortName(r.Nombre),
        data: [
          Math.round((r.total / maxTotal) * 100),
          r.cumplimiento,
          r.avance_promedio,
          r.total ? Math.round((r.proceso / r.total) * 100) : 0,
          r.total ? Math.round((r.completadas / r.total) * 100) : 0,
        ],
      })),
    [top, maxTotal]
  );

  const options = useMemo<ApexOptions>(() => {
    const base = baseChart();
    return {
      ...base,
      chart: { ...base.chart, type: "radar" },
      colors: [BRAND.sky, BRAND.emerald, BRAND.red, BRAND.violet, BRAND.amber],
      stroke: { width: 2 },
      fill: { opacity: 0.18 },
      markers: { size: 3, hover: { size: 5 } },
      xaxis: {
        categories: ["Carga", "Cumplim.", "Avance", "Proceso", "Hechas"],
        labels: {
          style: {
            fontSize: "10px",
            colors: Array(5).fill("#78716c") as string[],
          },
        },
      },
      yaxis: {
        show: false,
        min: 0,
        max: 100,
      },
      plotOptions: {
        radar: {
          size: Math.min(110, Math.round(height * 0.38)),
          polygons: {
            strokeColors: "#e7e5e4",
            connectorColors: "#e7e5e4",
            fill: { colors: ["transparent", "#f5f5f4"] },
          },
        },
      },
      legend: {
        position: "bottom",
        fontSize: "10px",
        fontWeight: 600,
        itemMargin: { horizontal: 6, vertical: 2 },
      },
      tooltip: {
        y: { formatter: (v) => `${Math.round(v)}%` },
      },
    };
  }, [height]);

  if (!top.length) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin datos de equipo
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ReactApexChart type="radar" height={height} series={series} options={options} />
    </div>
  );
}

/** Donut Apex para estados / prioridad. */
export function ApexDonutChart({
  slices,
  height = 220,
  centerLabel = "total",
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  height?: number;
  centerLabel?: string;
}) {
  const series = useMemo(() => slices.map((s) => s.value), [slices]);
  const total = useMemo(() => series.reduce((a, b) => a + b, 0), [series]);

  const options = useMemo<ApexOptions>(() => {
    const base = baseChart();
    return {
      ...base,
      chart: { ...base.chart, type: "donut" },
      labels: slices.map((s) => s.label),
      colors: slices.map((s) => s.color),
      stroke: { width: 2, colors: ["#ffffff"] },
      legend: {
        position: "bottom",
        fontSize: "11px",
        fontWeight: 600,
        itemMargin: { horizontal: 6, vertical: 2 },
      },
      plotOptions: {
        pie: {
          donut: {
            size: "68%",
            labels: {
              show: true,
              name: { show: true, fontSize: "11px", offsetY: 14 },
              value: {
                show: true,
                fontSize: "22px",
                fontWeight: 700,
                offsetY: -8,
                formatter: () => `${total}`,
              },
              total: {
                show: true,
                label: centerLabel,
                fontSize: "10px",
                fontWeight: 700,
                color: "#78716c",
                formatter: () => `${total}`,
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
    };
  }, [slices, centerLabel, total]);

  if (!slices.length || total === 0) {
    return (
      <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Sin datos
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden">
      <ReactApexChart type="donut" height={height} series={series} options={options} />
    </div>
  );
}
