import { telemetriaPersonal } from "@/lib/tareas";
import { getPrisma } from "@/lib/db";
import { hoyFecha } from "@/lib/timezone";

async function main() {
  const prisma = getPrisma("exa");
  // Toma la persona con mas telemetria en los ultimos 30 dias.
  const rows = await prisma.$queryRawUnsafe<Array<{ Per_Cod: number; n: bigint | number }>>(
    `SELECT Per_Cod, COUNT(*) AS n
     FROM aud_dev_telemetria
     WHERE Tel_Fecha_Hora >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     GROUP BY Per_Cod
     ORDER BY n DESC
     LIMIT 1`
  );
  const per = Number(rows[0]?.Per_Cod || 0);
  console.log(`Per_Cod con telemetria: ${per} (${rows[0]?.n ?? 0} registros)`);
  if (!per) {
    console.log("SKIP  sin telemetria local");
    process.exit(0);
  }
  const hoy = hoyFecha();
  const desde = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const t = await telemetriaPersonal("exa", per, desde, hoy);
  const checks: Array<[string, boolean, string]> = [
    ["horasActivas", t.horasActivas > 0, `${t.horasActivas} h`],
    ["actividad", t.actividad >= 0 && t.registros > 0, `${t.actividad}%`],
    ["registros", t.registros > 0, `${t.registros}`],
    ["porTarea", Array.isArray(t.porTarea), `${t.porTarea.length}`],
    ["procesos", t.procesos.length > 0, `${t.procesos.length}`],
    ["horario", typeof t.horario.pct === "number", t.horario.activo ? `${t.horario.pct}% (${t.horario.hora_inicio}-${t.horario.hora_fin})` : "sin horario activo"],
  ];
  let fail = 0;
  for (const [n, ok, d] of checks) {
    if (!ok) fail++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${n}  (${d})`);
  }
  // Per_Cod invalido -> estructura vacia sin romper.
  const vacio = await telemetriaPersonal("exa", 0, desde, hoy);
  const vacioOk = vacio.registros === 0 && vacio.porTarea.length === 0;
  console.log(`${vacioOk ? "PASS" : "FAIL"}  perCod invalido devuelve vacio`);
  if (!vacioOk) fail++;
  console.log(fail ? `\n${fail} CHECK(S) FALLARON` : "\nTODOS LOS CHECKS OK");
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e);
  process.exit(1);
});
