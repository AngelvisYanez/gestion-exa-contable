import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasRolePermission } from "@/lib/auth/role-permissions";

function deny(req: NextRequest, message: string) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ success: false, message }, { status: 403 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/dev-login") ||
    pathname.startsWith("/api/monitoreo") ||
    pathname.startsWith("/api/capturas") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/favicon.png" ||
    pathname === "/logo-1.png" ||
    pathname === "/logo-2.png" ||
    pathname.startsWith("/exa-");

  if (isPublic) return NextResponse.next();

  const session = await getSessionFromRequest(req);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Tareas y tickets se abren o cierran con los permisos del rol (Configuracion → Usuarios).
  if ((pathname === "/tareas" || pathname.startsWith("/api/tareas")) &&
      !hasRolePermission(session, "tareas.ver")) {
    return deny(req, "Tu rol no tiene acceso a tareas.");
  }
  if (
    (pathname === "/tickets" ||
      pathname === "/mis-tickets" ||
      pathname.startsWith("/api/tickets")) &&
    !hasRolePermission(session, "tickets.ver")
  ) {
    return deny(req, "Tu rol no tiene acceso a tickets.");
  }

  if ((pathname === "/mis-tareas" || pathname.startsWith("/api/mis-tareas")) &&
      !hasRolePermission(session, "mis_tareas.ver")) {
    return deny(req, "Tu rol no tiene acceso a Mis tareas.");
  }

  if ((pathname === "/capacitaciones" || pathname === "/api/capacitaciones") &&
      !hasRolePermission(session, "capacitaciones.ver")) {
    return deny(req, "Tu rol no tiene acceso a capacitaciones.");
  }

  // Cada seccion de gestion se abre con su propio permiso (Configuracion → Usuarios → Permisos).
  const puedeConfigurar = hasRolePermission(session, "configuracion.administrar");

  if (pathname.startsWith("/plan-de-accion") && !hasRolePermission(session, "plan_accion.ver")) {
    return deny(req, "Tu rol no tiene acceso al plan de accion.");
  }
  // Incidencias lo usan el plan de accion y la pantalla de configuracion.
  if (pathname.startsWith("/api/incidencias") &&
      !hasRolePermission(session, "plan_accion.ver") && !puedeConfigurar) {
    return deny(req, "Tu rol no tiene acceso a incidencias.");
  }
  if ((pathname.startsWith("/monitoreo") || pathname.startsWith("/api/dashboard")) &&
      !hasRolePermission(session, "monitoreo.ver")) {
    return deny(req, "Tu rol no tiene acceso al monitoreo.");
  }
  // El mapa y el asistente del plan de accion viven bajo /configuracion pero pertenecen a ese modulo.
  const esPlanAccion =
    pathname.startsWith("/configuracion/floorplan") || pathname.startsWith("/api/config/floorplan");
  if (esPlanAccion && !puedeConfigurar && !hasRolePermission(session, "plan_accion.ver")) {
    return deny(req, "Tu rol no tiene acceso al plan de accion.");
  }
  if (!esPlanAccion &&
      (pathname.startsWith("/configuracion") || pathname.startsWith("/api/config")) &&
      !puedeConfigurar) {
    return deny(req, "Tu rol no tiene acceso a la configuracion.");
  }

  const devsAsignables =
    pathname.startsWith("/api/devs") &&
    req.method === "GET" &&
    req.nextUrl.searchParams.get("view") === "colaboradores" &&
    req.nextUrl.searchParams.get("asignables") === "1";

  // Listado del equipo: lo necesita todo rol que registre avances para elegir
  // quien ayudo. El desarrollador no asigna tareas, pero si las avanza, asi que
  // puede consultar el equipo y dejar el apoyo como dato opcional del avance.
  if (devsAsignables && hasRolePermission(session, "tareas.avance")) {
    return NextResponse.next();
  }

  // El monitoreo y la configuracion de ExaMonitor comparten esta API.
  if (pathname.startsWith("/api/devs") &&
      !hasRolePermission(session, "monitoreo.ver") && !puedeConfigurar) {
    return deny(req, "Tu rol no tiene acceso al monitoreo.");
  }

  return NextResponse.next();
}

export const config = {
  // Subidas multipart fuera del middleware: clona el body y lo corta a 10 MB.
  matcher: ["/((?!_next/static|_next/image|api/monitoreo|api/evidencias).*)"],
};
