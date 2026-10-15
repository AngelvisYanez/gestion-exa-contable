import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { sanitizeDbDis } from "@/lib/db";
import { ticketScopeForSession } from "@/lib/ticket-scope";
import { findTicketAsignado, listTickets } from "@/lib/tickets";
import { resolveTicketAdjuntoFile } from "@/lib/ticket-adjuntos";
import { isAllowedEvidenciaExt, mimeForExt } from "@/lib/evidencia-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sirve el archivo que el cliente adjunto al ticket en el panel legacy EXA
 * (Tic_Evi_Pro / Tic_Evi_Sol). Solo rutas bajo tickets/ y ticketsSolucionados/.
 */
export async function GET(req: NextRequest) {
  const actor = await getSessionFromRequest(req);
  if (!actor || !hasRolePermission(actor, "tickets.ver")) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const stored = req.nextUrl.searchParams.get("r") || "";
  const dbParam = req.nextUrl.searchParams.get("db") || "";
  const db = sanitizeDbDis(dbParam);
  const ticCod = Number(req.nextUrl.searchParams.get("tic"));
  if (dbParam !== db || !Number.isSafeInteger(ticCod) || ticCod <= 0) {
    return new NextResponse("Solicitud inválida", { status: 400 });
  }

  const ticket = actor.role === "developer"
    ? await (async () => {
        const scope = await ticketScopeForSession(actor);
        return findTicketAsignado({
          ticCod,
          aseCodes: scope.aseCodes,
          perCodes: scope.perCodes,
          preferDb: db,
        });
      })()
    : (await listTickets(db, { ticCod, limit: 1 }))[0];
  if (!ticket || !ticket.Adjuntos_Exa?.some((archivo) => archivo.ruta === stored)) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const file = resolveTicketAdjuntoFile(stored);
  if (!file) return new NextResponse("No encontrado", { status: 404 });

  const ext = path.extname(file).slice(1).toLowerCase();
  const nombre = path.basename(file);
  const previewable = isAllowedEvidenciaExt(ext);
  const data = await fs.promises.readFile(file);

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": previewable ? mimeForExt(ext) : "application/octet-stream",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${previewable ? "inline" : "attachment"}; filename="${encodeURIComponent(nombre)}"`,
    },
  });
}
