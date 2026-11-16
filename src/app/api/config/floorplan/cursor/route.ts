import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canSeeOversight } from "@/lib/auth/users";
export const dynamic = "force-dynamic";
const usage = new Map<number, { count: number; until: number }>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ message: "No autenticado" }, { status: 401 });
  if (!canSeeOversight(session.role)) return NextResponse.json({ message: "Acceso reservado al encargado" }, { status: 403 });
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ message: "Origen no permitido" }, { status: 403 });
  if (req.headers.get("content-type")?.split(";")[0] !== "application/json")
    return NextResponse.json({ message: "Formato no permitido" }, { status: 415 });
  if (Number(req.headers.get("content-length") || 0) > 5000)
    return NextResponse.json({ message: "Solicitud demasiado grande" }, { status: 413 });
  const key = process.env.CURSOR_API_KEY?.trim();
  if (!key) return NextResponse.json({ message: "Cursor no está configurado en el servidor" }, { status: 503 });
  const body = await req.json().catch(() => null);
  const project = body?.project;
  if (project !== "relavera" && project !== "ofsercont") return NextResponse.json({ message: "Proyecto no válido" }, { status: 400 });
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 4000) return NextResponse.json({ message: "Escribe una pregunta de hasta 4000 caracteres" }, { status: 400 });
  const now = Date.now();
  const current = usage.get(session.usuCod);
  const state = current && current.until > now ? current : { count: 0, until: now + WINDOW_MS };
  if (state.count >= LIMIT) return NextResponse.json({ message: "Límite de cinco consultas por hora alcanzado" }, { status: 429 });
  state.count += 1;
  usage.set(session.usuCod, state);
  try {
    const response = await fetch("https://api.cursor.com/v1/agents", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Consulta del mapa de EXA ${project === "relavera" ? "Relavera" : "Ofsercont"}`,
        prompt: { text: `Responde en español sobre la arquitectura de EXA ${project === "relavera" ? "Relavera" : "Ofsercont"}. Investiga el código y cita rutas concretas. Esta consulta es solo para explicar: no modifiques archivos, no crees commits ni PR, no despliegues ni leas secretos o archivos .env. Si no puedes confirmar algo, indícalo. Pregunta del usuario:\n${question}` },
        repos: [{ url: project === "relavera" ? (process.env.EXA_RELAVERA_REPO || "https://gitlab.com/exacontable/exa-relavera.git") : (process.env.EXA_OFSERCONT_REPO || "https://gitlab.com/exacontable/exa-ofsercont"), startingRef: project === "relavera" ? (process.env.EXA_RELAVERA_CURSOR_REF || "desarrollo") : (process.env.EXA_OFSERCONT_CURSOR_REF || "copia_server") }],
        mode: "plan", workOnCurrentBranch: false, autoCreatePR: false,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return NextResponse.json({ message: `Cursor rechazó la consulta (HTTP ${response.status})` }, { status: 502 });
    const payload = await response.json();
    const url = payload.agent?.url || payload.url;
    if (typeof url !== "string" || !/^https:\/\/cursor\.com\/agents\/[a-zA-Z0-9-]+$/.test(url)) throw new Error("Respuesta inesperada");
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json({ message: "No se pudo iniciar la consulta en Cursor. Inténtalo nuevamente." }, { status: 502 });
  }
}
