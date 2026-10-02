import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAssignWork, canSeeOversight } from "@/lib/auth/users";
import { publishAsignacion, publishEvent } from "@/lib/events";
import { generateTareaBrief } from "@/lib/brief/generate";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import {
  AsignacionInvalidaError,
  attachEvidenciasTarea,
  createTarea,
  descripcionAvanceDesdeBody,
  getTareaDetalle,
  kpisTareas,
  listTareas,
  registrarAvance,
  setTareaAsignados,
  updateTarea,
} from "@/lib/tareas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const db = tasksDbDis(sp.get("Ses_Dat_Dis"));

    const detalleCod = parseInt(sp.get("detalle") || "0", 10);
    if (detalleCod > 0) {
      const session = await getSessionFromRequest(req);
      const capturasDias = parseInt(sp.get("capturas_dias") || "7", 10);
      const capturasDesde = sp.get("capturas_desde") || sp.get("desde") || null;
      const capturasHasta = sp.get("capturas_hasta") || sp.get("hasta") || null;
      const detalle = await getTareaDetalle(db, detalleCod, {
        capturasDias,
        capturasDesde,
        capturasHasta,
        includeCapturas: canSeeOversight(session?.role),
        capturasLimit: parseInt(sp.get("capturas_limit") || "80", 10) || 80,
      });
      if (!detalle) {
        return NextResponse.json({ success: false, message: "Tarea no encontrada" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        db,
        can_view_capturas: canSeeOversight(session?.role),
        ...detalle,
      });
    }

    const empCod = tasksEmpCod(sp.get("Emp_Cod"));
    const perCod = parseInt(sp.get("Per_Cod") || "0", 10) || undefined;
    const estado = sp.get("estado") || "todos";
    const q = sp.get("q") || "";
    const withKpis = sp.get("kpis") === "1";

    const tareas = await listTareas(db, { empCod, perCod, estado, q });
    const payload: Record<string, unknown> = {
      success: true,
      db,
      Emp_Cod: empCod,
      tareas,
    };
    if (withKpis) payload.kpis = await kpisTareas(db, empCod);
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
    const action = String(body.action || "create");
    const empCod = tasksEmpCod(body.empCod ?? body.Emp_Cod);
    const session = await getSessionFromRequest(req);

    if (action === "create") {
      const titulo = String(body.titulo || "").trim();
      if (!titulo) {
        return NextResponse.json({ success: false, message: "Titulo requerido" }, { status: 400 });
      }
      const perCodAsignar = body.perCodAsignar ? Number(body.perCodAsignar) : undefined;
      const tarea = await createTarea(db, {
        titulo,
        descripcion: body.descripcion,
        prioridad: body.prioridad,
        complejidad: body.complejidad,
        fechaInicio: body.fechaInicio,
        fechaFin: body.fechaFin,
        estado: body.estado,
        empCod,
        usuCreador: body.usuCreador
          ? Number(body.usuCreador)
          : session?.usuCod || undefined,
        perCodAsignar,
      });

      if (perCodAsignar && perCodAsignar > 0) {
        publishAsignacion({
          kind: "tarea",
          title: "Nueva tarea asignada",
          message: `#${tarea.Tar_Cod} · ${tarea.Tar_Titulo}`,
          db,
          tarCod: tarea.Tar_Cod,
          perCod: perCodAsignar,
          estado: tarea.Tar_Estado,
          actor: session?.name,
        });
      } else {
        publishEvent({
          type: "tarea_creada",
          title: "Nueva tarea",
          message: `#${tarea.Tar_Cod} · ${tarea.Tar_Titulo}`,
          db,
          tarCod: tarea.Tar_Cod,
          estado: tarea.Tar_Estado,
          actor: session?.name,
        });
      }
      return NextResponse.json({ success: true, tarea });
    }

    if (action === "attach_evidencias") {
      const tarCod = Number(body.Tar_Cod || 0);
      const rutas = Array.isArray(body.adjuntos) ? body.adjuntos.map(String) : [];
      if (!tarCod) return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });
      const res = await attachEvidenciasTarea(db, tarCod, rutas);
      return NextResponse.json({ success: true, ...res });
    }

    if (action === "update") {
      const tarCod = Number(body.Tar_Cod || 0);
      if (!tarCod) return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });

      const patch: {
        titulo?: string;
        descripcion?: string;
        prioridad?: string;
        complejidad?: string;
        fechaInicio?: string;
        fechaFin?: string | null;
        estado?: string;
        adjuntos?: string[];
      } = {};
      if (body.titulo != null) patch.titulo = String(body.titulo);
      if (body.descripcion != null) patch.descripcion = String(body.descripcion);
      if (body.prioridad != null) patch.prioridad = String(body.prioridad);
      if (body.complejidad != null) patch.complejidad = String(body.complejidad);
      if (body.fechaInicio != null) patch.fechaInicio = String(body.fechaInicio);
      if (body.fechaFin !== undefined) patch.fechaFin = body.fechaFin ? String(body.fechaFin) : null;
      if (body.estado != null && body.estado !== "") patch.estado = String(body.estado);
      if (Array.isArray(body.adjuntos)) patch.adjuntos = body.adjuntos.map(String);

      const contentKeys = ["titulo", "descripcion", "prioridad", "complejidad", "fechaInicio", "fechaFin", "adjuntos"] as const;
      const touchesContent = contentKeys.some((k) => patch[k] !== undefined);
      if (touchesContent && !canAssignWork(session?.role)) {
        return NextResponse.json(
          { success: false, message: "Solo encargado o atencion al cliente pueden editar la tarea." },
          { status: 403 }
        );
      }

      const wantsAssign =
        body.perCodAsignar !== undefined ||
        body.asignados !== undefined ||
        body.Per_Cod !== undefined;
      if (wantsAssign && !canAssignWork(session?.role)) {
        return NextResponse.json(
          { success: false, message: "Solo encargado o atencion al cliente pueden asignar la tarea." },
          { status: 403 }
        );
      }

      if (Object.keys(patch).length === 0 && !wantsAssign) {
        return NextResponse.json({ success: false, message: "Sin campos para actualizar" }, { status: 400 });
      }

      let tarea = Object.keys(patch).length ? await updateTarea(db, tarCod, patch) : { Tar_Cod: tarCod };

      if (wantsAssign) {
        let perCods: number[] = [];
        if (Array.isArray(body.asignados)) {
          perCods = body.asignados.map((x: unknown) => Number(x)).filter((n: number) => n > 0);
        } else if (body.perCodAsignar != null && body.perCodAsignar !== "") {
          const n = Number(body.perCodAsignar);
          if (n > 0) perCods = [n];
        } else if (body.Per_Cod != null && body.Per_Cod !== "") {
          const n = Number(body.Per_Cod);
          if (n > 0) perCods = [n];
        }
        try {
          const asig = await setTareaAsignados(db, tarCod, perCods);
          tarea = { ...tarea, ...asig };
          if (perCods.length) {
            publishAsignacion({
              kind: "tarea",
              title: "Tarea asignada",
              message: `#${tarCod} asignada`,
              db,
              tarCod,
              perCod: perCods[0],
              estado: asig.Tar_Estado,
              actor: session?.name,
            });
          }
        } catch (e) {
          if (e instanceof AsignacionInvalidaError) {
            return NextResponse.json({ success: false, message: e.message }, { status: 400 });
          }
          throw e;
        }
      }

      const estado = patch.estado || (tarea as { Tar_Estado?: string }).Tar_Estado;
      publishEvent({
        type: patch.estado ? "estado_cambiado" : "tarea_actualizada",
        title: patch.estado ? "Estado actualizado" : "Tarea actualizada",
        message: patch.estado
          ? `#${tarCod} movida a «${patch.estado}»`
          : `#${tarCod} · cambios guardados`,
        db,
        tarCod,
        estado,
        actor: session?.name,
      });
      return NextResponse.json({ success: true, tarea });
    }

    if (action === "avance") {
      const tarCod = Number(body.Tar_Cod || 0);
      const porcentaje = Number(body.porcentaje ?? 0);
      if (!tarCod) return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });
      const descripcion = descripcionAvanceDesdeBody(body, tarCod);
      const resumen = String(body.realizado ?? body.descripcion ?? "").trim();
      const res = await registrarAvance(db, {
        tarCod,
        porcentaje,
        descripcion,
        usuCod: session?.usuCod || (body.usuCod ? Number(body.usuCod) : undefined),
      });
      publishEvent({
        type: "avance_registrado",
        title: "Avance registrado",
        message: `#${tarCod} · ${res.porcentaje}%${resumen ? ` — ${resumen.slice(0, 80)}` : ""}`,
        db,
        tarCod,
        porcentaje: res.porcentaje,
        estado: res.porcentaje >= 100 ? "Finalizada" : "En Proceso",
        actor: session?.name,
      });
      return NextResponse.json({ success: true, ...res });
    }

    if (action === "generate_brief") {
      if (!canSeeOversight(session?.role)) {
        return NextResponse.json(
          { success: false, message: "Solo el encargado puede generar el brief." },
          { status: 403 }
        );
      }
      const tarCod = Number(body.Tar_Cod || 0);
      if (!tarCod) {
        return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });
      }
      const titulo = String(body.titulo || "").trim();
      if (!titulo) {
        return NextResponse.json({ success: false, message: "Titulo requerido" }, { status: 400 });
      }
      const tipoRaw = String(body.tipo || body.Tar_Brief_Tipo || "mejora").toLowerCase();
      const tipo = tipoRaw === "creacion" || tipoRaw === "creación" ? "creacion" : "mejora";
      const result = await generateTareaBrief({
        dbDis: db,
        tarCod,
        titulo,
        descripcion: String(body.descripcion || ""),
        proceso: String(body.proceso || ""),
        modulo: String(body.modulo || ""),
        directorio: String(body.directorio || ""),
        tipo,
        actor: session?.name,
        publicBaseUrl: String(body.publicBaseUrl || process.env.PUBLIC_APP_URL || ""),
      });
      return NextResponse.json({ success: true, brief: result });
    }

    return NextResponse.json({ success: false, message: "Accion desconocida" }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    const status = err instanceof AsignacionInvalidaError ? 400 : 500;
    return NextResponse.json({ success: false, message: mensaje }, { status });
  }
}
