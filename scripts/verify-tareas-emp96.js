/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient({
  datasources: { db: { url: "mysql://root@127.0.0.1:3306/exa" } },
});

async function main() {
  const total = await p.aud_tareas.count({
    where: { Tar_Est: "A", Emp_Cod: 96 },
  });
  const sample = await p.aud_tareas.findMany({
    where: { Tar_Est: "A", Emp_Cod: 96 },
    select: { Tar_Cod: true, Tar_Titulo: true, Tar_Estado: true },
    orderBy: { Tar_Cod: "desc" },
    take: 5,
  });
  const asig = await p.aud_tareas_asignadas.count({
    where: { Tas_Est: "A", tarea: { Emp_Cod: 96, Tar_Est: "A" } },
  });
  console.log(
    JSON.stringify(
      { Emp_Cod: 96, Dat_Dis: "exa", total_activas: total, asignaciones: asig, sample },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
