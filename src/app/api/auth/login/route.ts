import { NextRequest, NextResponse } from "next/server";
import { authenticateByCedula } from "@/lib/auth/exaLogin";
import { publicUser, setSessionCookie } from "@/lib/auth/session";
import { PROJECTS } from "@/lib/auth/users";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cedula = String(body.cedula || body.username || "").trim();
    const password = String(body.password || "");
    const dbPrefer = body.Ses_Dat_Dis ? String(body.Ses_Dat_Dis) : undefined;

    if (!cedula || !password) {
      return NextResponse.json(
        { success: false, status: "error", message: "Cedula y contrasena son obligatorias." },
        { status: 400 }
      );
    }

    const { user, reason } = await authenticateByCedula(cedula, password, dbPrefer);
    if (!user) {
      return NextResponse.json(
        { success: false, status: "error", message: reason || "Acceso denegado." },
        { status: 401 }
      );
    }

    const res = NextResponse.json({
      success: true,
      status: "ok",
      user: publicUser(user),
      projects: PROJECTS.filter((p) => user.projects.includes(p.id)),
      redirect: "/",
      db: user.dbDis,
      team: user.teamName,
      panelUrl: "/",
    });
    await setSessionCookie(res, user);
    return res;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    console.error("[login]", mensaje);
    return NextResponse.json(
      { success: false, status: "error", message: mensaje },
      { status: 500 }
    );
  }
}
