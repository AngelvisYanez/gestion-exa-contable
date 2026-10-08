import { spawnSync } from "node:child_process";

const bins = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
const args = ["-m", "unittest", "discover", "-s", "agente_monitoreo", "-p", "test_*.py"];

for (const bin of bins) {
  const result = spawnSync(bin, args, { stdio: "inherit" });
  if (result.error && result.error.code === "ENOENT") continue;
  process.exit(result.status ?? 1);
}

console.error("No se encontro Python para los tests del agente.");
process.exit(1);
