import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  PROJECTS,
  TEAM_DEVELOPERS,
  TEAM_MANAGERS,
  TEAM_MEMBERS,
  matchTeamMember,
} from "@/lib/auth/users";
import { allowedDatabases, sanitizeDbDis } from "@/lib/db";
import {
  TAR_ESTADOS,
  TAR_PRIORIDADES,
  TELEMETRIA_RETENCION_DIAS,
  TIC_ESTADO_MAP,
} from "@/lib/domain-constants";
import { EMPRESA_TAREAS, tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import { listAsignables } from "@/lib/tareas";
import { APP_LOCALE, APP_TIMEZONE, APP_UTC_OFFSET } from "@/lib/timezone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    }
    if (session.role !== "manager") {
      return NextResponse.json(
        { success: false, message: "Acceso solo para encargados." },
        { status: 403 }
      );
    }

    const db = sanitizeDbDis(
      req.nextUrl.searchParams.get("Ses_Dat_Dis") || tasksDbDis()
    );
    const asignables = await listAsignables(db);

    const resolveMember = (name: string, role: "manager" | "developer") => {
      const row = asignables.find((a) => matchTeamMember(a.Nombre)?.name === name);
      return {
        name,
        role,
        linked: !!row,
        Per_Cod: row?.Per_Cod ?? null,
        Nombre_BD: row?.Nombre ?? null,
        Cedula: row?.Cedula ?? null,
        Cargo: row?.Cargo ?? null,
        Mon_Activo: row?.Mon_Activo ?? null,
      };
    };

    const team = {
      managers: TEAM_MANAGERS.map((m) => resolveMember(m.name, "manager")),
      developers: TEAM_DEVELOPERS.map((m) => resolveMember(m.name, "developer")),
      linked: TEAM_MEMBERS.filter((m) =>
        asignables.some((a) => matchTeamMember(a.Nombre)?.name === m.name)
      ).length,
      total: TEAM_MEMBERS.length,
    };

    return NextResponse.json({
      success: true,
      db,
      empresa: {
        ...EMPRESA_TAREAS,
        empCod: tasksEmpCod(),
        datDis: tasksDbDis(),
      },
      projects: PROJECTS,
      databases: allowedDatabases(),
      team,
      sistema: {
        timezone: APP_TIMEZONE,
        locale: APP_LOCALE,
        utcOffset: APP_UTC_OFFSET,
        telemetriaRetencionDias: TELEMETRIA_RETENCION_DIAS,
        capturesDir: process.env.CAPTURES_DIR || null,
        errorLog: process.env.EXA_ERROR_LOG || null,
        estadosTarea: TAR_ESTADOS,
        prioridades: TAR_PRIORIDADES,
        estadosTicket: TIC_ESTADO_MAP,
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
