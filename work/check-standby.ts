// Script de diagnostico local (no se commitea): lista los avances con nota de standby.
import { getPrisma } from "@/lib/db";

async function main() {
  const prisma = getPrisma("exa");
  const recientes = await prisma.$queryRawUnsafe<
    Array<{ Ava_Cod: number; Tar_Cod: number; Ava_Fecha: Date; Ava_Descripcion: string | null }>
  >(
    `SELECT av.Ava_Cod, av.Tar_Cod, av.Ava_Fecha, av.Ava_Descripcion
       FROM aud_tareas_avances av
      WHERE av.Ava_Est = 'A'
      ORDER BY av.Ava_Fecha DESC, av.Ava_Cod DESC
      LIMIT 8`
  );
  console.log("ultimos avances:");
  for (const r of recientes) {
    console.log(
      `#${r.Tar_Cod} av${r.Ava_Cod} ${new Date(r.Ava_Fecha).toISOString()}`,
      "|",
      String(r.Ava_Descripcion ?? "").replace(/\s+/g, " ").slice(0, 140)
    );
  }
  const filas = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM aud_tareas_avances`
  );
  console.log("total avances:", String(filas[0]?.n));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exit(1);
});
