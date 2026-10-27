import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { canAssignWork, canSeeOversight } from "@/lib/auth/users";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { publishAsignacion, publishEvent } from "@/lib/events";
import { resolveTicketDatabaseIds, sanitizeDbDis } from "@/lib/db";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import { createTarea, setTareaAsignados } from "@/lib/tareas";
import { normalizePrioridad } from "@/lib/domain-constants";
import { fechaFinPorPlazo } from "@/lib/plazo";
import { linkTicketTarea } from "@/lib/ticket-tarea";
import { asignacionSoloPropia } from "@/lib/ticket-assign";
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
  pickTicketByOrigen,
  resumirTickets,
  ticketsKpisBases,
  updateTicketEstado,
  type TicketEstado,
} from "@/lib/tickets";
import {
  TicketAvanceError,
  descripcionTicketAvance,
  listAvancesTicket,
  registrarAvanceTicket,
} from "@/lib/ticket-avances";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = await getSessionFromRequest(req);
    if (!actor) return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    if (!hasRolePermission(actor, "tickets.ver")) {
      return NextResponse.json({ success: false, message: "Tu rol no tiene acceso a tickets." }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const itemParam = sp.get("item");
    if (itemParam !== null) {
      const itemCod = Number(itemParam);
      const rawDb = sp.get("db") || "";
      const bases = await resolveTicketDatabaseIds();
      if (!Number.isSafeInteger(itemCod) || itemCod <= 0 || !bases.includes(rawDb)) {
        return NextResponse.json({ success: false, message: "Ticket no encontrado" }, { status: 404 });
      }
      const scope = actor.role === "developer" ? await ticketScopeForSession(actor) : null;
      const tickets = scope && !scope.aseCodes.length && !scope.perCodes.length
        ? []
        : await listTicketsAsignados({
            ticCod: itemCod,
            bases: [rawDb],
            limit: 1,
            ...(scope ? { aseCodes: scope.aseCodes, perCodes: scope.perCodes } : {}),
          });
      let ticket = tickets.find((t) => t.Tic_Cod === itemCod && t.Db_Origen === rawDb);
      // Un desarrollador tambien puede abrir tickets sin asignar para tomarselos.
      if (!ticket && scope) {
        const candidatos = await listTicketsAsignados({ ticCod: itemCod, bases: [rawDb], limit: 1 });
        const cand = candidatos.find(
          (t) =>
            t.Tic_Cod === itemCod &&
            t.Db_Origen === rawDb &&
            (t.Asignado_Usu_Cod ?? 0) === 0 &&
            (!t.Asignados || t.Asignados.length === 0)
        );
        if (cand) ticket = cand;
      }
      if (!ticket) {
        return NextResponse.json({ success: false, message: "Ticket no encontrado" }, { status: 404 });
      }
      return NextResponse.json({ success: true, ticket });
    }
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

    const historial = parseInt(sp.get("historial") || "0", 10);
    if (historial > 0) {
      const session = await getSessionFromRequest(req);
      if (!session) {
        return NextResponse.json({ success: false, message: "Debe iniciar sesion." }, { status: 401 });
      }
      const prefer = sp.get("Db_Origen") || sp.get("Ses_Dat_Dis");
      let ticketDb = sanitizeDbDis(prefer);
      if (!canAssignWork(session.role) && !canSeeOversight(session.role)) {
        const scope = await ticketScopeForSession(session);
        const mio = await findTicketAsignado({
          ticCod: historial,
          aseCodes: scope.aseCodes,
          perCodes: scope.perCodes,
          preferDb: prefer,
        });
        if (!mio) {
          return NextResponse.json(
            { success: false, message: "Ese ticket no esta asignado a ti." },
            { status: 403 }
          );
        }
        ticketDb = mio.Db_Origen || ticketDb;
      }
      const avances = await listAvancesTicket(ticketDb, historial);
      return NextResponse.json({
        success: true,
        Tic_Cod: historial,
        porcentaje: avances[0]?.Ava_Porcentaje ?? 0,
        avances,
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
      const assigned =
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
      const kpisMios = resumirTickets(assigned);
      const vista =
        bandeja === "resueltos"
          ? "resueltos"
          : bandeja === "todos"
              ? "todos"
              : "asignados";
      const tickets =
        vista === "resueltos"
          ? assigned.filter((t) => t.Tic_Estado === "Cerrado")
            : vista === "todos"
              ? assigned
              : assigned.filter((t) => t.Tic_Estado !== "Cerrado");
      const payload: Record<string, unknown> = {
        success: true,
        db,
        source: "tickets-mios",
        solo_mios: true,
        tickets,
        kpis: kpisMios,
        bandeja: vista,
        desde: desde || null,
        hasta: hasta || null,
      };
      if (withAssignees) {
        // Un desarrollador solo puede asignarse tickets a si mismo: el dialogo
        // muestra unicamente su ficha.
        const propios = (await listTicketAssignees()).filter(
          (a) =>
            (a.Usu_Cod != null && scope.aseCodes.includes(a.Usu_Cod)) ||
            (a.Per_Cod != null && a.Per_Cod > 0 && scope.perCodes.includes(a.Per_Cod))
        );
        payload.asignables = propios.length
          ? propios
          : scope.aseCodes.length
            ? [
                {
                  Per_Cod: scope.perCodes[0] || 0,
                  Usu_Cod: scope.aseCodes[0],
                  Nombre: session.name,
                  Cedula: session.cedula,
                  Rol: "developer",
                },
              ]
            : [];
      }
      return NextResponse.json(payload);
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

    if (!session) return NextResponse.json({ success: false, message: "No autenticado" }, { status: 401 });
    const needed = action === "create" || action === "attach_evidencias"
      ? "tickets.crear"
      : action === "assign"
        ? "tickets.asignar"
        : "tickets.avance";
    if (!hasRolePermission(session, needed)) {
      return NextResponse.json({ success: false, message: "Tu rol no tiene permiso para esa accion." }, { status: 403 });
    }

    if (!canAssignWork(session?.role)) {
      // El desarrollador puede moverse entre estados/avance y asignarse
      // tickets a si mismo (la asignacion se valida mas abajo).
      const devOk =
        session?.role === "developer" &&
        (action === "estado" || action === "avance" || action === "assign");
      if (!devOk) {
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

    if (action === "convertir_tarea") {
      // Decisión manual de atención al cliente o el encargado.
      if (!canAssignWork(session.role)) {
        return NextResponse.json(
          {
            success: false,
            message: "Solo atención al cliente o el encargado pueden convertir un ticket en tarea.",
          },
          { status: 403 }
        );
      }
      const ticCod = Number(body.Tic_Cod || 0);
      if (!ticCod) {
        return NextResponse.json({ success: false, message: "Tic_Cod requerido" }, { status: 400 });
      }
      const preferDb = body.Db_Origen != null ? String(body.Db_Origen) : db;
      const rows = await listTicketsAsignados({ ticCod, limit: 5 });
      const ticket = pickTicketByOrigen(rows, preferDb);
      if (!ticket) {
        return NextResponse.json({ success: false, message: "Ticket no encontrado." }, { status: 404 });
      }
      if (ticket.Tar_Cod && ticket.Tar_Cod > 0) {
        return NextResponse.json(
          {
            success: false,
            message: `El ticket ya está convertido en la tarea #${ticket.Tar_Cod}.`,
            Tar_Cod: ticket.Tar_Cod,
          },
          { status: 409 }
        );
      }
      const ticDb = ticket.Db_Origen || preferDb;
      const tasksDb = tasksDbDis();
      const origen =
        ticDb === "servicios"
          ? "Servicios"
          : ticDb.startsWith("relavera")
            ? "Relavera"
            : "EXA";
      const partes = [`Convertido desde el ticket #${ticket.Tic_Cod} (${origen}).`];
      if (ticket.Tic_Descripcion && String(ticket.Tic_Descripcion).trim()) {
        partes.push(String(ticket.Tic_Descripcion).trim());
      }

      // Prioridad elegida en el diálogo (por defecto la del ticket).
      const prioridad = normalizePrioridad(
        body.prioridad != null ? String(body.prioridad) : null,
        normalizePrioridad(ticket.Tic_Prioridad)
      );
      // Plazo: fija la fecha de fin de la tarea (Diaria = hoy, Semanal = +7, Mensual = +1 mes).
      const fechaFin =
        body.fechaFin != null && body.fechaFin !== ""
          ? String(body.fechaFin)
          : fechaFinPorPlazo(body.plazo != null ? String(body.plazo) : null);

      // Asignación múltiple (Per_Cods). `perCodAsignar` sigue funcionando por compatibilidad.
      const perCods = Array.isArray(body.perCods)
        ? (body.perCods as unknown[])
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
      if (!perCods.length && Number(body.perCodAsignar || 0) > 0) {
        perCods.push(Number(body.perCodAsignar));
      }

      let tarCod = 0;
      let tarea: Awaited<ReturnType<typeof createTarea>> | null = null;
      try {
        tarea = await createTarea(tasksDb, {
          titulo: ticket.Tic_Titulo || `Ticket #${ticket.Tic_Cod}`,
          descripcion: partes.join("\n\n"),
          prioridad,
          complejidad: body.complejidad != null ? String(body.complejidad) : "Media",
          fechaFin,
          empCod: tasksEmpCod(),
          usuCreador: session?.usuCod || undefined,
        });
        tarCod = Number((tarea as { Tar_Cod: number }).Tar_Cod);
        if (perCods.length) {
          await setTareaAsignados(tasksDb, tarCod, perCods);
        }
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : "No se pudo crear la tarea.";
        return NextResponse.json({ success: false, message: mensaje }, { status: 400 });
      }

      await linkTicketTarea({ tarCod, ticCod, ticDb });
      publishEvent({
        type: "tarea_creada",
        title: "Ticket convertido a tarea",
        message: `Ticket #${ticCod} · tarea #${tarCod} · ${String(ticket.Tic_Titulo || "").slice(0, 60)}`,
        db: tasksDb,
        tarCod,
        ticCod,
        kind: "tarea",
        actor: session?.name,
      });
      return NextResponse.json({ success: true, tarea, Tic_Cod: ticCod, Tar_Cod: tarCod });
    }

    if (action === "assign") {
      const ticCod = Number(body.Tic_Cod || 0);
      const rawList = Array.isArray(body.asignados) ? body.asignados : [];
      let asignados = rawList
        .map((a: { Usu_Cod?: number; usuCod?: number; Per_Cod?: number; perCod?: number }) => ({
          usuCod: Number(a.Usu_Cod ?? a.usuCod ?? 0),
          perCod: Number(a.Per_Cod ?? a.perCod ?? 0) || undefined,
        }))
        .filter((a: { usuCod: number }) => a.usuCod > 0);
      let usuCod = Number(body.Usu_Cod || 0);
      let perCod = body.Per_Cod ? Number(body.Per_Cod) : undefined;
      if (!ticCod) {
        return NextResponse.json(
          { success: false, message: "Tic_Cod y al menos un desarrollador son requeridos" },
          { status: 400 }
        );
      }
      if (session.role === "developer") {
        // Solo puede asignarse el ticket a si mismo (sin tocar a otros).
        const scope = await ticketScopeForSession(session);
        const destino = asignacionSoloPropia(
          asignados.length ? asignados : usuCod ? [{ usuCod, perCod }] : [],
          scope
        );
        if (!destino) {
          return NextResponse.json(
            { success: false, message: "Solo puedes asignarte el ticket a ti mismo." },
            { status: 403 }
          );
        }
        asignados = destino;
        usuCod = destino[0].usuCod;
        perCod = destino[0].perCod;
      } else if (!usuCod && !asignados.length) {
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

    if (action === "avance") {
      const ticCod = Number(body.Tic_Cod || 0);
      const porcentaje = Number(body.porcentaje ?? 0);
      if (!ticCod) {
        return NextResponse.json({ success: false, message: "Tic_Cod requerido" }, { status: 400 });
      }
      if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        return NextResponse.json(
          { success: false, message: "Porcentaje debe estar entre 0 y 100." },
          { status: 400 }
        );
      }
      const scope = session ? await ticketScopeForSession(session) : { aseCodes: [] as number[], perCodes: [] as number[] };
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
      const descripcion = descripcionTicketAvance(body, ticCod);
      if (!descripcion.trim()) {
        return NextResponse.json(
          { success: false, message: "Describe lo que avanzaste para registrar el avance." },
          { status: 400 }
        );
      }
      const ticketDb = mio.Db_Origen || db;
      const res = await registrarAvanceTicket(ticketDb, {
        ticCod,
        porcentaje,
        descripcion,
        usuCod: session?.usuCod || undefined,
        perCod: scope.perCodes[0],
      });
      publishEvent({
        type: "avance_registrado",
        title: "Avance de ticket",
        message: `${session?.name || "Usuario"} · ticket #${ticCod} · ${res.porcentaje}%`,
        db: ticketDb,
        ticCod,
        porcentaje: res.porcentaje,
        actor: session?.name,
        estado: res.estado || mio.Tic_Estado,
        kind: "ticket",
      });
      return NextResponse.json({ success: true, ...res, Tic_Cod: ticCod });
    }

    if (action === "estado") {
      const ticCod = Number(body.Tic_Cod || 0);
      const estado = String(body.estado || "") as TicketEstado;
      if (!ticCod || !estado) {
        return NextResponse.json({ success: false, message: "Datos incompletos" }, { status: 400 });
      }
      if (estado === "Cerrado") {
        return NextResponse.json(
          { success: false, message: "El ticket se resuelve al registrar el avance en 100%." },
          { status: 400 }
        );
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
    return NextResponse.json({ success: false, message: mensaje }, { status: err instanceof TicketAvanceError ? err.status : 500 });
  }
}
