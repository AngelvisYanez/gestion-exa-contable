import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  await prisma.$transaction(async (db) => {
    const marker = `Prueba local ${Date.now()}`;
    await db.$executeRaw`INSERT INTO aud_capacitaciones (Cap_Titulo, Cap_Empresa, Cap_Cliente, Cap_Proyecto, Cap_Responsable_Per_Cod, Cap_Responsable_Nombre, Cap_Inicio, Cap_Duracion_Min, Cap_Creador, Cap_Creada, Cap_Actualizada) VALUES (${marker}, ${"Empresa prueba"}, ${"Cliente prueba"}, ${"exa"}, ${1}, ${"Responsable prueba"}, ${new Date()}, ${60}, ${0}, NOW(), NOW())`;
    const rows = await db.$queryRaw`SELECT Cap_Cod, Cap_Estado, Cap_Proyecto, Cap_Responsable_Per_Cod, Cap_Responsable_Nombre FROM aud_capacitaciones WHERE Cap_Titulo = ${marker} LIMIT 1`;
    if (rows.length !== 1 || rows[0].Cap_Estado !== "Programada" || rows[0].Cap_Proyecto !== "exa" || rows[0].Cap_Responsable_Per_Cod !== 1 || rows[0].Cap_Responsable_Nombre !== "Responsable prueba") throw new Error("No se creó la sesión con proyecto y responsable");
    const id = rows[0].Cap_Cod;
    const updated = await db.$executeRaw`UPDATE aud_capacitaciones SET Cap_Estado = 'Finalizada', Cap_Finalizada = NOW(), Cap_Actualizada = NOW() WHERE Cap_Cod = ${id} AND Cap_Estado = 'Programada'`;
    const finished = await db.$queryRaw`SELECT Cap_Estado, Cap_Finalizada FROM aud_capacitaciones WHERE Cap_Cod = ${id}`;
    if (updated !== 1 || finished[0].Cap_Estado !== "Finalizada" || !finished[0].Cap_Finalizada) throw new Error("No se finalizó la sesión");
    console.log("Creación, consulta y finalización: OK");
    throw new Error("ROLLBACK_TEST");
  });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "ROLLBACK_TEST") throw error;
} finally {
  await prisma.$disconnect();
}
