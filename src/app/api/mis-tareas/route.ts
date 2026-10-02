import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { resolvePerCod } from "@/lib/auth/resolvePer";
import { matchTeamMember } from "@/lib/auth/users";
import { getPrisma } from "@/lib/db";
import { publishEvent } from "@/lib/events";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import { resolveUsuCodesFromPer } from "@/lib/monitoreo";
import {
  actividadPersonal,
  descripcionAvanceDesdeBody,
  getTareaDetalle,
  listTareas,
  registrarAvance,
} from "@/lib/tareas";
import {
  kanbanToTicketEstado,
  listTickets,
  ticketAsTarea,
  updateTicketEstado,
  type TicketEstado,
} from "@/lib/tickets";
import { hoyFecha } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Mis tareas vive en Emp_Cod=96 / Dat_Dis=exa (personal + aud_tareas).
 * Los tickets asignados (Ase_Cod ∈ Usu_Cod del colaborador) también se listan aquí.
 * No usar el toggle de proyecto (servicios) para resolver Per_Cod ni listar.
 */
async function perForSession(session: {
  perCod: number;
  prsCod: number;
  cedula: string;
  name: string;
}) {
  const db = tasksDbDis();
  const team = matchTeamMember(session.name);
  return resolvePerCod(db, {
    perCod: session.perCod > 0 ? session.perCod : undefined,
    prsCod: session.prsCod,
    cedula: session.cedula,
    nameMatch: team?.nameMatch,
  });
}

/** Todos los Usu_Cod con los que puede aparecer Ase_Cod (sesión + multi-sucursal). */
async function aseCodesForSession(session: {
  usuCod: number;
  perCod: number;
  prsCod: number;
  cedula: string;
  name: string;
}) {
  const db = tasksDbDis();
  const codes = new Set<number>();
  if (session.usuCod > 0) codes.add(session.usuCod);
  const perCod = await perForSession(session);
  if (perCod > 0) {
    const prisma = getPrisma(db);
    for (const c of await resolveUsuCodesFromPer(prisma, perCod)) {
      if (c > 0) codes.add(c);
    }
  }
  return { perCod, aseCodes: [...codes] };
}

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
    const { perCod, aseCodes } = await aseCodesForSession(session);

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

    const ticketsRaw = aseCodes.length
      ? await listTickets(db, { aseCodes, q: q || undefined, limit: 300 })
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
        ? "Tu usuario EXA no tiene ficha en personal. Pide vincular tu Per_Cod para ver Mis tareas (los tickets asignados sí se listan)."
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
      const { aseCodes } = await aseCodesForSession(session);
      if (!aseCodes.length) {
        return NextResponse.json({ success: false, message: "Sin Usu_Cod en sesion." }, { status: 403 });
      }
      const mios = await listTickets(db, { aseCodes, limit: 500 });
      if (!mios.some((t) => t.Tic_Cod === ticCod)) {
        return NextResponse.json(
          { success: false, message: "Ese ticket no esta asignado a ti." },
          { status: 403 }
        );
      }
      const estado: TicketEstado = kanbanToTicketEstado(estadoRaw);
      await updateTicketEstado(db, ticCod, estado);
      publishEvent({
        type: "estado_cambiado",
        title: "Ticket actualizado",
        message: `${session.name || "Usuario"} · ticket #${ticCod} → ${estado}`,
        db,
        ticCod,
        estado,
        kind: "ticket",
        actor: session.name,
      });
      return NextResponse.json({ success: true, Tic_Cod: ticCod, estado });
    }

    if (action === "avance") {
      const tarCod = Number(body.Tar_Cod || 0);
      const porcentaje = Number(body.porcentaje ?? 0);
      if (!tarCod) {
        return NextResponse.json({ success: false, message: "Tar_Cod requerido" }, { status: 400 });
      }

      const perCod = await perForSession(session);
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
