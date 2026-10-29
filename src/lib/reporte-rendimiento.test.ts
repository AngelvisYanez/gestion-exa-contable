import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  buildReporteRendimiento, buildRendimientoCsv, nombreReporteRendimiento,
  type FuenteRendimiento,
} from "./reporte-rendimiento";
import { buildRendimientoPdf } from "./reporte-rendimiento-pdf";
import { buildMonitoreoReporte } from "./reporte-monitoreo";

const generated = new Date("2026-10-29T15:30:00.000Z");
const project = { db: "exa", nombre: "EXA" };

function fuente(personas = 2, dias = 7): FuenteRendimiento {
  const porAsignado = Array.from({ length: personas }, (_, i) => ({
    Per_Cod: i + 1, Nombre: i === 0 ? 'María Núñez, "Área contable"' : `Colaborador ${i + 1}`,
    total: 5, completadas: 2, proceso: 2, pendientes: 1, avance_promedio: 65, cumplimiento: 40,
  }));
  const serieEquipo = Array.from({ length: dias }, (_, i) => ({
    dia: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10), label: `${i + 1}`,
    avances: i % 8, completadas: i % 3, avance_promedio: 65, tareas: 5, autores: 2,
  }));
  return {
    kpis: { total: personas * 5, completadas: personas * 2, proceso: personas * 2,
      pendientes: personas, atrasadas: 0, avance_promedio: personas ? 65 : 0, tasa_cumplimiento: personas ? 40 : 0 },
    porAsignado, serieEquipo, desarrolladores: porAsignado.map(({ Per_Cod, Nombre }) => ({ Per_Cod, Nombre })),
    monitoreo: buildMonitoreoReporte({ personas: porAsignado, desde: "2026-08-01", hasta: serieEquipo.at(-1)?.dia || "2026-08-01",
      telemetria: porAsignado.slice(0, 2).flatMap((p) => serieEquipo.slice(0, 7).map((d) => ({
        Per_Cod: p.Per_Cod, fecha: d.dia, ultima_senal: `${d.dia}T22:05:00.000Z`,
        registros: 50, segundos: 5400, actividad: 75, clicks: 120, teclas: 340, lineas: 8, capturas: 20,
      }))),
      conexiones: porAsignado.slice(0, 2).flatMap((p) => serieEquipo.slice(0, 7).map((d) => ({
        Per_Cod: p.Per_Cod, Fecha: d.dia, Primera_Conexion: `${d.dia}T13:00:00.000Z`,
      }))),
      presencias: [], procesos: porAsignado.slice(0, 2).map((p) => ({ Per_Cod: p.Per_Cod, nombre: "code.exe", registros: 50, es_ide: 1 })),
    }),
    filtro: { perCod: null }, rango: { desde: "2026-08-01", hasta: serieEquipo.at(-1)?.dia || "2026-08-01", min: "2026-08-01", max: "2026-10-29" },
  };
}

test("el reporte conserva los KPIs y captura los datos del período cargado", () => {
  const source = fuente();
  const report = buildReporteRendimiento(source, project, generated);
  assert.deepEqual(report.kpis, source.kpis);
  assert.deepEqual(report.personas, source.porAsignado);
  assert.equal(report.desde, source.rango.desde);
  assert.equal(report.hasta, source.rango.hasta);
  assert.equal(report.generado, generated.toISOString());
  source.porAsignado[0].Nombre = "Cambio posterior";
  source.serieEquipo[0].avances = 99;
  source.kpis.total = 100;
  source.monitoreo.desarrolladores[0].dias[0].segundos_activos = 99;
  assert.equal(report.personas[0].Nombre, 'María Núñez, "Área contable"');
  assert.equal(report.dias[0].avances, 0);
  assert.equal(report.kpis.total, 10);
  assert.equal(report.monitoreo.desarrolladores[0].dias[0].segundos_activos, 5400);
});

test("el filtro de persona limita el desglose y figura en el nombre del archivo", () => {
  const source = fuente();
  source.filtro.perCod = 2;
  const report = buildReporteRendimiento(source, project, generated);
  assert.deepEqual(report.persona, { codigo: 2, nombre: "Colaborador 2" });
  assert.deepEqual(report.personas.map((p) => p.Per_Cod), [2]);
  assert.deepEqual(report.monitoreo.desarrolladores.map((p) => p.Per_Cod), [2]);
  assert.equal(nombreReporteRendimiento(report, "pdf"), "rendimiento-exa-persona-2-2026-08-01-2026-08-07.pdf");
});

