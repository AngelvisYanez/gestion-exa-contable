import { NextRequest, NextResponse } from "next/server";
import { isUploadedFile } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { resolvePerCod } from "@/lib/auth/resolvePer";
import { canAssignWork, canSeeOversight, matchTeamMember } from "@/lib/auth/users";
import { saveEvidencia, toPublicCaptureUrl } from "@/lib/captures";
import { isImagePath } from "@/lib/avance-format";
import { tasksDbDis } from "@/lib/empresa";
import { getTareaAccess } from "@/lib/tareas";
import { findTicketAsignado } from "@/lib/tickets";
import { ticketScopeForSession } from "@/lib/ticket-scope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES_PER_REQUEST = 20;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, message: "Debe iniciar sesion." }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const tarCod = parseInt(String(form.get("Tar_Cod") || "0"), 10);
    const ticCod = parseInt(String(form.get("Tic_Cod") || "0"), 10);
    if (!tarCod && !ticCod) {
      return NextResponse.json(
        { success: false, message: "Tar_Cod o Tic_Cod requerido" },
        { status: 400 }
      );
    }
    if (tarCod > 0 && !hasRolePermission(session, "tareas.editar") &&
        !hasRolePermission(session, "tareas.avance")) {
      return NextResponse.json({ success: false, message: "Tu rol no puede adjuntar archivos a tareas." }, { status: 403 });
    }
    if (ticCod > 0 && !hasRolePermission(session, "tickets.crear") &&
        !hasRolePermission(session, "tickets.avance")) {
      return NextResponse.json({ success: false, message: "Tu rol no puede adjuntar archivos a tickets." }, { status: 403 });
    }

    const db = tasksDbDis();
    if (ticCod > 0) {
      if (!canAssignWork(session.role) && !canSeeOversight(session.role)) {
        const scope = await ticketScopeForSession(session);
        const mio = await findTicketAsignado({
          ticCod,
          aseCodes: scope.aseCodes,
          perCodes: scope.perCodes,
          preferDb: String(form.get("Db_Origen") || ""),
        });
        if (!mio) {
          return NextResponse.json(
            { success: false, message: "No puedes adjuntar evidencias a ese ticket." },
            { status: 403 }
          );
        }
      }
    } else if (!canSeeOversight(session.role) && !canAssignWork(session.role)) {
      let access = await getTareaAccess(db, tarCod, session.usuCod);
      if (access && !access.isCreator) {
        const perCod = await resolvePerCod(db, {
          perCod: session.perCod > 0 ? session.perCod : undefined,
          prsCod: session.prsCod,
          cedula: session.cedula,
          nameMatch: matchTeamMember(session.name)?.nameMatch,
        });
        access = await getTareaAccess(db, tarCod, session.usuCod, perCod);
      }
      if (!access?.isCreator && !access?.isAssigned) {
        return NextResponse.json(
          { success: false, message: "No puedes adjuntar evidencias a esa tarea." },
          { status: 403 }
        );
      }
    }

    const files = form.getAll("files").filter((f): f is File => isUploadedFile(f) && f.size > 0);
    if (!files.length) {
      return NextResponse.json({ success: false, message: "No se recibieron archivos." }, { status: 400 });
    }
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        {
          success: false,
          message: `Maximo ${MAX_FILES_PER_REQUEST} archivos por solicitud. Divide la subida en varias partes.`,
        },
        { status: 400 }
      );
    }

    const kind = ticCod > 0 ? "tic" : "tar";
    const refCod = ticCod > 0 ? ticCod : tarCod;
    const adjuntos = [];
    for (const f of files) {
      const ruta = await saveEvidencia(refCod, f, kind);
      adjuntos.push({
        ruta,
        url: toPublicCaptureUrl(ruta),
        nombre: f.name,
        esImagen: isImagePath(ruta),
      });
    }
    return NextResponse.json({ success: true, adjuntos });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error al subir evidencia";
    return NextResponse.json({ success: false, message: mensaje }, { status: 400 });
  }
}
