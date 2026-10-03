import { NextRequest, NextResponse } from "next/server";
import { isUploadedFile } from "@/lib/api";
import { getSessionFromRequest } from "@/lib/auth/session";
import { resolvePerCod } from "@/lib/auth/resolvePer";
import { canAssignWork, canSeeOversight, matchTeamMember } from "@/lib/auth/users";
import { saveEvidencia, toPublicCaptureUrl } from "@/lib/captures";
import { isImagePath } from "@/lib/avance-format";
import { tasksDbDis } from "@/lib/empresa";
import { listTareas } from "@/lib/tareas";

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

    const db = tasksDbDis();
    if (ticCod > 0) {
      if (!canAssignWork(session.role)) {
        return NextResponse.json(
          { success: false, message: "Solo encargado o atencion al cliente pueden adjuntar evidencias a tickets." },
          { status: 403 }
        );
      }
    } else if (!canSeeOversight(session.role) && !canAssignWork(session.role)) {
      const perCod = await resolvePerCod(db, {
        perCod: session.perCod > 0 ? session.perCod : undefined,
        prsCod: session.prsCod,
        cedula: session.cedula,
        nameMatch: matchTeamMember(session.name)?.nameMatch,
      });
      const propias = perCod > 0 ? await listTareas(db, { perCod }) : [];
      if (!propias.some((t) => t.Tar_Cod === tarCod)) {
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
