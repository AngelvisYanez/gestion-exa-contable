import { NextRequest, NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth/session";
import type { ExaAuthUser } from "@/lib/auth/exaLogin";

export const dynamic = "force-dynamic";

/**
 * Solo desarrollo local. Requiere AUTH_DEV_LOGIN=1.
 * POST { cedula?, name?, role? } → setea cookie de sesion.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, message: "No disponible" }, { status: 404 });
  }
  if (String(process.env.AUTH_DEV_LOGIN || "").trim() !== "1") {
    return NextResponse.json(
      { success: false, message: "AUTH_DEV_LOGIN no activo" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const roleRaw = String(body.role || "manager");
  const role =
    roleRaw === "developer" || roleRaw === "atencion" || roleRaw === "manager"
      ? roleRaw
      : "manager";

  const user: ExaAuthUser = {
    username: String(body.cedula || "22600781").replace(/\D/g, "") || "22600781",
    cedula: String(body.cedula || "22600781").replace(/\D/g, "") || "22600781",
    name: String(body.name || "Yanez Angelvis"),
    role,
    projects: ["exa", "servicios", "relavera"],
    perCod: Number(body.perCod || 0) || 0,
    usuCod: Number(body.usuCod || 0) || 0,
    prsCod: Number(body.prsCod || 0) || 0,
    empCod: Number(body.empCod || 96) || 96,
    dbDis: String(body.dbDis || "exa"),
    teamName: String(body.name || "Yanez Angelvis"),
  };

  const res = NextResponse.json({ success: true, user: { name: user.name, role: user.role } });
  await setSessionCookie(res, user);
  return res;
}
