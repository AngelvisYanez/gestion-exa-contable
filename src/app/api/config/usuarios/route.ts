import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canSeeOversight, normalizePanelRole } from "@/lib/auth/users";
import { sanitizeDbDis } from "@/lib/db";
import { tasksDbDis } from "@/lib/empresa";
import { listEmpresaUsuarios, setPanelUsuario } from "@/lib/panel-usuarios";
import { isRolePermissionKey } from "@/lib/auth/role-permissions";
import { listRolePermissions, setRolePermission } from "@/lib/auth/role-permissions-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
  }
  if (!canSeeOversight(session.role)) {
    return NextResponse.json(
      { success: false, message: "Solo el encargado administra usuarios." },
      { status: 403 }
    );
  }
  try {
    const db = sanitizeDbDis(req.nextUrl.searchParams.get("Ses_Dat_Dis") || tasksDbDis());
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
  const session = await getSessionFromRequest(req);
  if (!session || !canSeeOversight(session.role)) {
    return NextResponse.json(
      { success: false, message: "Solo el encargado administra usuarios." },
      { status: 403 }
    );
  }
  try {
    const body = await req.json();
    const db = sanitizeDbDis(body.Ses_Dat_Dis || tasksDbDis());
    const action = String(body.action || "");
    if (action === "permission") {
      const rol = String(body.rol || "");
      const permiso = String(body.permiso || "");
      if ((rol !== "manager" && rol !== "atencion" && rol !== "developer") ||
          !isRolePermissionKey(permiso) || typeof body.habilitado !== "boolean") {
        return NextResponse.json({ success: false, message: "Permiso invalido" }, { status: 400 });
      }
      await setRolePermission(tasksDbDis(), rol, permiso, body.habilitado);
      return NextResponse.json({ success: true, rolePermissions: await listRolePermissions(tasksDbDis()) });
    }
    const usuCod = Number(body.Usu_Cod || 0);
    if (action !== "add" && action !== "remove" && action !== "role") {
      return NextResponse.json({ success: false, message: "Accion invalida" }, { status: 400 });
    }
    if (action !== "remove") normalizePanelRole(body.rol);
    await setPanelUsuario(db, usuCod, action, body.rol ? String(body.rol) : undefined);
    const usuarios = await listEmpresaUsuarios(db);
    return NextResponse.json({ success: true, usuarios });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 400 });
  }
}
