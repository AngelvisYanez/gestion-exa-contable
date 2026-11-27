import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, type SessionData } from "@/lib/auth/session";
import { normalizePanelRole, roleLabel } from "@/lib/auth/users";
import { sanitizeDbDis } from "@/lib/db";
import { tasksDbDis } from "@/lib/empresa";
import { listEmpresaUsuarios, setPanelUsuario } from "@/lib/panel-usuarios";
import {
  ROLE_PERMISSION_LABELS,
  hasRolePermission,
  isRolePermissionKey,
} from "@/lib/auth/role-permissions";
import {
  listRolePermissions,
  resetRolePermissions,
  setRolePermission,
} from "@/lib/auth/role-permissions-db";
import { actorDeSesion, listAuditoria, registrarAuditoria } from "@/lib/auth/auditoria-panel";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function esRol(value: string): value is "manager" | "atencion" | "developer" {
  return value === "manager" || value === "atencion" || value === "developer";
}

/** Verifica el permiso de administrar; si falla, deja rastro en la bitacora. */
async function exigirAdministrador(req: NextRequest, accion: string): Promise<
  { ok: true; session: SessionData } | { ok: false; response: NextResponse }
> {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 }),
    };
  }
  if (!hasRolePermission(session, "configuracion.administrar")) {
    await registrarAuditoria({
      accion: "acceso_denegado",
      actor: actorDeSesion(session, req),
      detalle: `Intento de ${accion} en Usuarios sin el permiso de administrar.`,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Tu rol no tiene permiso para administrar usuarios." },
        { status: 403 }
      ),
    };
  }
  return { ok: true, session };
}

export async function GET(req: NextRequest) {
  const view = req.nextUrl.searchParams.get("view") || "";
  const guard = await exigirAdministrador(
    req,
    view === "auditoria" ? "consultar la auditoria" : "consultar usuarios"
  );
  if (!guard.ok) return guard.response;
  try {
    const sp = req.nextUrl.searchParams;
    if (view === "auditoria") {
      const data = await listAuditoria({
        q: sp.get("q") || "",
        accion: sp.get("accion") || "",
        desde: sp.get("desde") || "",
        hasta: sp.get("hasta") || "",
        page: parseInt(sp.get("page") || "1", 10) || 1,
        pageSize: parseInt(sp.get("pageSize") || "20", 10) || 20,
      });
      return NextResponse.json({ success: true, ...data });
    }
    const db = sanitizeDbDis(sp.get("Ses_Dat_Dis") || tasksDbDis());
    const [usuarios, rolePermissions] = await Promise.all([
      listEmpresaUsuarios(db),
      listRolePermissions(tasksDbDis()),
    ]);
    return NextResponse.json({
      success: true,
      db,
      usuarios,
      rolePermissions,
      enGestion: usuarios.filter((u) => u.enPanel).length,
      empresa: usuarios.length,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await exigirAdministrador(req, "modificar usuarios o permisos");
  if (!guard.ok) return guard.response;
  const { session } = guard;
  const actor = actorDeSesion(session, req);
  try {
    const body = await req.json();
    const db = sanitizeDbDis(body.Ses_Dat_Dis || tasksDbDis());
    const action = String(body.action || "");

    if (action === "permission") {
      const rol = String(body.rol || "");
      const permiso = String(body.permiso || "");
      if (!esRol(rol) || !isRolePermissionKey(permiso) || typeof body.habilitado !== "boolean") {
        return NextResponse.json({ success: false, message: "Permiso invalido" }, { status: 400 });
      }
      const cambio = await setRolePermission(tasksDbDis(), rol, permiso, body.habilitado);
      if (cambio.anterior !== cambio.nuevo) {
        const etiqueta = ROLE_PERMISSION_LABELS[permiso];
        await registrarAuditoria({
          accion: cambio.nuevo ? "permiso_activado" : "permiso_desactivado",
          actor,
          rol,
          permiso,
          anterior: cambio.anterior ? "Activado" : "Desactivado",
          nuevo: cambio.nuevo ? "Activado" : "Desactivado",
          detalle: `${etiqueta.modulo} > ${etiqueta.accion} para el rol ${roleLabel(rol)}.`,
        });
      }
      return NextResponse.json({ success: true, rolePermissions: await listRolePermissions(tasksDbDis()) });
    }

    if (action === "reset_permissions") {
      const rol = String(body.rol || "");
      if (!esRol(rol)) {
        return NextResponse.json({ success: false, message: "Rol invalido" }, { status: 400 });
      }
      const cambiados = await resetRolePermissions(tasksDbDis(), rol);
      await registrarAuditoria({
        accion: "permisos_restablecidos",
        actor,
        rol,
        detalle: cambiados.length
          ? `Se restablecieron los valores iniciales del rol ${roleLabel(rol)}. Cambiaron: ${cambiados
              .map((k) => `${ROLE_PERMISSION_LABELS[k].modulo} > ${ROLE_PERMISSION_LABELS[k].accion}`)
              .join(", ")}.`
          : `Se restablecieron los valores iniciales del rol ${roleLabel(rol)}; no hubo diferencias.`,
      });
      return NextResponse.json({ success: true, rolePermissions: await listRolePermissions(tasksDbDis()) });
    }

    const usuCod = Number(body.Usu_Cod || 0);
    if (action !== "add" && action !== "remove" && action !== "role") {
      return NextResponse.json({ success: false, message: "Accion invalida" }, { status: 400 });
    }
    if (action !== "remove") normalizePanelRole(body.rol);
    await setPanelUsuario(db, usuCod, action, body.rol ? String(body.rol) : undefined, { actor });
    const usuarios = await listEmpresaUsuarios(db);
    return NextResponse.json({ success: true, usuarios });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 400 });
  }
}
