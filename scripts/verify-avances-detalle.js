/* eslint-disable @typescript-eslint/no-require-imports */
// Solo lectura: valida las consultas de detalle de tarea / actividad de avances.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const host = process.env.DATABASE_HOST || "127.0.0.1";
const port = process.env.DATABASE_PORT || "3306";
const user = process.env.DATABASE_USER || "root";
const pass = process.env.DATABASE_PASSWORD || "";
const auth = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}` : encodeURIComponent(user);
const p = new PrismaClient({ datasources: { db: { url: `mysql://${auth}@${host}:${port}/exa` } } });

async function main() {
  const lista = await p.$queryRawUnsafe(
    `SELECT t.Tar_Cod,
            LEFT(CONVERT(t.Tar_Descripcion USING utf8mb4), 280) AS Tar_Descripcion,
            (SELECT MAX(av.Ava_Fecha) FROM aud_tareas_avances av WHERE av.Tar_Cod = t.Tar_Cod AND av.Ava_Est = 'A') AS Ava_Ultima_Fecha,
            (SELECT COUNT(*) FROM aud_tareas_avances av WHERE av.Tar_Cod = t.Tar_Cod AND av.Ava_Est = 'A') AS Ava_Total
     FROM aud_tareas t WHERE t.Tar_Est = 'A' AND t.Emp_Cod = 96
     ORDER BY Ava_Total DESC LIMIT 3`
  );
  const tarCod = Number(lista[0]?.Tar_Cod || 0);

  const avances = await p.$queryRawUnsafe(
    `SELECT av.Ava_Cod, av.Ava_Porcentaje, av.Ava_Fecha,
            CONVERT(av.Ava_Descripcion USING utf8mb4) AS Ava_Descripcion,
            CONVERT(TRIM(CONCAT(IFNULL(pe.Prs_Ape,''), ' ', IFNULL(pe.Prs_Nom,''))) USING utf8mb4) AS Autor
     FROM aud_tareas_avances av
     LEFT JOIN usuarios u ON u.Usu_Cod = av.Usu_Cod
     LEFT JOIN persona pe ON pe.Prs_Cod = u.Prs_Cod
     WHERE av.Ava_Est = 'A' AND av.Tar_Cod IN (?)
     ORDER BY av.Ava_Fecha ASC LIMIT 5`,
    tarCod
  );

  const tel = await p.$queryRawUnsafe(
    `SELECT COUNT(*) AS registros, SUM(Tel_Segundos_Activos) AS segundos,
            SUM(CASE WHEN Tel_Captura_Ruta IS NOT NULL AND Tel_Captura_Ruta <> '' THEN 1 ELSE 0 END) AS capturas
     FROM aud_dev_telemetria WHERE Tar_Cod = ?`,
    tarCod
  );

  const tiempo = await p.$queryRawUnsafe(
    `SELECT Tar_Cod, DATE(Tel_Fecha_Hora) AS Dia, SUM(Tel_Segundos_Activos) AS segundos
     FROM aud_dev_telemetria WHERE Tel_Fecha_Hora >= ?
     GROUP BY Tar_Cod, DATE(Tel_Fecha_Hora) LIMIT 5`,
    new Date(Date.now() - 30 * 86400000)
  );

  console.log(
    JSON.stringify({ lista, tarCod, avances, tel, tiempo }, (_k, v) => (typeof v === "bigint" ? Number(v) : v), 2)
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
