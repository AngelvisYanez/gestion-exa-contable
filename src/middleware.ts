import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAssignWork, canSeeOversight } from "@/lib/auth/users";

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
    pathname.startsWith("/exa-");

  if (isPublic) return NextResponse.next();

  const session = await getSessionFromRequest(req);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const oversight =
    pathname.startsWith("/monitoreo") ||
    pathname.startsWith("/configuracion") ||
    pathname.startsWith("/api/incidencias") ||
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/config");

  const desk =
    pathname.startsWith("/tareas") ||
    pathname.startsWith("/tickets") ||
    pathname.startsWith("/api/tareas") ||
    pathname.startsWith("/api/tickets");

  const devsAsignables =
    pathname.startsWith("/api/devs") &&
    req.method === "GET" &&
    req.nextUrl.searchParams.get("view") === "colaboradores" &&
    req.nextUrl.searchParams.get("asignables") === "1";

  if (oversight && !canSeeOversight(session.role)) {
    return deny(req, "Solo el encargado puede ver monitoreo y configuracion.");
  }

  const devTickets =
    session.role === "developer" &&
    (pathname === "/tickets" || pathname.startsWith("/api/tickets"));

  if ((desk || pathname.startsWith("/api/devs")) && !canAssignWork(session.role)) {
    if (devTickets) return NextResponse.next();
    return deny(req, "No tienes acceso a esa seccion.");
  }

  if (pathname.startsWith("/api/devs") && !canSeeOversight(session.role) && !devsAsignables) {
    return deny(req, "Solo el encargado consulta el monitoreo.");
  }

  return NextResponse.next();
}

export const config = {
  // Subidas multipart fuera del middleware: clona el body y lo corta a 10 MB.
  matcher: ["/((?!_next/static|_next/image|api/monitoreo|api/evidencias).*)"],
};
