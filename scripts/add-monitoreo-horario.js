const { PrismaClient } = require("@prisma/client");

const ALTERS = {
  Mon_Horario_Activo:
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Horario_Activo TINYINT NOT NULL DEFAULT 0",
  Mon_Hora_Inicio:
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Inicio VARCHAR(5) NOT NULL DEFAULT '08:00'",
  Mon_Hora_Fin:
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Hora_Fin VARCHAR(5) NOT NULL DEFAULT '17:00'",
  Mon_Dias_Laborales:
    "ALTER TABLE aud_dev_monitoreo_config ADD COLUMN Mon_Dias_Laborales VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5'",
};

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const [column, sql] of Object.entries(ALTERS)) {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        "aud_dev_monitoreo_config",
        column
      );
      if (Number(rows[0].n) === 0) {
        await prisma.$executeRawUnsafe(sql);
        console.log("added", column);
      } else {
        console.log("ok", column);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
