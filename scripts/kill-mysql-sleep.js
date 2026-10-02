/* Liberar conexiones Sleep de MySQL (root) */
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient({
  datasources: {
    db: { url: "mysql://root@127.0.0.1:3306/exa?connection_limit=1" },
  },
});

(async () => {
  try {
    const status = await p.$queryRawUnsafe(
      "SHOW STATUS LIKE 'Threads_connected'"
    );
    console.log("BEFORE", JSON.stringify(status));

    const sleeps = await p.$queryRawUnsafe(
      "SELECT id, user, command, time FROM information_schema.processlist WHERE command = 'Sleep' AND time > 15 AND user = 'root'"
    );
    console.log("SLEEP_COUNT", sleeps.length);

    for (const s of sleeps) {
      const id = Number(s.id);
      try {
        await p.$executeRawUnsafe(`KILL ${id}`);
        console.log("KILLED", id, "time=", s.time);
      } catch (e) {
        console.log("KILL_FAIL", id, e.message);
      }
    }

    const after = await p.$queryRawUnsafe(
      "SHOW STATUS LIKE 'Threads_connected'"
    );
    console.log("AFTER", JSON.stringify(after));
  } catch (e) {
    console.error("ERR", e.message);
    process.exitCode = 1;
  } finally {
    await p.$disconnect();
  }
})();
