import { NextRequest, NextResponse } from "next/server";
import { publishAsignacion, publishEvent } from "@/lib/events";
import { tasksDbDis } from "@/lib/empresa";
import {
  crearTareaDesdeIncidencia,
  listIncidencias,
  updateIncidenciaEstado,
  type IncEstado,
} from "@/lib/incidencias";
import { listAsignables } from "@/lib/tareas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const db = tasksDbDis(sp.get("Ses_Dat_Dis"));
    const estado = sp.get("estado") || "todos";
    const nivel = sp.get("nivel") || "todos";
    const q = sp.get("q") || "";
    const sync = sp.get("sync") !== "0";
    const withAssignees = sp.get("assignees") === "1";

    const data = await listIncidencias(db, { estado, nivel, q, sync });
    const payload: Record<string, unknown> = {
      success: true,
      db,
      ...data,
    };
    if (withAssignees) {
      payload.asignables = await listAsignables(db);
    }
    return NextResponse.json(payload);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = tasksDbDis(body.Ses_Dat_Dis);
    const action = String(body.action || "");

    if (action === "crear_tarea") {
      const perCodAsignar = body.perCodAsignar ? Number(body.perCodAsignar) : undefined;
      const res = await crearTareaDesdeIncidencia(db, {
        incCod: body.Inc_Cod ? Number(body.Inc_Cod) : undefined,
        fingerprint: body.fingerprint ? String(body.fingerprint) : undefined,
        perCodAsignar,
        usuCreador: body.usuCreador ? Number(body.usuCreador) : undefined,
        prioridad: body.prioridad ? String(body.prioridad) : undefined,
        titulo: body.titulo ? String(body.titulo) : undefined,
      });
      if (!res.already) {
        const titulo = res.tarea?.Tar_Titulo || "error EXA";
        if (perCodAsignar && perCodAsignar > 0) {
          publishAsignacion({
            kind: "tarea",
            title: "Tarea desde incidencia",
            message: `#${res.Tar_Cod} · ${titulo}`,
            db,
            tarCod: res.Tar_Cod,
            perCod: perCodAsignar,
            estado: res.tarea?.Tar_Estado,
          });
        } else {
          publishEvent({
            type: "tarea_creada",
            title: "Tarea desde incidencia",
            message: `#${res.Tar_Cod} · ${titulo}`,
            db,
            tarCod: res.Tar_Cod,
            estado: res.tarea?.Tar_Estado,
          });
        }
      }
      return NextResponse.json({ success: true, ...res });
    }

    if (action === "estado") {
      const incCod = Number(body.Inc_Cod || 0);
      const estado = String(body.estado || "") as IncEstado;
      if (!incCod || !estado) {
        return NextResponse.json(
          { success: false, message: "Inc_Cod y estado requeridos" },
          { status: 400 }
        );
      }
      await updateIncidenciaEstado(db, incCod, estado);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Accion desconocida" }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
