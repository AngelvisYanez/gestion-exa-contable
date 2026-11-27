import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth/session";
import { hasAnyRolePermission } from "@/lib/auth/role-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("No autenticado", { status: 401 });
  if (!hasAnyRolePermission(session, ["plan_accion.ver", "configuracion.administrar"])) return new Response("Tu rol no tiene acceso al plan de accion", { status: 403 });
  const project = new URL(req.url).searchParams.get("proyecto");
  if (project !== "relavera" && project !== "ofsercont") return new Response("Proyecto no válido", { status: 400 });
  const html = await readFile(path.join(process.cwd(), `docs/floorplan/${project}.html`), "utf8");
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-ancestors 'self'" } });
}
