import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAssignWork, canSeeOversight } from "@/lib/auth/users";
import { publishAsignacion, publishEvent } from "@/lib/events";
import { resolveTicketDatabaseIds, sanitizeDbDis } from "@/lib/db";
import { ticketScopeForSession } from "@/lib/ticket-scope";
import {
  assignTicket,
  attachTicketEvidencias,
  createTicket,
  findTicketAsignado,
  listCapturasTicket,
  listTicketAssignees,
  listTicketEmpresas,
  listTicketsAsignados,
  resumirTickets,
  ticketsKpisBases,
  updateTicketEstado,
  type TicketEstado,
} from "@/lib/tickets";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const detalleCod = parseInt(sp.get("detalle") || "0", 10);
    if (detalleCod > 0) {
      const session = await getSessionFromRequest(req);
      if (!canSeeOversight(session?.role)) {
        return NextResponse.json(
          { success: false, message: "Solo encargados pueden ver historial de capturas." },
          { status: 403 }
        );
      }
      const db = sanitizeDbDis(sp.get("Ses_Dat_Dis"));
      const capturas = await listCapturasTicket(db, detalleCod, {
        dias: parseInt(sp.get("capturas_dias") || "30", 10) || 30,
        desde: sp.get("capturas_desde") || sp.get("desde"),
        hasta: sp.get("capturas_hasta") || sp.get("hasta"),
        limit: parseInt(sp.get("capturas_limit") || "80", 10) || 80,
      });
      return NextResponse.json({
        success: true,
        db,
        Tic_Cod: detalleCod,
        can_view_capturas: true,
        ...capturas,
      });
    }

    const estado = sp.get("estado") || "todos";
    const bandeja = sp.get("bandeja") || "";
    const q = sp.get("q") || "";
    const desde = sp.get("desde") || "";
    const hasta = sp.get("hasta") || "";
    const withAssignees = sp.get("assignees") === "1";
    const limit = parseInt(sp.get("limit") || "500", 10) || 500;
    const db = sanitizeDbDis(sp.get("Ses_Dat_Dis"));
    const session = await getSessionFromRequest(req);

    if (session?.role === "developer") {
      const scope = await ticketScopeForSession(session);
      const all =
        scope.aseCodes.length || scope.perCodes.length
          ? await listTicketsAsignados({
              aseCodes: scope.aseCodes,
              perCodes: scope.perCodes,
              q: q || undefined,
              desde: desde || undefined,
              hasta: hasta || undefined,
              limit: Math.max(limit, 500),
            })
          : [];
      const kpisMios = resumirTickets(all);
      const vista = bandeja === "resueltos" ? "resueltos" : bandeja === "todos" ? "todos" : "asignados";
      const tickets =
        vista === "resueltos"
          ? all.filter((t) => t.Tic_Estado === "Cerrado")
          : vista === "todos"
            ? all
            : all.filter((t) => t.Tic_Estado !== "Cerrado");
      return NextResponse.json({
        success: true,
        db,
        source: "tickets-mios",
        solo_mios: true,
        tickets,
        kpis: kpisMios,
        bandeja: vista,
        desde: desde || null,
        hasta: hasta || null,
      });
    }

    const bases = await resolveTicketDatabaseIds();
    const [tickets, kpis] = await Promise.all([
      listTicketsAsignados({
        estado: bandeja ? "todos" : estado,
        bandeja: bandeja || undefined,
        q,
        desde: desde || undefined,
        hasta: hasta || undefined,
        limit,
        bases,
      }),
      ticketsKpisBases({ desde: desde || undefined, hasta: hasta || undefined, bases }),
    ]);

    const payload: Record<string, unknown> = {
      success: true,
      db,
      source: "tickets",
      bases,
      tickets,
      kpis,
      bandeja: bandeja || "todos",
      desde: desde || null,
      hasta: hasta || null,
    };
    if (withAssignees) {
      const [asignables, empresas] = await Promise.all([
        listTicketAssignees(),
        listTicketEmpresas(db),
      ]);
      payload.asignables = asignables;
      payload.empresas = empresas;
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
    const db = sanitizeDbDis(body.Ses_Dat_Dis);
    const action = String(body.action || "create");
    const session = await getSessionFromRequest(req);

    if (!canAssignWork(session?.role)) {
      if (session?.role !== "developer" || action !== "estado") {
        return NextResponse.json(
          { success: false, message: "No tienes acceso a esa accion." },
          { status: 403 }
        );
      }
    }

    if (action === "create") {
      const adjuntos = Array.isArray(body.adjuntos) ? body.adjuntos.map(String) : [];
      const ticket = await createTicket(db, {
        titulo: String(body.titulo || ""),
        descripcion: body.descripcion,
        prioridad: body.prioridad,
        origen: body.origen,
        empCod: body.empCod ? Number(body.empCod) : undefined,
        usuCreador: body.usuCreador ? Number(body.usuCreador) : session?.usuCod || undefined,
        enviadoPor: body.enviadoPor != null ? String(body.enviadoPor) : undefined,
        empresa: body.empresa != null ? String(body.empresa) : undefined,
        telefono: body.telefono != null ? String(body.telefono) : undefined,
        proceso: body.proceso != null ? String(body.proceso) : undefined,
        adjuntos,
      });
      publishEvent({
        type: "tarea_creada",
        title: "Nuevo ticket",
        message: `#${(ticket as { Tic_Cod: number }).Tic_Cod} · ${String(body.titulo || "").slice(0, 80)}`,
        db,
        ticCod: (ticket as { Tic_Cod: number }).Tic_Cod,
        kind: "ticket",
        actor: session?.name,
      });
      return NextResponse.json({ success: true, ticket });
    }

    if (action === "attach_evidencias") {
      const ticCod = Number(body.Tic_Cod || 0);
      const rutas = Array.isArray(body.adjuntos) ? body.adjuntos.map(String) : [];
      if (!ticCod) {
        return NextResponse.json({ success: false, message: "Tic_Cod requerido" }, { status: 400 });
      }
      const res = await attachTicketEvidencias(db, ticCod, rutas);
      return NextResponse.json({ success: true, ...res });
    }

    if (action === "assign") {
      const ticCod = Number(body.Tic_Cod || 0);
      const rawList = Array.isArray(body.asignados) ? body.asignados : [];
      const asignados = rawList
        .map((a: { Usu_Cod?: number; usuCod?: number; Per_Cod?: number; perCod?: number }) => ({
          usuCod: Number(a.Usu_Cod ?? a.usuCod ?? 0),
          perCod: Number(a.Per_Cod ?? a.perCod ?? 0) || undefined,
        }))
        .filter((a: { usuCod: number }) => a.usuCod > 0);
      const usuCod = Number(body.Usu_Cod || 0);
      const perCod = body.Per_Cod ? Number(body.Per_Cod) : undefined;
      if (!ticCod || (!usuCod && !asignados.length)) {
        return NextResponse.json(
          { success: false, message: "Tic_Cod y al menos un desarrollador son requeridos" },
          { status: 400 }
        );
      }
      const ticketDb = sanitizeDbDis(body.Db_Origen || db);
      const res = await assignTicket(ticketDb, {
        ticCod,
        usuCod: usuCod || undefined,
        perCod,
        asignados: asignados.length ? asignados : undefined,
      });
      const titulo = res.ticket?.Tic_Titulo || `Ticket #${ticCod}`;
      const nombre = res.ticket?.Asignado_Nombre || "Asesor asignado";
      const destinos =
        res.asignados && res.asignados.length
          ? res.asignados
          : [{ usuCod, perCod }];
      for (const dest of destinos) {
        publishAsignacion({
          kind: "ticket",
          title: "Ticket asignado",
          message: `#${ticCod} · ${titulo} → ${nombre}`,
          db: ticketDb,
          ticCod,
          perCod: dest.perCod ?? undefined,
          usuCod: dest.usuCod,
          estado: res.ticket?.Tic_Estado || "Asignado",
          actor: session?.name,
        });
      }
      return NextResponse.json({ success: true, ...res });
    }

    if (action === "estado") {
      const ticCod = Number(body.Tic_Cod || 0);
      const estado = String(body.estado || "") as TicketEstado;
      if (!ticCod || !estado) {
        return NextResponse.json({ success: false, message: "Datos incompletos" }, { status: 400 });
      }
      let ticketDb = db;
      if (session?.role === "developer") {
        const scope = await ticketScopeForSession(session);
        const mio = await findTicketAsignado({
          ticCod,
          aseCodes: scope.aseCodes,
          perCodes: scope.perCodes,
          preferDb: body.Db_Origen || db,
        });
        if (!mio) {
          return NextResponse.json(
            { success: false, message: "Ese ticket no esta asignado a ti." },
            { status: 403 }
          );
        }
        ticketDb = mio.Db_Origen || db;
      }
      await updateTicketEstado(ticketDb, ticCod, estado);
      publishEvent({
        type: "estado_cambiado",
        title: "Ticket actualizado",
        message: `#${ticCod} → ${estado}`,
        db: ticketDb,
        ticCod,
        estado,
        kind: "ticket",
        actor: session?.name,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, message: "Accion desconocida" }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
