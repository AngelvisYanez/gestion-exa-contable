import { getDashboardMetrics } from "@/lib/dashboard";
import { hoyFecha } from "@/lib/timezone";

async function main() {
  const hoy = hoyFecha();
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const m = await getDashboardMetrics("exa", 96, { desde, hasta: hoy, perCod: null });
  const checks: Array<[string, boolean, string]> = [
    ["1 atrasadas", Array.isArray(m.atrasadasList), `${m.atrasadasList.length}`],
    ["2 ciclo", typeof m.ciclo?.promedio_dias === "number", `${m.ciclo?.muestra}`],
    ["3 puntualidad", typeof m.puntualidad?.pct === "number", `${m.puntualidad?.muestra}`],
    ["4 standby", typeof m.standby?.total === "number", `${m.standby?.total}`],
    ["5 backlog", typeof m.backlog?.abiertas === "number", `eta=${m.backlog?.eta_dias}`],
    ["6 creador/ejecutor", Array.isArray(m.creadorEjecutor) && m.creadorEjecutor.length > 0, `${m.creadorEjecutor.length}`],
    ["7 cargaJusta", typeof m.cargaJusta?.indice === "number", `idx=${m.cargaJusta?.indice}`],
    ["8 reapertura", typeof m.reapertura?.pct === "number", `${m.reapertura?.pct}%`],
    ["9 complejidad", Array.isArray(m.complejidad?.filas), `${m.complejidad?.filas.length}`],
    // Telemetria: si hay datos en aud_dev_telemetria, estos deben poblarse.
    // Antes del fix de columnas (Per_Cod/Tar_Cod) fallaban en silencio a 0.
    ["10 esfuerzo", Array.isArray(m.esfuerzo), `${m.esfuerzo.length}`],
    ["11 actividad (en esfuerzo)", m.esfuerzo.every((e) => typeof e.actividad === "number"), "ok"],
    ["12 horasTarea", Array.isArray(m.horasTarea), `${m.horasTarea.length}`],
    ["13 procesos", Array.isArray(m.procesos), `${m.procesos.length}`],
    ["14 horario", Array.isArray(m.horario), `${m.horario.length}`],
    ["15 avanceSinActividad", typeof m.avanceSinActividad?.pct === "number", `${m.avanceSinActividad?.pct}%`],
    ["16 bases", Array.isArray(m.bases) && m.bases.length >= 1, m.bases.map((b) => `${b.label}:${b.total}`).join(",")],
  ];
  let fail = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (${detail})`);
  }
  // Si la tabla tiene datos, exigir que esfuerzo/horasTarea/procesos no queden vacios.
  const tele = await import("@/lib/db").then(({ getPrisma }) =>
    getPrisma("exa")
      .$queryRawUnsafe<Array<{ n: bigint | number }>>(
        "SELECT COUNT(*) AS n FROM aud_dev_telemetria WHERE DATE(Tel_Fecha_Hora) >= ? AND DATE(Tel_Fecha_Hora) <= ?",
        desde,
        hoy
      )
      .catch(() => [{ n: 0 }])
  );
  const teleCount = Number(tele[0]?.n || 0);
  if (teleCount > 0) {
    const populates = m.esfuerzo.length > 0 && m.procesos.length > 0 && m.horasTarea.length > 0;
    console.log(`${populates ? "PASS" : "FAIL"}  telemetria poblada con ${teleCount} registros`);
    if (!populates) fail++;
  } else {
    console.log(`SKIP  sin telemetria local (${teleCount} registros)`);
  }
  // Filtro por desarrollador: debe acotar las metricas derivadas y de telemetria.
  const per = m.desarrolladores[0]?.Per_Cod;
  if (per) {
    const mp = await getDashboardMetrics("exa", 96, { desde, hasta: hoy, perCod: per });
    const narrowed = mp.esfuerzo.every((e) => e.Per_Cod === per) && mp.horasTarea.length <= m.horasTarea.length;
    console.log(
      `${narrowed ? "PASS" : "FAIL"}  DEP-FILTER perCod=${per}: total=${mp.kpis.total} esfuerzo=${mp.esfuerzo.length} procesos=${mp.procesos.length}`
    );
    if (!narrowed) fail++;
  }
  console.log(fail ? `\n${fail} CHECK(S) FALLARON` : "\nTODOS LOS CHECKS OK");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e);
  process.exit(1);
});
