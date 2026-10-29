import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import type { ReporteRendimiento } from "./reporte-rendimiento";
import { fmtFechaHoraZona } from "./timezone";
import { duracionMonitoreo } from "./reporte-monitoreo";

const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 40, CONTENT = WIDTH - MARGIN * 2, BOTTOM = 61;
const hex = (v: string) => rgb(parseInt(v.slice(1, 3), 16) / 255, parseInt(v.slice(3, 5), 16) / 255, parseInt(v.slice(5, 7), 16) / 255);
// Light-theme tokens from Gestion: corporate red, warm neutrals and status colors.
const colors = {
  red: hex("#9e2424"), redDark: hex("#741b1b"), redPale: hex("#fbefef"), ink: hex("#1b1b19"),
  muted: hex("#686863"), line: hex("#deded9"), surface: hex("#f6f6f3"), white: rgb(1, 1, 1),
  sky: hex("#0284c7"), skyPale: hex("#eef7fc"), green: hex("#059669"), greenPale: hex("#edf8f3"),
  danger: hex("#dc2626"), dangerPale: hex("#fef2f2"), slate: hex("#64748b"), slatePale: hex("#f1f5f9"),
};
type Icon = "tasks" | "check" | "activity" | "clock" | "alert" | "trend" | "users" | "chart";
const icons: Record<Icon, string> = {
  tasks: "M9 5H6a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3 M9 3h6v4H9z M8 12h.01 M11 12h5 M8 17h.01 M11 17h5",
  check: "M20 11v1a9 9 0 1 1-5.34-8.23 M20 4l-9 9-3-3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  alert: "M10.3 4.9 2.1 19.1a1.3 1.3 0 0 0 1.1 1.9h17.6a1.3 1.3 0 0 0 1.1-1.9L13.7 4.9a2 2 0 0 0-3.4 0 M12 9v5 M12 17h.01",
  trend: "M3 17l6-6 4 4 8-10 M15 5h6v6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  chart: "M3 3v18h18 M8 16v-5 M13 16V7 M18 16v-8",
};

function printable(value: string, font: PDFFont): string {
  return Array.from(value.normalize("NFC").replace(/[\r\n\t]/g, " ")).map((c) => {
    try { font.encodeText(c); return c; } catch { return "?"; }
  }).join("");
}
function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const word of printable(value, font).split(/\s+/)) {
    if (row && font.widthOfTextAtSize(`${row} ${word}`, size) <= width) { row += ` ${word}`; continue; }
    if (row) rows.push(row);
    row = "";
    for (const char of word) {
      if (row && font.widthOfTextAtSize(row + char, size) > width) { rows.push(row); row = ""; }
      row += char;
    }
  }
  if (row || !rows.length) rows.push(row);
  return rows;
}
function roundedPath(w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2), c = r * 0.55228475;
  return `M${r} 0 H${w-r} C${w-r+c} 0 ${w} ${r-c} ${w} ${r} V${h-r}
    C${w} ${h-r+c} ${w-r+c} ${h} ${w-r} ${h} H${r} C${r-c} ${h} 0 ${h-r+c} 0 ${h-r}
    V${r} C0 ${r-c} ${r-c} 0 ${r} 0 Z`;
}
export type RendimientoPdfAssets = { logo?: Uint8Array };

