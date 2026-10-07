import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { publishEvent } from "@/lib/events";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import {
  actividadPersonal,
  descripcionAvanceDesdeBody,
  getTareaDetalle,
  listTareas,
  registrarAvance,
} from "@/lib/tareas";
import { ticketScopeForSession } from "@/lib/ticket-scope";
import {
  findTicketAsignado,
  kanbanToTicketEstado,
  listTicketsAsignados,
  ticketAsTarea,
  updateTicketEstado,
  type TicketEstado,
} from "@/lib/tickets";
import { descripcionTicketAvance, registrarAvanceTicket } from "@/lib/ticket-avances";
import { hoyFecha } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Mis tareas vive en Emp_Cod=96 / Dat_Dis=exa (personal + aud_tareas).
 * Los tickets asignados se listan de EXA y Servicios (Usu_Cod o Per_Cod).
 * No usar el toggle de proyecto (servicios) para resolver Per_Cod ni las tareas.
 */

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, message: "Debe iniciar sesion." }, { status: 401 });
  }

  try {
    const sp = req.nextUrl.searchParams;
    const project = sp.get("project") || session.projects[0] || tasksDbDis();
    if (!session.projects.includes(project) && session.role !== "manager") {
      return NextResponse.json({ success: false, message: "Sin acceso a este proyecto." }, { status: 403 });
    }
    // Scope fijo MATRIZ: personal y tareas de Emp 96 estan en exa
    const db = tasksDbDis();
    const empCod = tasksEmpCod(sp.get("Emp_Cod"));
    const { perCod, aseCodes, perCodes } = await ticketScopeForSession(session);

    const detalleCod = parseInt(sp.get("detalle") || "0", 10);
    if (detalleCod > 0) {
      const propias = perCod > 0 ? await listTareas(db, { perCod }) : [];
      if (session.role !== "manager" && !propias.some((t) => t.Tar_Cod === detalleCod)) {
        return NextResponse.json(
          { success: false, message: "Esa tarea no esta asignada a ti." },
          { status: 403 }
        );
      }
      const capturasDias = parseInt(sp.get("capturas_dias") || "7", 10);
      const capturasDesde = sp.get("capturas_desde") || sp.get("desde") || null;
      const capturasHasta = sp.get("capturas_hasta") || sp.get("hasta") || null;
      const detalle = await getTareaDetalle(db, detalleCod, {
        capturasDias,
        capturasDesde,
        capturasHasta,
        includeCapturas: session.role === "manager",
        capturasLimit: parseInt(sp.get("capturas_limit") || "80", 10) || 80,
      });
      if (!detalle) {
        return NextResponse.json({ success: false, message: "Tarea no encontrada" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        db,
        can_view_capturas: session.role === "manager",
        ...detalle,
      });
    }

    const estado = sp.get("estado") || "todos";
    const q = sp.get("q") || "";
    const emptyBecauseNoPer = perCod <= 0;

    const tareasRaw = emptyBecauseNoPer
      ? []
      : await listTareas(db, {
          empCod,
          perCod,
          estado,
          q,
        });

    const tareas = tareasRaw.map((t) => ({ ...t, tipo: "tarea" as const }));

    const ticketsRaw =
      aseCodes.length || perCodes.length
        ? await listTicketsAsignados({
            aseCodes,
            perCodes,
            q: q || undefined,
            limit: 300,
          })
        : [];
    const tickets = ticketsRaw.map(ticketAsTarea);

    const itemRecency = (t: {
      Tar_Fecha_Inicio?: string | Date | null;
      Tar_Fecha_Culminacion?: string | Date | null;
      Ava_Ultima_Fecha?: string | Date | null;
      Tar_Cod: number;
    }) => {
      const iso = t.Ava_Ultima_Fecha || t.Tar_Fecha_Culminacion || t.Tar_Fecha_Inicio || "";
      const ts = iso ? new Date(iso).getTime() : 0;
      return Number.isFinite(ts) ? ts : 0;
    };
    const items = [...tareas, ...tickets].sort((a, b) => {
      const diff = itemRecency(b) - itemRecency(a);
      return diff !== 0 ? diff : b.Tar_Cod - a.Tar_Cod;
    });

    const hoy = hoyFecha();
    let completadas = 0;
    let proceso = 0;
    let pendientes = 0;
    let atrasadas = 0;
    let suma = 0;
    for (const t of items) {
      const pct = t.Ava_Porcentaje || 0;
      suma += pct;
      if (t.Tar_Estado === "Finalizada" || pct >= 100) completadas++;
      else if (pct > 0 || t.Tar_Estado === "En Proceso") proceso++;
      else pendientes++;
      const fin = t.Tar_Fecha_Fin ? String(t.Tar_Fecha_Fin).slice(0, 10) : "";
      if (t.Tar_Estado !== "Finalizada" && pct < 100 && fin && fin < hoy) atrasadas++;
    }
    const total = items.length;
    const dias = parseInt(sp.get("dias") || "30", 10) || 30;
    const desdeQ = sp.get("desde") || undefined;
    const hastaQ = sp.get("hasta") || undefined;
    const actividad = emptyBecauseNoPer
      ? { desde: new Date().toISOString(), dias, avances: [], tiempo: [] }
      : await actividadPersonal(db, {
          perCod,
          tarCodes: tareas.map((t) => t.Tar_Cod),
          dias,
          desde: desdeQ,
          hasta: hastaQ,
        });

    return NextResponse.json({
      success: true,
      project,
      db,
      Emp_Cod: empCod,
      role: session.role,
      perCod,
      usuCod: session.usuCod,
      aseCodes,
      warning: emptyBecauseNoPer
        ? "Tu usuario EXA no tiene ficha en personal. Pide vincular tu Per_Cod para ver tus tareas. Los tickets asignados a tu usuario sí se listan."
        : null,
      kpis: {
        total,
        completadas,
        proceso,
        pendientes,
        atrasadas,
        avance_promedio: total ? Math.round(suma / total) : 0,
        tasa_cumplimiento: total ? Math.round((completadas / total) * 1000) / 10 : 0,
        tareas: tareas.length,
        tickets: tickets.length,
      },
      tareas: items,
      tickets,
      actividad,
      user: {
        name: session.name,
        username: session.cedula,
        cedula: session.cedula,
        role: session.role,
      },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ success: false, message: "Debe iniciar sesion." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const project = String(body.project || session.projects[0] || tasksDbDis());
    if (!session.projects.includes(project) && session.role !== "manager") {
      return NextResponse.json({ success: false, message: "Sin acceso a este proyecto." }, { status: 403 });
    }
    const db = tasksDbDis();
    const action = String(body.action || "avance");

    if (action === "ticket_estado") {
      const ticCod = Number(body.Tic_Cod || body.Tar_Cod || 0);
      const estadoRaw = String(body.estado || "");
      if (!ticCod || !estadoRaw) {
        return NextResponse.json({ success: false, message: "Tic_Cod y estado requeridos" }, { status: 400 });
      }
      const { aseCodes, perCodes } = await ticketScopeForSession(session);
      if (!aseCodes.length && !perCodes.length) {
        return NextResponse.json({ success: false, message: "Sin usuario vinculado en sesion." }, { status: 403 });
      }
      const mio = await findTicketAsignado({
        ticCod,
        aseCodes,
        perCodes,
        preferDb: body.Db_Origen || body.Ses_Dat_Dis,
      });
      if (!mio) {
        return NextResponse.json(
          { success: false, message: "Ese ticket no esta asignado a ti." },
          { status: 403 }
        );
      }
      const estado: TicketEstado = kanbanToTicketEstado(estadoRaw);
      if (estado === "Cerrado") {
        return NextResponse.json(
          { success: false, message: "El ticket se resuelve al registrar el avance en 100%." },
          { status: 400 }
        );
      }
      await updateTicketEstado(mio.Db_Origen || db, ticCod, estado);
      publishEvent({
        type: "estado_cambiado",
        title: "Ticket actualizado",
        message: `${session.name || "Usuario"} · ticket #${ticCod} → ${estado}`,
        db: mio.Db_Origen || db,
        ticCod,
        estado,
        kind: "ticket",
        actor: session.name,
      });
      return NextResponse.json({ success: true, Tic_Cod: ticCod, estado });
    }

    if (action === "avance" && (body.tipo === "ticket" || body.Tic_Cod)) {
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
      const { aseCodes, perCodes, perCod } = await ticketScopeForSession(session);
      const mio = await findTicketAsignado({
        ticCod,
        aseCodes,
        perCodes,
        preferDb: body.Db_Origen,
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
      const res = await registrarAvanceTicket(mio.Db_Origen || db, {
        ticCod,
        porcentaje,
        descripcion,
        usuCod: session.usuCod || undefined,
        perCod,
      });
      publishEvent({
        type: "avance_registrado",
        title: "Avance de ticket",
        message: `${session.name || "Usuario"} · ticket #${ticCod} · ${res.porcentaje}%`,
        db: mio.Db_Origen || db,
        ticCod,
        porcentaje: res.porcentaje,
        actor: session.name,
        estado: res.estado || mio.Tic_Estado,
        kind: "ticket",
      });
      return NextResponse.json({ success: true, ...res, Tic_Cod: ticCod });
    }

    if (action === "avance") {
      const tarCod = Number(body.Tar_Cod || 0);
      const porcentaje = Number(body.porcentaje ?? 0);
      if (!tarCod) {
        return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });
      }

      const { perCod } = await ticketScopeForSession(session);
      const tareas = await listTareas(db, { perCod: perCod > 0 ? perCod : undefined });
      if (perCod <= 0 || !tareas.some((t) => t.Tar_Cod === tarCod)) {
        return NextResponse.json(
          { success: false, message: "No puedes actualizar esa tarea (no esta asignada a ti)." },
          { status: 403 }
        );
      }

      const descripcion = descripcionAvanceDesdeBody(body, tarCod);
      if (!descripcion.trim()) {
        return NextResponse.json(
          { success: false, message: "Describe lo que avanzaste para registrar el avance." },
          { status: 400 }
        );
      }
      const res = await registrarAvance(db, {
        tarCod,
        porcentaje,
        descripcion,
        usuCod: session.usuCod || undefined,
      });
      publishEvent({
        type: "avance_registrado",
        title: "Avance registrado",
        message: `${session.name || "Usuario"} · #${tarCod} · ${res.porcentaje}%`,
        db,
        tarCod,
        porcentaje: res.porcentaje,
        actor: session.name,
        estado: res.porcentaje >= 100 ? "Finalizada" : "En Proceso",
      });
      return NextResponse.json({ success: true, ...res });
    }

    return NextResponse.json({ success: false, message: "Accion no permitida" }, { status: 400 });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
