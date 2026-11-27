import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { publishAsignacion, publishEvent } from "@/lib/events";
import { tareaContexto } from "@/lib/event-context";
import { tasksDbDis } from "@/lib/empresa";
import {
  analizarIncidencia,
  listIncidenciaEventos,
  registrarHitoIncidencia,
  proponerCorreccionCursor,
  crearTareaDesdeIncidencia,
  listIncidencias,
  resolverIncidenciaConSolucion,
  updateIncidenciaEstado,
  type IncEstado,
} from "@/lib/incidencias";
import { listAsignables } from "@/lib/tareas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const db = tasksDbDis(sp.get("Ses_Dat_Dis"));
    const estado = sp.get("estado") || "todos";
    const nivel = sp.get("nivel") || "todos";
    const proyecto = sp.get("proyecto") || "todos";
    const fechaDesde = sp.get("fechaDesde") || "";
    const fechaHasta = sp.get("fechaHasta") || "";
    const q = sp.get("q") || "";
    const sync = sp.get("sync") !== "0";
    const withAssignees = sp.get("assignees") === "1";
    const eventIncCod = Number(sp.get("eventos"));
    if (Number.isSafeInteger(eventIncCod) && eventIncCod > 0) {
      return NextResponse.json({ success: true, eventos: await listIncidenciaEventos(db, eventIncCod) });
    }

    const data = await listIncidencias(db, { estado, nivel, proyecto, fechaDesde, fechaHasta, q, sync });
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

    if (action === "registrar_hito") {
      const session = await getSessionFromRequest(req);
      if (!hasRolePermission(session, "tareas.crear")) {
        return NextResponse.json({ success: false, message: "Tu rol no puede registrar hitos." }, { status: 403 });
      }
      const incCod = Number(body.Inc_Cod);
      const tipo = body.tipo;
      const referencia = String(body.referencia || "").trim();
      if (!Number.isSafeInteger(incCod) || incCod <= 0 || !["mr", "despliegue"].includes(tipo) || !referencia || referencia.length > 500) {
        return NextResponse.json({ success: false, message: "Indica un tipo y una referencia válida de hasta 500 caracteres." }, { status: 400 });
      }
      await registrarHitoIncidencia(db, incCod, tipo, referencia);
      return NextResponse.json({ success: true });
    }

    if (action === "cursor_proponer") {
      const session = await getSessionFromRequest(req);
      if (!hasRolePermission(session, "tareas.crear")) {
        return NextResponse.json({ success: false, message: "Tu rol no puede solicitar correcciones." }, { status: 403 });
      }
      const incCod = Number(body.Inc_Cod);
      if (!Number.isSafeInteger(incCod) || incCod <= 0) {
        return NextResponse.json({ success: false, message: "Inc_Cod invalido" }, { status: 400 });
      }
      return NextResponse.json({ success: true, ...(await proponerCorreccionCursor(db, incCod)) });
    }

    if (action === "analizar") {
      const incCod = Number(body.Inc_Cod);
      if (!Number.isSafeInteger(incCod) || incCod <= 0) {
        return NextResponse.json({ success: false, message: "Inc_Cod invalido" }, { status: 400 });
      }
      return NextResponse.json({ success: true, ...(await analizarIncidencia(db, incCod)) });
    }

    if (action === "crear_tarea") {
      const session = await getSessionFromRequest(req);
      if (!hasRolePermission(session, "tareas.crear")) {
        return NextResponse.json({ success: false, message: "Tu rol no puede crear tareas." }, { status: 403 });
      }
      if (body.perCodAsignar && !hasRolePermission(session, "tareas.asignar")) {
        return NextResponse.json({ success: false, message: "Tu rol no puede asignar tareas." }, { status: 403 });
      }
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
        const ctx = await tareaContexto(db, res.Tar_Cod);
        const autor = session?.name || "Alguien";
        if (perCodAsignar && perCodAsignar > 0) {
          publishAsignacion({
            kind: "tarea",
            title: "Tarea desde incidencia",
            message: ctx.asignadoA
              ? `${autor} creó una tarea a partir de una incidencia y la asignó a ${ctx.asignadoA}.`
              : `${autor} creó una tarea a partir de una incidencia y la asignó.`,
            db,
            tarCod: res.Tar_Cod,
            perCod: perCodAsignar,
            estado: res.tarea?.Tar_Estado,
            actor: session?.name,
            titulo: ctx.titulo || titulo,
            prioridad: ctx.prioridad,
            asignadoA: ctx.asignadoA,
            fechaFin: ctx.fechaFin,
          });
        } else {
          publishEvent({
            type: "tarea_creada",
            title: "Tarea desde incidencia",
            message: `${autor} creó una tarea a partir de una incidencia (sin asignar).`,
            db,
            tarCod: res.Tar_Cod,
            estado: res.tarea?.Tar_Estado,
            actor: session?.name,
            kind: "tarea",
            titulo: ctx.titulo || titulo,
            prioridad: ctx.prioridad,
            fechaFin: ctx.fechaFin,
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
      if (estado === "Resuelta") {
        const resolved = await resolverIncidenciaConSolucion(db, incCod);
        return NextResponse.json({ success: true, ...resolved });
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
