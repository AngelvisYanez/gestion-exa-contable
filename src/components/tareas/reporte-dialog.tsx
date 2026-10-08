"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileBarChart,
  FileText,
  Link2,
  Paperclip,
  Printer,
  TrendingUp,
} from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { EstadoBadge } from "@/components/status-badges";
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
import { Progress } from "@/components/ui/progress";
import {
  buildReporte,
  buildReporteData,
  DIAS_SIN_ACTUALIZAR,
  limitesPeriodo,
  type Actividad,
  type ReporteData,
} from "@/lib/metricas-avance";
import { fmtFechaHoraZona, hoyFecha } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const PERIODOS = [
  { dias: 1, label: "Hoy" },
  { dias: 7, label: "7 dias" },
  { dias: 14, label: "14 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 90, label: "90 dias" },
];

type Seleccion =
  | { tipo: "dias"; dias: number }
  | { tipo: "rango"; desde: string; hasta: string };

function actividadCubre(act: Actividad | null, desdeDia: string, hastaDia: string) {
  if (!act) return false;
  const desde = act.desdeDia || act.desde.slice(0, 10);
  const hasta = act.hastaDia || hoyFecha();
  return desde <= desdeDia && hasta >= hastaDia;
}

type Vista = "documento" | "texto";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );
}

function fmtHora(iso: string | null) {
  return fmtFechaHoraZona(iso, { dateStyle: "short", timeStyle: "short" });
}

function KpiTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    default: "text-primary",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-sky-700",
  };
  return (
    <div className="rounded-xl border border-border/70 bg-background/90 px-3 py-2.5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-xl font-bold tabular-nums tracking-tight", tones[tone])}>{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ReportePreview({ data }: { data: ReporteData }) {
  const m = data.metricas;
  return (
    <article className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      {/* Cabecera */}
      <header className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary via-primary to-[#5a1515] px-5 py-5 text-primary-foreground sm:px-6">
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
              <FileBarChart className="size-3" />
              EXA Tareas
            </div>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Reporte de avance</h2>
            <p className="mt-1 truncate text-sm text-primary-foreground/85">{data.usuario}</p>
          </div>
          <div className="rounded-xl bg-white/12 px-3 py-2 text-right text-xs backdrop-blur-sm">
            <div className="font-bold tabular-nums">
              {data.desdeLabel} → {data.hastaLabel}
            </div>
            <div className="mt-0.5 text-primary-foreground/75">{data.periodoLabel}</div>
          </div>
        </div>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {/* KPIs */}
        <section>
          <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Resumen</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <KpiTile label="Avances" value={m.avances} hint={`${m.tareasTocadas} tarea(s)`} tone="info" />
            <KpiTile label="Progreso" value={`+${m.puntos}`} hint="puntos %" tone="success" />
            <KpiTile
              label="Dias activos"
              value={`${m.diasActivos}/${data.dias}`}
              hint={m.racha ? `Racha ${m.racha}` : undefined}
              tone={m.diasActivos >= Math.ceil(data.dias * 0.5) ? "success" : "warning"}
            />
            <KpiTile
              label="Evidencias"
              value={m.evidencias}
              hint={`${m.coberturaEvidencia}% cobertura`}
              tone={m.coberturaEvidencia >= 50 ? "success" : "warning"}
            />
            <KpiTile label="Horas" value={m.horasReportadas} hint={`${m.horasActivas} h activas`} />
            <KpiTile
              label="Finalizadas"
              value={m.finalizadasPeriodo}
              hint={m.aTiempoPct != null ? `${m.aTiempoPct}% a tiempo` : undefined}
              tone="success"
            />
          </div>
        </section>

        {/* Detalle por tarea */}
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Detalle por tarea
            </h3>
            <Badge variant="muted">{data.detalle.length} con avance</Badge>
          </div>

          {!data.detalle.length ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center">
              <TrendingUp className="mx-auto mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">Sin avances en este periodo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Registra avances en Mis tareas para que aparezcan aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.detalle.map((t) => (
                <div
                  key={t.Tar_Cod}
                  className="overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm"
                >
                  <div className="border-b border-border/50 bg-muted/25 px-3.5 py-2.5 sm:px-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">#{t.Tar_Cod}</span>
                          <EstadoBadge estado={t.estado} />
                          {t.ganado > 0 && (
                            <Badge variant="success" className="tabular-nums">
                              +{t.ganado}%
                            </Badge>
                          )}
                        </div>
                        <h4 className="mt-1 text-sm font-bold leading-snug text-foreground">{t.titulo}</h4>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums text-sky-700">{t.porcentaje}%</div>
                        {t.fechaFin && (
                          <div className="text-[10px] text-muted-foreground">Fin {t.fechaFin}</div>
                        )}
                      </div>
                    </div>
                    <Progress value={Math.min(100, t.porcentaje)} className="mt-2 h-1.5" />
                  </div>

                  <ul className="divide-y divide-border/50">
                    {t.avances.map((a) => (
                      <li key={a.Ava_Cod} className="px-3.5 py-3 sm:px-4">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                            <Clock className="size-3" />
                            {fmtHora(a.Ava_Fecha)}
                          </span>
                          <Badge variant="info" className="tabular-nums">
                            {a.Ava_Porcentaje}%
                            <span className="ml-1 opacity-80">
                              ({a.Ava_Delta >= 0 ? "+" : ""}
                              {a.Ava_Delta})
                            </span>
                          </Badge>
                          {a.horas != null && a.horas > 0 && (
                            <span className="text-[11px] text-muted-foreground">{a.horas} h</span>
                          )}
                        </div>
                        {a.realizado && (
                          <p className="text-xs leading-relaxed text-foreground/90">{a.realizado}</p>
                        )}
                        {a.siguiente && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground/70">Siguiente:</span> {a.siguiente}
                          </p>
                        )}
                        {a.bloqueos && (
                          <p className="mt-1 inline-flex items-start gap-1 text-[11px] font-medium text-amber-800">
                            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                            {a.bloqueos}
                          </p>
                        )}
                        {(a.enlaces.length > 0 || a.adjuntos.length > 0) && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.enlaces.map((e) => (
                              <a
                                key={e}
                                href={e}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 hover:bg-sky-100"
                              >
                                <Link2 className="size-3 shrink-0" />
                                <span className="truncate">{e}</span>
                                <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                              </a>
                            ))}
                            {a.adjuntos.map((f) => (
                              <a
                                key={f.url}
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-200"
                              >
                                <Paperclip className="size-3" />
                                {f.nombre}
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sin actualizar */}
        {data.sinActualizar.length > 0 && (
          <section className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 sm:p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-900">
              <AlertTriangle className="size-3.5" />
              Sin actualizar ({DIAS_SIN_ACTUALIZAR}+ dias)
            </h3>
            <ul className="space-y-1.5">
              {data.sinActualizar.map((t) => (
                <li
                  key={t.Tar_Cod}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 truncate font-semibold text-foreground">
                    <span className="font-mono text-muted-foreground">#{t.Tar_Cod}</span> {t.titulo}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-amber-800">
                    {t.porcentaje}% · {t.hace}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="border-t border-border/50 pt-3 text-center text-[10px] text-muted-foreground">
          Generado desde EXA Tareas · {data.generado}
        </footer>
      </div>
    </article>
  );
}

function buildPrintHtml(data: ReporteData) {
  const m = data.metricas;
  const kpi = (label: string, value: string | number, hint = "") =>
    `<div class="kpi"><div class="k-l">${escapeHtml(label)}</div><div class="k-v">${escapeHtml(String(value))}</div>${hint ? `<div class="k-h">${escapeHtml(hint)}</div>` : ""}</div>`;

  const tasks = data.detalle.length
    ? data.detalle
        .map((t) => {
          const rows = t.avances
            .map((a) => {
              const bits: string[] = [];
              if (a.realizado) bits.push(`<p class="done">${escapeHtml(a.realizado)}</p>`);
              if (a.siguiente) bits.push(`<p class="meta"><b>Siguiente:</b> ${escapeHtml(a.siguiente)}</p>`);
              if (a.bloqueos) bits.push(`<p class="warn"><b>Bloqueo:</b> ${escapeHtml(a.bloqueos)}</p>`);
              for (const e of a.enlaces) bits.push(`<p class="link"><a href="${escapeHtml(e)}">${escapeHtml(e)}</a></p>`);
              for (const f of a.adjuntos)
                bits.push(`<p class="link"><a href="${escapeHtml(f.url)}">${escapeHtml(f.nombre)}</a></p>`);
              return `<div class="avance"><div class="a-head"><span>${escapeHtml(fmtHora(a.Ava_Fecha))}</span><strong>${a.Ava_Porcentaje}% (${a.Ava_Delta >= 0 ? "+" : ""}${a.Ava_Delta})</strong>${a.horas ? `<span>${a.horas} h</span>` : ""}</div>${bits.join("")}</div>`;
            })
            .join("");
          return `<section class="task"><header><span class="cod">#${t.Tar_Cod}</span> <span class="est">${escapeHtml(t.estado)}</span> <strong class="pct">${t.porcentaje}%</strong><h3>${escapeHtml(t.titulo)}</h3><div class="sub">+${t.ganado} pts${t.fechaFin ? ` · Fin ${escapeHtml(t.fechaFin)}` : ""}</div></header>${rows}</section>`;
        })
        .join("")
    : `<p class="empty">Sin avances registrados en el periodo.</p>`;

  const stale = data.sinActualizar.length
    ? `<section class="stale"><h2>Sin actualizar (${DIAS_SIN_ACTUALIZAR}+ dias)</h2><ul>${data.sinActualizar
        .map(
          (t) =>
            `<li><b>#${t.Tar_Cod}</b> ${escapeHtml(t.titulo)} — ${t.porcentaje}% · ${escapeHtml(t.hace)}</li>`
        )
        .join("")}</ul></section>`
    : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte de avance — ${escapeHtml(data.usuario)}</title>
<style>
  @page{margin:16mm}
  *{box-sizing:border-box}
  body{font-family:"Segoe UI",system-ui,sans-serif;color:#1c1917;max-width:800px;margin:0 auto;padding:0;line-height:1.45;font-size:12.5px;background:#fff}
  .hero{background:linear-gradient(135deg,#9b2020,#5a1515);color:#fff;padding:22px 24px;border-radius:0 0 16px 16px}
  .badge{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(255,255,255,.15);padding:4px 10px;border-radius:999px;margin-bottom:8px}
  h1{font-size:22px;margin:0 0 4px;letter-spacing:-.02em}
  .user{opacity:.9;font-size:13px;margin:0}
  .range{margin-top:10px;font-size:11px;opacity:.85}
  .wrap{padding:20px 24px 28px}
  h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#78716c;margin:0 0 10px}
  .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:22px}
  .kpi{border:1px solid #e7e5e4;border-radius:10px;padding:10px 12px;background:#fafaf9}
  .k-l{font-size:9px;font-weight:700;text-transform:uppercase;color:#78716c;letter-spacing:.04em}
  .k-v{font-size:18px;font-weight:800;margin-top:2px;color:#9b2020;font-variant-numeric:tabular-nums}
  .k-h{font-size:10px;color:#a8a29e;margin-top:2px}
  .task{border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;margin-bottom:12px;break-inside:avoid}
  .task header{background:#f5f5f4;padding:10px 14px;border-bottom:1px solid #e7e5e4}
  .task h3{margin:4px 0 2px;font-size:13px}
  .cod{font-family:ui-monospace,monospace;font-size:10px;color:#78716c}
  .est{font-size:10px;font-weight:700;background:#e0f2fe;color:#0369a1;padding:1px 6px;border-radius:4px;margin-left:4px}
  .pct{float:right;color:#0369a1;font-size:15px}
  .sub{font-size:10px;color:#78716c}
  .avance{padding:10px 14px;border-top:1px solid #f5f5f4}
  .a-head{display:flex;gap:10px;align-items:center;font-size:11px;color:#78716c;margin-bottom:4px}
  .a-head strong{color:#0c4a6e}
  .done{margin:0;font-size:12px}
  .meta{margin:4px 0 0;font-size:11px;color:#57534e}
  .warn{margin:4px 0 0;font-size:11px;color:#92400e}
  .link{margin:3px 0 0;font-size:10px;word-break:break-all}
  .link a{color:#0369a1}
  .empty{color:#78716c;text-align:center;padding:24px;border:1px dashed #d6d3d1;border-radius:12px}
  .stale{background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px 14px;margin-top:16px}
  .stale h2{color:#92400e}
  .stale ul{margin:0;padding-left:18px}
  .stale li{margin:4px 0;font-size:11px}
  footer{margin-top:20px;padding-top:12px;border-top:1px solid #e7e5e4;text-align:center;font-size:10px;color:#a8a29e}
</style></head><body>
<div class="hero"><div class="badge">EXA Tareas</div><h1>Reporte de avance</h1><p class="user">${escapeHtml(data.usuario)}</p><div class="range">${escapeHtml(data.desdeLabel)} → ${escapeHtml(data.hastaLabel)} · ${escapeHtml(data.periodoLabel)}</div></div>
<div class="wrap">
  <h2>Resumen</h2>
  <div class="kpis">
    ${kpi("Avances", m.avances, `${m.tareasTocadas} tarea(s)`)}
    ${kpi("Progreso", `+${m.puntos}`, "puntos %")}
    ${kpi("Dias activos", `${m.diasActivos}/${data.dias}`, m.racha ? `Racha ${m.racha}` : "")}
    ${kpi("Evidencias", m.evidencias, `${m.coberturaEvidencia}% cobertura`)}
    ${kpi("Horas", m.horasReportadas, `${m.horasActivas} h activas`)}
    ${kpi("Finalizadas", m.finalizadasPeriodo, m.aTiempoPct != null ? `${m.aTiempoPct}% a tiempo` : "")}
  </div>
  <h2>Detalle por tarea</h2>
  ${tasks}
  ${stale}
  <footer>Generado desde EXA Tareas · ${escapeHtml(data.generado)}</footer>
</div>
</body></html>`;
}

export function ReporteDialog({
  open,
  onClose,
  usuario,
  tareas,
  actividad,
  periodo = 7,
  desde = "",
  hasta = "",
}: {
  open: boolean;
  onClose: () => void;
  usuario: string;
  tareas: Tarea[];
  actividad: Actividad | null;
  /** Periodo activo en la pantalla (dias o rango). */
  periodo?: number | "rango";
  desde?: string;
  hasta?: string;
}) {
  const [sel, setSel] = useState<Seleccion>({ tipo: "dias", dias: 7 });
  const [vista, setVista] = useState<Vista>("documento");
  const [copiado, setCopiado] = useState(false);
  const [remota, setRemota] = useState<Actividad | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const abierto = useRef(false);

  useEffect(() => {
    if (open && !abierto.current) {
      if (periodo === "rango" && desde && hasta) setSel({ tipo: "rango", desde, hasta });
      else if (typeof periodo === "number") setSel({ tipo: "dias", dias: periodo });
      else setSel({ tipo: "dias", dias: 7 });
      setRemota(null);
      setErrorCarga("");
    }
    abierto.current = open;
  }, [open, periodo, desde, hasta]);

  const ventana = limitesPeriodo(
    sel.tipo === "dias" ? sel.dias : 7,
    sel.tipo === "rango" ? { desde: sel.desde, hasta: sel.hasta } : null
  );
  const baseCubre = actividadCubre(actividad, ventana.desdeDia, ventana.hastaDia);
  const remotaCubre = actividadCubre(remota, ventana.desdeDia, ventana.hastaDia);
  const fuente = remotaCubre ? remota : baseCubre ? actividad : null;

  useEffect(() => {
    if (!open || baseCubre) return;
    let cancel = false;
    setCargando(true);
    setErrorCarga("");
    const params = new URLSearchParams({ project: "exa" });
    if (sel.tipo === "rango") {
      params.set("desde", sel.desde);
      params.set("hasta", sel.hasta);
    } else {
      params.set("dias", String(sel.dias));
    }
    fetch(`/api/mis-tareas?${params}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error(j.message || "No se pudo armar el reporte");
        if (!cancel) setRemota(j.actividad || null);
      })
      .catch((e) => {
        if (!cancel) setErrorCarga(e instanceof Error ? e.message : "No se pudo armar el reporte");
      })
      .finally(() => {
        if (!cancel) setCargando(false);
      });
    return () => {
      cancel = true;
    };
  }, [open, baseCubre, sel]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const rango = sel.tipo === "rango" ? { desde: sel.desde, hasta: sel.hasta } : null;
  const dias = sel.tipo === "dias" ? sel.dias : ventana.dias;

  const data = useMemo(
    () =>
      open && fuente
        ? buildReporteData({ usuario, dias, tareas, actividad: fuente, origin, rango })
        : null,
    [open, usuario, dias, tareas, fuente, origin, rango]
  );

  const texto = useMemo(
    () =>
      open && fuente
        ? buildReporte({ usuario, dias, tareas, actividad: fuente, origin, rango })
        : "",
    [open, usuario, dias, tareas, fuente, origin, rango]
  );

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin permiso de portapapeles */
    }
  };

  const descargar = () => {
    const blob = new Blob([texto], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `reporte-avance-${hoyFecha()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const imprimir = () => {
    if (!data) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(buildPrintHtml(data));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 350);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[94dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="shrink-0 space-y-3 border-b border-border/70 px-5 pb-3 pt-5 sm:px-6">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileBarChart className="size-4" />
              </span>
              Reporte de avance
            </DialogTitle>
            <DialogDescription>
              Vista lista para compartir. Copia el texto para Teams/WhatsApp o imprime como PDF.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              {PERIODOS.map((p) => (
                <button
                  key={p.dias}
                  type="button"
                  onClick={() => setSel({ tipo: "dias", dias: p.dias })}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                    sel.tipo === "dias" && sel.dias === p.dias
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
              {sel.tipo === "rango" && (
                <button
                  type="button"
                  className="rounded-md bg-background px-2.5 py-1.5 text-xs font-bold text-foreground shadow-sm"
                >
                  Rango
                </button>
              )}
            </div>
            <div className="ml-auto inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => setVista("documento")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                  vista === "documento"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileBarChart className="size-3.5" />
                Documento
              </button>
              <button
                type="button"
                onClick={() => setVista("texto")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors",
                  vista === "texto"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="size-3.5" />
                Texto
              </button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4 sm:px-5">
          {cargando && !data ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Cargando reporte...</p>
          ) : errorCarga && !data ? (
            <p className="py-16 text-center text-sm text-red-600">{errorCarga}</p>
          ) : vista === "documento" && data ? (
            <ReportePreview data={data} />
          ) : (
            <pre className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-card p-4 font-mono text-[11px] leading-relaxed text-foreground/90 shadow-sm sm:p-5">
              {texto}
            </pre>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border/70 bg-background px-5 py-3 sm:justify-between sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={imprimir} disabled={!data}>
              <Printer />
              Imprimir / PDF
            </Button>
            <Button type="button" variant="outline" onClick={descargar} disabled={!texto}>
              <Download />
              .md
            </Button>
            <Button type="button" onClick={() => void copiar()} disabled={!texto}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? "Copiado" : "Copiar texto"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