test("el CSV incluye BOM, metadatos, cifras originales y escapa comillas y separadores", () => {
  const report = buildReporteRendimiento(fuente(), project, generated);
  report.personas[0].Nombre = 'María; Núñez, "Contabilidad"\nEquipo';
  const csv = buildRendimientoCsv(report);
  assert.ok(csv.startsWith('\uFEFF"Proyecto";"Base";"Desde";"Hasta";"Generado (UTC)"'));
  assert.ok(csv.includes('"EXA";"exa";"2026-08-01";"2026-08-07";"2026-10-29T15:30:00.000Z";1;"María; Núñez, ""Contabilidad""\nEquipo";5;2;2;1;65;40;'));
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(nombreReporteRendimiento(report, "csv"), "rendimiento-exa-equipo-2026-08-01-2026-08-07.csv");
});

test("el CSV neutraliza fórmulas incluso con espacios o controles iniciales", () => {
  for (const value of ['=HYPERLINK("https://example.com")', '+SUM(1;2)', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r\n@SUM(A1)']) {
    const report = buildReporteRendimiento(fuente(1), project, generated);
    report.personas[0].Nombre = value;
    report.proyecto = value;
    assert.ok(buildRendimientoCsv(report).includes(`"'${value.replace(/"/g, '""')}"`));
  }
});

test("sin personas el CSV conserva los encabezados sin inventar filas", () => {
  const csv = buildRendimientoCsv(buildReporteRendimiento(fuente(0, 0), project, generated));
  assert.equal(csv.split("\r\n").length, 2);
});

test("el CSV incluye telemetría acumulada y deja el cierre sin inventar", () => {
  const report = buildReporteRendimiento(fuente(), project, generated);
  const csv = buildRendimientoCsv(report);
  assert.ok(csv.includes('"No registrado"'));
  assert.ok(csv.includes(';37800;75;840;2380;56;140;350;"disponible"'));
  assert.ok(csv.includes('"Tiempo activo reportado (segundos)"'));
});

for (const scenario of ["equipo", "persona", "vacio", "muchas-filas"] as const) {
  test(`PDF válido y paginado: ${scenario}`, async () => {
    const source = scenario === "vacio" ? fuente(0, 0) : scenario === "muchas-filas" ? fuente(85, 90) : scenario === "persona" ? fuente(2, 1) : fuente();
    if (scenario === "persona") {
      source.filtro.perCod = 1;
      source.serieEquipo = source.serieEquipo.slice(0, 1);
      source.rango.hasta = source.rango.desde;
      source.kpis = { ...source.kpis, total: 5, completadas: 2, proceso: 2, pendientes: 1 };
    }
    if (scenario === "muchas-filas") source.porAsignado[2].Nombre = "NombreExtremadamenteLargoSinEspacios".repeat(9);
    const report = buildReporteRendimiento(source, project, generated);
    const logo = await readFile(path.join(process.cwd(), "public", "logo-1.png"));
    const bytes = await buildRendimientoPdf(report, { logo });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getTitle(), "Rendimiento - EXA");
    assert.ok(pdf.getPageCount() >= 1);
    if (scenario === "persona") assert.ok(pdf.getPageCount() >= 3);
    if (scenario === "muchas-filas") assert.ok(pdf.getPageCount() >= 5);
    assert.ok(pdf.getPages().every((page) => Math.round(page.getWidth()) === 595 && Math.round(page.getHeight()) === 842));
    if (process.env.RENDIMIENTO_QA_DIR) {
      await mkdir(process.env.RENDIMIENTO_QA_DIR, { recursive: true });
      await writeFile(path.join(process.env.RENDIMIENTO_QA_DIR, `${scenario}.pdf`), bytes);
      await writeFile(path.join(process.env.RENDIMIENTO_QA_DIR, `${scenario}.csv`), buildRendimientoCsv(report), "utf8");
    }
  });
}
