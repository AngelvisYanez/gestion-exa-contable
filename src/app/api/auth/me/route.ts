import { NextResponse } from "next/server";
import { getSession, publicUser, setSessionCookie } from "@/lib/auth/session";
import { resolvePerCod } from "@/lib/auth/resolvePer";
import { matchTeamMember, PROJECTS } from "@/lib/auth/users";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
  }

  // Re-resolver Per_Cod por si la cookie quedo con 0 (ficha creada despues del login)
  let perCod = session.perCod;
  if (!perCod || perCod <= 0) {
    const team = matchTeamMember(session.name);
    perCod = await resolvePerCod(tasksDbDis(), {
      prsCod: session.prsCod,
      cedula: session.cedula,
      nameMatch: team?.nameMatch,
      empCod: tasksEmpCod(),
    });
  }

  const user = { ...session, perCod };
  const res = NextResponse.json({
    success: true,
    authenticated: true,
    user: publicUser(user),
    projects: PROJECTS.filter((p) => session.projects.includes(p.id)),
    db: tasksDbDis(session.dbDis),
  });

  if (perCod > 0 && perCod !== session.perCod) {
    await setSessionCookie(res, {
      username: session.cedula,
      cedula: session.cedula,
      name: session.name,
      role: session.role,
      projects: session.projects,
      perCod,
      usuCod: session.usuCod,
      prsCod: session.prsCod,
      empCod: session.empCod || tasksEmpCod(),
      dbDis: tasksDbDis(session.dbDis),
      teamName: matchTeamMember(session.name)?.name || session.name,
    });
  }

  return res;
}
