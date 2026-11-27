import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasAnyRolePermission } from "@/lib/auth/role-permissions";

export const dynamic = "force-dynamic";
type Project = "relavera" | "ofsercont";
type Mode = "plan" | "agent";
type Conversation = { owner: number; project: Project };
const conversations = new Map<string, Conversation>();
const usage = new Map<number, { count: number; until: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const agentIdPattern = /^bc-[a-zA-Z0-9-]+$/;
const runIdPattern = /^run-[a-zA-Z0-9-]+$/;

async function authorize(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasAnyRolePermission(session, ["plan_accion.ver", "configuracion.administrar"])) return null;
  return session;
}
function authHeader(key: string) { return `Basic ${Buffer.from(`${key}:`).toString("base64")}`; }
function projectRepo(project: Project) {
  return project === "relavera"
    ? { url: process.env.EXA_RELAVERA_REPO || "https://gitlab.com/exacontable/exa-relavera.git", startingRef: process.env.EXA_RELAVERA_CURSOR_REF || "desarrollo" }
    : { url: process.env.EXA_OFSERCONT_REPO || "https://gitlab.com/exacontable/exa-ofsercont", startingRef: process.env.EXA_OFSERCONT_CURSOR_REF || "copia_server" };
}
function error(message: string, status: number) { return NextResponse.json({ message }, { status }); }

export async function POST(req: NextRequest) {
  const session = await authorize(req);
  if (!session) return error("Acceso no autorizado", 403);
  if (req.headers.get("origin") !== req.nextUrl.origin) return error("Origen no permitido", 403);
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json") return error("Formato no permitido", 415);
  if (Number(req.headers.get("content-length") || 0) > 5000) return error("Solicitud demasiado grande", 413);
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) return error("Cursor no está configurado", 503);
  const body = await req.json().catch(() => null);
  const project = body?.project as Project;
  const mode = body?.mode as Mode;
  const prompt = typeof body?.question === "string" ? body.question.trim() : "";
  if (project !== "relavera" && project !== "ofsercont") return error("Proyecto no válido", 400);
  if (mode !== "plan" && mode !== "agent") return error("Acción no válida", 400);
  if (!prompt || prompt.length > 4000) return error("Escribe hasta 4000 caracteres", 400);
  const now = Date.now();
  const current = usage.get(session.usuCod);
  const state = current && current.until > now ? current : { count: 0, until: now + WINDOW_MS };
  if (state.count >= LIMIT) return error("Límite de cinco mensajes por hora alcanzado", 429);
  const agentId = typeof body?.agentId === "string" ? body.agentId : "";
  if (agentId && (!agentIdPattern.test(agentId) || conversations.get(agentId)?.owner !== session.usuCod || conversations.get(agentId)?.project !== project)) return error("Conversación no autorizada", 403);
  state.count++;
  usage.set(session.usuCod, state);
  const instruction = mode === "plan"
    ? "Responde en español. Investiga el código y cita rutas concretas. Solo explica o planifica: no cambies archivos. No leas secretos ni archivos .env."
    : "Responde en español. Implementa la corrección solicitada en una rama nueva, agrega pruebas pertinentes y abre una propuesta para revisión humana. No fusiones ni despliegues. No leas secretos ni archivos .env.";
  try {
    const endpoint = agentId ? `https://api.cursor.com/v1/agents/${agentId}/runs` : "https://api.cursor.com/v1/agents";
    const data = agentId
      ? { prompt: { text: `${instruction}\n\nSolicitud del usuario: ${prompt}` }, mode }
      : { name: `Plan de Acción EXA ${project}`, prompt: { text: `${instruction}\n\nSolicitud del usuario: ${prompt}` }, repos: [projectRepo(project)], mode, workOnCurrentBranch: false, autoCreatePR: true };
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: authHeader(key), "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(30000) });
    if (response.status === 409) return error("Cursor sigue trabajando en el mensaje anterior", 409);
    if (!response.ok) return error(`Cursor rechazó la solicitud (HTTP ${response.status})`, 502);
    const result = await response.json();
    const id = agentId || result.agent?.id;
    const runId = result.run?.id;
    if (typeof id !== "string" || !agentIdPattern.test(id) || typeof runId !== "string" || !runIdPattern.test(runId)) return error("Respuesta inesperada de Cursor", 502);
    conversations.set(id, { owner: session.usuCod, project });
    return NextResponse.json({ agentId: id, runId, url: result.agent?.url || `https://cursor.com/agents/${id}` });
  } catch { return error("No se pudo conectar con Cursor", 502); }
}

export async function GET(req: NextRequest) {
  const session = await authorize(req);
  if (!session) return error("Acceso no autorizado", 403);
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) return error("Cursor no está configurado", 503);
  const agentId = req.nextUrl.searchParams.get("agentId") || "";
  const runId = req.nextUrl.searchParams.get("runId") || "";
  if (!agentIdPattern.test(agentId) || !runIdPattern.test(runId) || conversations.get(agentId)?.owner !== session.usuCod) return error("Conversación no autorizada", 403);
  try {
    const response = await fetch(`https://api.cursor.com/v1/agents/${agentId}/runs/${runId}`, { headers: { Authorization: authHeader(key) }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) return error(`Cursor no respondió (HTTP ${response.status})`, 502);
    const run = await response.json();
    const status = String(run.status || "RUNNING");
    const result = typeof run.result === "string" ? run.result.slice(0, 30000) : "";
    const proposal = run.git?.branches?.find((branch: { prUrl?: string }) => typeof branch.prUrl === "string")?.prUrl;
    const prUrl = typeof proposal === "string" && /^https:\/\/(github\.com|gitlab\.com)\//.test(proposal) ? proposal : null;
    return NextResponse.json({ status, result, prUrl });
  } catch { return error("No se pudo consultar el progreso de Cursor", 502); }
}
