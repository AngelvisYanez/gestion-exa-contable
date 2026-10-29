"use client";

import { useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  buildReporteRendimiento, buildRendimientoCsv, descargarReporte, nombreReporteRendimiento,
  type FuenteRendimiento,
} from "@/lib/reporte-rendimiento";

export function ExportarRendimiento({ metrics, proyecto, disabled }: {
  metrics: FuenteRendimiento | null;
  proyecto: { db: string; nombre: string };
  disabled: boolean;
}) {
  const [exportando, setExportando] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);

  const exportar = async (formato: "pdf" | "csv") => {
    if (!metrics || disabled || busy.current) return;
    busy.current = true;
    setExportando(formato);
    setError("");
    try {
      // Capture the loaded data before an asynchronous PDF import or a filter change.
      const reporte = buildReporteRendimiento(metrics, proyecto);
      let blob: Blob;
      if (formato === "pdf") {
        const [{ buildRendimientoPdf }, logo] = await Promise.all([
          import("@/lib/reporte-rendimiento-pdf"),
          fetch("/logo-1.png").then(async (response) => response.ok
            ? new Uint8Array(await response.arrayBuffer()) : undefined).catch(() => undefined),
        ]);
        const bytes = await buildRendimientoPdf(reporte, { logo });
        blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      } else {
        blob = new Blob([buildRendimientoCsv(reporte)], { type: "text/csv;charset=utf-8" });
      }
      descargarReporte(blob, nombreReporteRendimiento(reporte, formato));
    } catch {
      setError("No se pudo generar el reporte. Intenta descargarlo nuevamente.");
    } finally {
      busy.current = false;
      setExportando(null);
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto" aria-busy={!!exportando}>
      <Button type="button" variant="outline" className="h-9" disabled={disabled || !metrics || !!exportando} onClick={() => void exportar("pdf")}>
        {exportando === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
        {exportando === "pdf" ? "Generando PDF..." : "Exportar PDF"}
      </Button>
      <Button type="button" variant="outline" className="h-9" disabled={disabled || !metrics || !!exportando} onClick={() => void exportar("csv")}>
        {exportando === "csv" ? <Loader2 className="animate-spin" /> : <Download />}
        Exportar CSV
      </Button>
      {error && <div className="w-full" role="alert"><Alert variant="destructive">{error}</Alert></div>}
    </div>
  );
}