export async function buildRendimientoPdf(reporte: ReporteRendimiento, assets: RendimientoPdfAssets = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = assets.logo ? await doc.embedPng(assets.logo) : null;
  doc.setTitle(`Rendimiento - ${reporte.proyecto}`);
  doc.setSubject("Gesti\u00f3n | Indicadores, equipo y evoluci\u00f3n diaria");
  doc.setCreator("EXA Tareas");
  doc.setCreationDate(new Date(reporte.generado));
  let page!: PDFPage, y = 0;
  const text = (value: string, x: number, atY: number, size = 10, strong = false, color: Color = colors.ink) => {
    page.drawText(printable(value, strong ? bold : normal), { x, y: atY, size, font: strong ? bold : normal, color });
  };
  const rightText = (value: string, right: number, atY: number, size = 9, strong = false, color: Color = colors.ink) => {
    const safe = printable(value, strong ? bold : normal);
    text(safe, right - (strong ? bold : normal).widthOfTextAtSize(safe, size), atY, size, strong, color);
  };
  const box = (x: number, top: number, width: number, height: number, fill: Color, radius = 9, border?: Color) => {
    page.drawSvgPath(roundedPath(width, height, radius), { x, y: top, color: fill, borderColor: border, borderWidth: border ? 0.65 : 0 });
  };
  const icon = (name: Icon, x: number, top: number, size: number, color: Color) => {
    page.drawSvgPath(icons[name], { x, y: top, scale: size / 24, borderColor: color, borderWidth: 1.8 });
  };
  const track = (x: number, top: number, width: number, percent: number, color: Color, height = 3) => {
    box(x, top, width, height, colors.line, height / 2);
    const filled = Math.max(0, Math.min(100, percent)) * width / 100;
    if (filled > 0) box(x, top, filled, height, color, height / 2);
  };
  const newPage = () => {
    page = doc.addPage([WIDTH, HEIGHT]);
    page.drawRectangle({ x: 0, y: HEIGHT - 4, width: WIDTH, height: 4, color: colors.surface });
    page.drawRectangle({ x: 0, y: HEIGHT - 4, width: 126, height: 4, color: colors.red });
    if (logo) page.drawImage(logo, { x: MARGIN, y: HEIGHT - 79, ...logo.scale(102 / logo.width) });
    else {
      text("exa", MARGIN, HEIGHT - 57, 33);
      text("C O N T A B L E", MARGIN + 1, HEIGHT - 73, 8, true, colors.red);
    }
    rightText("GESTI\u00d3N  /  REPORTE DE RENDIMIENTO", WIDTH - MARGIN, HEIGHT - 43, 8, true, colors.red);
    rightText(fmtFechaHoraZona(reporte.generado), WIDTH - MARGIN, HEIGHT - 60, 8, false, colors.muted);
    rightText("Zona horaria: America/Guayaquil", WIDTH - MARGIN, HEIGHT - 74, 7.5, false, colors.muted);
    page.drawLine({ start: { x: MARGIN, y: HEIGHT - 94 }, end: { x: WIDTH - MARGIN, y: HEIGHT - 94 }, thickness: 0.6, color: colors.line });
    y = HEIGHT - 115;
  };
  const ensure = (height: number) => { if (y - height < BOTTOM) newPage(); };
  const paragraph = (value: string) => {
    for (const row of wrap(value, normal, 8.2, CONTENT)) { ensure(13); text(row, MARGIN, y, 8.2, false, colors.muted); y -= 13; }
  };
  const heading = (value: string, glyph: Icon, reserve = 100) => {
    ensure(reserve);
    box(MARGIN, y, 25, 25, colors.redPale, 7);
    icon(glyph, MARGIN + 6, y - 6, 13, colors.red);
    text(value, MARGIN + 35, y - 16, 12, true);
    y -= 34;
  };
  const note = (value: string) => {
    const rows = wrap(value, normal, 8, CONTENT - 35), height = rows.length * 11 + 16;
    ensure(height + 8);
    box(MARGIN, y, CONTENT, height, colors.surface, 7);
    icon("tasks", MARGIN + 9, y - 10, 12, colors.muted);
    rows.forEach((row, i) => text(row, MARGIN + 29, y - 15 - i * 11, 8, false, colors.muted));
    y -= height + 12;
  };
  const table = (kind: "personas" | "diario", rows: string[][]) => {
    const people = kind === "personas";
    const headers = people ? ["Persona", "Total", "Finalizadas", "En proceso", "Pendientes", "Avance %", "Cumplimiento %"]
      : ["Fecha", "Avances", "Finalizadas", "Avance promedio %"];
    const widths = people ? [157, 47, 60, 58, 60, 58, CONTENT - 440] : [155, 100, 110, CONTENT - 365];
    const drawHeader = () => {
      page.drawRectangle({ x: MARGIN, y: y - 34, width: CONTENT, height: 34, color: colors.surface });
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, color: colors.red, thickness: 1.8 });
      let x = MARGIN;
      headers.forEach((label, i) => {
        wrap(label, bold, 7.4, widths[i] - 14).forEach((row, j) => {
          if (!i) text(row, x + 10, y - 15 - j * 10, 7.4, true, colors.muted);
          else rightText(row, x + widths[i] - 9, y - 15 - j * 10, 7.4, true, colors.muted);
        });
        x += widths[i];
      });
      y -= 34;
    };
    const rowLayout = (cells: string[]) => {
      const lines = wrap(cells[0], normal, 8.4, widths[0] - (people ? 42 : 20));
      return { lines, height: people ? Math.max(43, lines.length * 11 + 24) : Math.max(29, lines.length * 11 + 14) };
    };
    const continueTable = () => {
      newPage();
      heading(people ? "Desglose por persona - continuaci\u00f3n" : "Detalle diario - continuaci\u00f3n", people ? "users" : "activity");
      drawHeader();
    };
    const drawRow = (cells: string[], lines: string[], height: number, row: number) => {
      page.drawRectangle({ x: MARGIN, y: y - height, width: CONTENT, height, color: row % 2 ? colors.surface : colors.white });
      if (people) {
        const initials = cells[0].trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
        page.drawCircle({ x: MARGIN + 17, y: y - 19, size: 10, color: colors.redPale });
        const label = printable(initials, bold);
        text(label, MARGIN + 17 - bold.widthOfTextAtSize(label, 7) / 2, y - 21.5, 7, true, colors.red);
        lines.forEach((row, i) => text(row, MARGIN + 33, y - 15 - i * 11, 8.4));
        text(`#${cells[7]}`, MARGIN + 33, y - 16 - lines.length * 11, 7, false, colors.muted);
      } else lines.forEach((row, i) => text(row, MARGIN + 10, y - 17 - i * 11, 8.4));
      let x = MARGIN + widths[0];
      for (let i = 1; i < headers.length; i++) {
        const tone = people ? [colors.ink, colors.ink, colors.green, colors.sky, colors.slate, colors.red, colors.green][i]
          : i === 1 ? colors.sky : i === 2 ? colors.green : colors.red;
        const percent = people ? i >= 5 : i === 3;
        rightText(`${cells[i]}${percent ? "%" : ""}`, x + widths[i] - 9, y - (people ? 17 : 18), 8.8, true, tone);
        if (people && percent) track(x + 10, y - 25, widths[i] - 19, Number(cells[i]), tone, 2.5);
        x += widths[i];
      }
      y -= height;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.35, color: colors.line });
    };
    ensure(34 + (rows.length ? rowLayout(rows[0]).height : 0));
    drawHeader();
    rows.forEach((cells, index) => {
      const layout = rowLayout(cells);
      if (y - layout.height < BOTTOM) continueTable();
      // Very long names can span pages; repeat their identifier and values on each segment.
      const capacity = Math.max(1, Math.floor((y - BOTTOM - (people ? 24 : 14)) / 11));
      for (let offset = 0; offset < layout.lines.length; offset += capacity) {
        if (offset) continueTable();
        const lines = layout.lines.slice(offset, offset + capacity);
        drawRow(cells, lines, people ? Math.max(43, lines.length * 11 + 24) : Math.max(29, lines.length * 11 + 14), index);
      }
    });
    y -= 16;
  };

  const monitorTable = (title: string, headers: string[], widths: number[], rows: Array<{ cells: string[]; detail?: string }>) => {
    const header = () => {
      page.drawRectangle({ x: MARGIN, y: y - 34, width: CONTENT, height: 34, color: colors.surface });
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, color: colors.red, thickness: 1.5 });
      let x = MARGIN;
      headers.forEach((label, i) => {
        wrap(label, bold, 7.3, widths[i] - 16).forEach((line, j) => text(line, x + 8, y - 14 - j * 10, 7.3, true, colors.muted));
        x += widths[i];
      });
      y -= 34;
    };
    const layouts = rows.map((row) => {
      const lines = row.cells.map((cell, i) => wrap(cell, normal, 8, widths[i] - 16));
      const detail = row.detail ? wrap(row.detail, normal, 7.1, CONTENT - 16) : [];
      return { lines, detail, height: Math.max(29, Math.max(...lines.map((ls) => ls.length)) * 11 + detail.length * 11 + 15) };
    });
    ensure(34 + (layouts[0]?.height || 0));
    header();
    layouts.forEach((row, index) => {
      if (y - row.height < BOTTOM) {
        newPage();
        heading(`${title} - continuación`, "activity");
        header();
      }
      page.drawRectangle({ x: MARGIN, y: y - row.height, width: CONTENT, height: row.height, color: index % 2 ? colors.surface : colors.white });
      let x = MARGIN;
      row.lines.forEach((lines, i) => {
        lines.forEach((line, j) => text(line, x + 8, y - 15 - j * 11, 8, false, i ? colors.ink : colors.red));
        x += widths[i];
      });
      const primaryHeight = Math.max(...row.lines.map((ls) => ls.length)) * 11;
      row.detail.forEach((line, j) => text(line, MARGIN + 8, y - 16 - primaryHeight - j * 11, 7.1, false, colors.muted));
      y -= row.height;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, color: colors.line, thickness: 0.35 });
    });
    y -= 16;
  };

  newPage();
  const projectLines = wrap(`${reporte.proyecto}  /  ${reporte.db}`, normal, 10.5, CONTENT - 155);
  const heroHeight = 116 + (projectLines.length - 1) * 13;
  box(MARGIN, y, CONTENT, heroHeight, colors.red, 13);
  box(MARGIN + 12, y - 12, 119, 18, colors.redDark, 5);
  text("RESUMEN OPERATIVO", MARGIN + 21, y - 24, 7.4, true, colors.white);
  text("Reporte de rendimiento", MARGIN + 20, y - 56, 22, true, colors.white);
  projectLines.forEach((row, i) => text(row, MARGIN + 20, y - 78 - i * 13, 10.5, false, colors.white));
  icon("clock", MARGIN + 20, y - heroHeight + 31, 12, colors.white);
  text(`${reporte.desde}  al  ${reporte.hasta}`, MARGIN + 38, y - heroHeight + 21, 9, false, colors.white);
  const gaugeX = WIDTH - MARGIN - 66, gaugeY = y - heroHeight / 2 + 7;
  page.drawCircle({ x: gaugeX, y: gaugeY, size: 34, borderColor: colors.white, borderWidth: 3, borderOpacity: 0.22 });
  const pct = Math.max(0, Math.min(100, reporte.kpis.tasa_cumplimiento));
  if (pct > 0) {
    const angle = pct / 100 * Math.PI * 2 - Math.PI / 2;
    const arc = pct === 100 ? "M34 0 A34 34 0 1 1 34 68 A34 34 0 1 1 34 0"
      : `M34 0 A34 34 0 ${pct > 50 ? 1 : 0} 1 ${34 + Math.cos(angle) * 34} ${34 + Math.sin(angle) * 34}`;
    page.drawSvgPath(arc, { x: gaugeX - 34, y: gaugeY + 34, borderColor: colors.white, borderWidth: 3 });
  }
  const completion = `${reporte.kpis.tasa_cumplimiento}%`, gaugeSize = completion.length > 5 ? 15 : 20;
  text(completion, gaugeX - bold.widthOfTextAtSize(completion, gaugeSize) / 2, gaugeY - 7, gaugeSize, true, colors.white);
  text("CUMPLIMIENTO", gaugeX - 33, gaugeY - 53, 7, true, colors.white);
  y -= heroHeight + 13;
  const scopeRows = wrap(`Alcance: ${reporte.persona ? reporte.persona.nombre : "Todo el equipo"}`, normal, 8.5, CONTENT - 30);
  icon("users", MARGIN + 1, y + 1, 12, colors.red);
  scopeRows.forEach((row, i) => text(row, MARGIN + 21, y - 9 - i * 12, 8.5, false, colors.muted));
  y -= scopeRows.length * 12 + 15;

  heading("Indicadores del per\u00edodo", "tasks", 198);
  const k = reporte.kpis;
  const metrics: Array<{ label: string; value: string; color: Color; pale: Color; glyph: Icon; percent?: number }> = [
    { label: "TAREAS TOTALES", value: String(k.total), color: colors.sky, pale: colors.skyPale, glyph: "tasks" },
    { label: "FINALIZADAS", value: String(k.completadas), color: colors.green, pale: colors.greenPale, glyph: "check" },
    { label: "EN PROCESO", value: String(k.proceso), color: colors.sky, pale: colors.skyPale, glyph: "activity" },
    { label: "PENDIENTES", value: String(k.pendientes), color: colors.slate, pale: colors.slatePale, glyph: "clock" },
    { label: "ATRASADAS", value: String(k.atrasadas), color: colors.danger, pale: colors.dangerPale, glyph: "alert" },
    { label: "AVANCE PROMEDIO", value: `${k.avance_promedio}%`, color: colors.red, pale: colors.redPale, glyph: "trend", percent: k.avance_promedio },
    { label: "CUMPLIMIENTO", value: `${k.tasa_cumplimiento}%`, color: colors.green, pale: colors.greenPale, glyph: "check", percent: k.tasa_cumplimiento },
  ];
  for (const group of [metrics.slice(0, 4), metrics.slice(4)]) {
    const width = (CONTENT - (group.length - 1) * 8) / group.length;
    const height = group.length === 4 ? 64 : 58;
    group.forEach((metric, i) => {
      const x = MARGIN + i * (width + 8);
      box(x, y - 1, width, height + 1, colors.surface, 9);
      box(x, y, width, height, colors.white, 9, colors.line);
      box(x + width - 30, y - 10, 20, 20, metric.pale, 6);
      icon(metric.glyph, x + width - 26, y - 14, 12, metric.color);
      text(metric.label, x + 11, y - 18, 6.8, true, colors.muted);
      let size = 23;
      while (bold.widthOfTextAtSize(metric.value, size) > width - 23 && size > 12) size--;
      text(metric.value, x + 11, y - 43, size, true, metric.color);
      if (metric.percent !== undefined) track(x + 11, y - 50, width - 22, metric.percent, metric.color, 3);
    });
    y -= height + 8;
  }
  y -= 7;
  if (!k.total) note("Sin tareas para los filtros seleccionados.");
  heading("Desglose por persona", "users", 132);
  if (reporte.personas.length) {
    table("personas", reporte.personas.map((p) => [p.Nombre, String(p.total), String(p.completadas), String(p.proceso), String(p.pendientes), String(p.avance_promedio), String(p.cumplimiento), String(p.Per_Cod)]));
    note("Una tarea compartida cuenta para cada persona asignada. La suma por persona puede superar el total del resumen.");
  } else note("Sin personas para los filtros seleccionados.");

  const points = reporte.dias;
  heading("Actividad y evoluci\u00f3n diaria", "chart", points.length > 1 ? 252 : 140);
  if (!points.length) note("Sin actividad diaria disponible para el per\u00edodo.");
  else {
    if (points.length > 1) {
      const top = y, height = 192;
      box(MARGIN, top, CONTENT, height, colors.white, 10, colors.line);
      const legends = [
        { label: `${points.reduce((s, p) => s + p.avances, 0)} avances`, color: colors.sky },
        { label: `${points.reduce((s, p) => s + p.completadas, 0)} finalizadas`, color: colors.green },
        { label: "Avance promedio (%)", color: colors.red },
      ];
      legends.forEach((s, i) => {
        const x = MARGIN + 16 + i * 154;
        page.drawCircle({ x: x + 3, y: top - 20, size: 2.5, color: s.color });
        text(s.label, x + 12, top - 23, 8, true, s.color);
      });
      const chartX = MARGIN + 35, chartY = top - height + 32, chartW = CONTENT - 71, chartH = 116;
      const max = Math.max(4, Math.ceil(Math.max(...points.map((d) => Math.max(d.avances, d.completadas))) / 4) * 4);
      for (let i = 0; i <= 4; i++) {
        const pos = chartY + i * chartH / 4;
        page.drawLine({ start: { x: chartX, y: pos }, end: { x: chartX + chartW, y: pos }, thickness: 0.5, color: colors.line, dashArray: [2, 3] });
        rightText(String(max * i / 4), chartX - 9, pos - 2.5, 7, false, colors.muted);
        text(`${i * 25}%`, chartX + chartW + 7, pos - 2.5, 7, false, colors.red);
      }
      const series = [{ key: "avances" as const, color: colors.sky, max }, { key: "completadas" as const, color: colors.green, max }, { key: "avance_promedio" as const, color: colors.red, max: 100 }];
      series.forEach((s) => {
        const coords = points.map((p, i) => ({ x: chartX + i * chartW / (points.length - 1), y: chartY + Math.max(0, Math.min(s.max, p[s.key])) * chartH / s.max }));
        if (s.key === "avances") {
          const area = `M0 ${chartH} ${coords.map((p) => `L${p.x - chartX} ${chartH - (p.y - chartY)}`).join(" ")} L${chartW} ${chartH} Z`;
          page.drawSvgPath(area, { x: chartX, y: chartY + chartH, color: colors.sky, opacity: 0.06 });
        }
        coords.forEach((p, i) => {
          if (i) page.drawLine({ start: coords[i - 1], end: p, thickness: s.key === "avance_promedio" ? 1.3 : 1.7, color: s.color, dashArray: s.key === "avance_promedio" ? [3, 2] : undefined });
          if (points.length <= 14) page.drawCircle({ x: p.x, y: p.y, size: 2, color: colors.white, borderColor: s.color, borderWidth: 1 });
        });
      });
      const indexes = Array.from(new Set([0, Math.round((points.length - 1) / 3), Math.round((points.length - 1) * 2 / 3), points.length - 1]));
      indexes.forEach((i) => {
        const label = new Date(`${points[i].dia}T12:00:00-05:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" });
        text(label, chartX + i * chartW / (points.length - 1) - normal.widthOfTextAtSize(printable(label, normal), 7) / 2, chartY - 16, 7, false, colors.muted);
      });
      y -= height + 17;
      if (points[0].dia !== reporte.desde || points[points.length - 1].dia !== reporte.hasta) paragraph(`Serie diaria disponible: ${points[0].dia} al ${points[points.length - 1].dia}.`);
    }
    ensure(92);
    text("DETALLE DIARIO", MARGIN, y - 5, 8, true, colors.muted);
    y -= 18;
    table("diario", points.map((p) => [p.dia, String(p.avances), String(p.completadas), String(p.avance_promedio)]));
  }
  paragraph("Cumplimiento: porcentaje de tareas finalizadas. Los indicadores conservan los c\u00e1lculos y filtros de Gesti\u00f3n; no reconstruyen el estado hist\u00f3rico de las tareas.");

  newPage();
  heading("Monitoreo y telemetría del equipo", "activity", 180);
  paragraph(`Período consultado: ${reporte.desde} al ${reporte.hasta} | Proyecto: ${reporte.proyecto}`);
  y -= 7;
  if (reporte.monitoreo.telemetria_consultada && !reporte.monitoreo.desarrolladores.some((p) => p.registros > 0)) {
    const available = reporte.monitoreo.rango_disponible;
    note(available
      ? `No hay telemetría en el período seleccionado. Existen registros del ${available.desde} al ${available.hasta}. Selecciona esas fechas en el dashboard y vuelve a exportar.`
      : "No hay telemetría en el período consultado para esta selección en el proyecto.");
  }
  note("Apertura: primera comunicación diaria confirmada por el servidor. El agente no registra un cierre de sesión: se muestra como No registrado y la última señal aparece por separado. Horas en America/Guayaquil.");
  note("Tiempo activo: suma de los segundos enviados por ExaMonitor, independiente del intervalo entre conexiones. Las líneas de código son estimadas.");
  for (const aviso of reporte.monitoreo.avisos) note(aviso);
  const display = (value: number | null, suffix = "") => value == null ? "Sin datos" : `${value}${suffix}`;
  const monitorPeople = reporte.monitoreo.desarrolladores;
  if (!monitorPeople.length) note("Sin datos de monitoreo para los filtros seleccionados.");
  else monitorTable("Monitoreo del equipo", ["Desarrollador", "Tiempo activo", "Actividad %", "Clics", "Teclas"],
    [175, 110, 80, 75, CONTENT - 440], monitorPeople.map((p) => ({ cells: [
      `${p.Nombre} (#${p.Per_Cod})`, p.registros ? duracionMonitoreo(p.segundos_activos) : "Sin telemetría", display(p.actividad, "%"), display(p.clicks), display(p.teclas),
    ] })));

  for (const monitor of monitorPeople.filter((p) => p.dias.length > 0)) {
    newPage();
    heading("Telemetría por desarrollador", "users");
    for (const line of wrap(monitor.Nombre, bold, 14, CONTENT)) {
      ensure(20);
      text(line, MARGIN, y, 14, true, colors.red);
      y -= 19;
    }
    paragraph(`#${monitor.Per_Cod} | ${reporte.desde} al ${reporte.hasta} | America/Guayaquil`);
    y -= 8;
    ensure(86);
    const values = [
      { label: "TIEMPO ACTIVO REPORTADO", value: duracionMonitoreo(monitor.segundos_activos), color: colors.red },
      { label: "ACTIVIDAD PROMEDIO", value: display(monitor.actividad, "%"), color: colors.sky },
      { label: "CLICS", value: display(monitor.clicks), color: colors.green },
      { label: "TECLAS", value: display(monitor.teclas), color: colors.slate },
    ];
    const widths = [160, 140, 100, CONTENT - 400];
    let tileX = MARGIN;
    values.forEach((metric, i) => {
      box(tileX, y, widths[i] - 8, 59, colors.surface, 8);
      text(metric.label, tileX + 9, y - 17, 6.5, true, colors.muted);
      let size = 17;
      while (bold.widthOfTextAtSize(metric.value, size) > widths[i] - 25 && size > 9) size--;
      text(metric.value, tileX + 9, y - 42, size, true, metric.color);
      tileX += widths[i];
    });
    y -= 77;
    paragraph(`Capturas: ${display(monitor.capturas)} | Líneas estimadas: ${display(monitor.lineas)} | Registros de telemetría: ${monitor.registros}`);
    y -= 8;
    const localHour = (v: string | null) => v ? fmtFechaHoraZona(v, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "Sin registro";
    monitorTable(`Monitoreo diario #${monitor.Per_Cod}`,
      ["Fecha", "Primera conexión", "Cierre de sesión", "Última señal", "Tiempo activo"],
      [85, 105, 105, 105, CONTENT - 400], monitor.dias.map((d) => ({
        cells: [d.fecha, localHour(d.primera_conexion), d.cierre_sesion ? localHour(d.cierre_sesion) : "No registrado", localHour(d.ultima_senal), duracionMonitoreo(d.segundos_activos)],
        detail: `Actividad: ${display(d.actividad, "%")} | Clics: ${display(d.clicks)} | Teclas: ${display(d.teclas)} | Líneas estimadas: ${display(d.lineas)} | Capturas: ${display(d.capturas)} | Registros: ${d.registros}`,
      })));
    if (monitor.procesos.length) {
      ensure(110);
      text("PROCESOS REGISTRADOS CON MAYOR FRECUENCIA", MARGIN, y - 5, 8, true, colors.muted);
      y -= 18;
      monitorTable(`Procesos #${monitor.Per_Cod}`, ["Proceso", "Registros", "% de telemetría"],
        [CONTENT - 190, 85, 105], monitor.procesos.map((p) => ({ cells: [
          `${p.nombre}${p.es_ide ? " (IDE)" : ""}`, String(p.registros), `${p.porcentaje}%`,
        ] })));
    }
    if (!monitor.registros) note("Hay señales de conexión, pero no telemetría en este período. No se dispone de tiempo activo ni de métricas de interacción.");
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    page.drawLine({ start: { x: MARGIN, y: 43 }, end: { x: WIDTH - MARGIN, y: 43 }, thickness: 0.6, color: colors.line });
    page.drawLine({ start: { x: MARGIN, y: 43 }, end: { x: MARGIN + 31, y: 43 }, thickness: 2, color: colors.red });
    text("EXA CONTABLE", MARGIN, 27, 7, true, colors.red);
    text("Gesti\u00f3n de tareas | Reporte de rendimiento", MARGIN + 84, 27, 7, false, colors.muted);
    box(WIDTH - MARGIN - 48, 36, 48, 18, colors.surface, 6);
    rightText(`${i + 1} / ${pages.length}`, WIDTH - MARGIN - 10, 24, 8, true, colors.muted);
  });
  return doc.save();
}
