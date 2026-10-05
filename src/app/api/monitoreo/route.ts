import { NextRequest } from "next/server";
import { assertApiKey, isUploadedFile, jsonRes, pick, readBody } from "@/lib/api";
import { authenticateByCedula } from "@/lib/auth/exaLogin";
import { canAssignWork } from "@/lib/auth/users";
import { saveEvidencia, saveScreenshot, toPublicCaptureUrl } from "@/lib/captures";
import { altDatabase, getPrisma, telemetriaMirrorEnabled } from "@/lib/db";
import { consumeDevNotifications, publishAsignacion, publishEvent } from "@/lib/events";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import {
  findDesarrollador,
  mapDevResponse,
  resolvePanelRol,
  resolveUsuCodFromPer,
  resolveUsuCodesFromPer,
  syncPresenciaAlt,
  tareasActivasDev,
  upsertPresencia,
} from "@/lib/monitoreo";
import { ensureMonitoreoSchema } from "@/lib/monitoreo-global";
import {
  descripcionAvanceDesdeBody,
  getTareaDetalle,
  registrarAvance,
} from "@/lib/tareas";
import { isImagePath } from "@/lib/avance-format";
import {
  attachTicketEvidencias,
  assignTicket,
  kanbanToTicketEstado,
  listTicketAssignees,
  listTickets,
  ticketEstadoToKanban,
  updateTicketEstado,
} from "@/lib/tickets";
// Auto-purga NO en hot path: satura MySQL. Ejecutar desde Config → ExaMonitor.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapNotificaciones(perCod: number, usuCod?: number) {
  return consumeDevNotifications({ perCod, usuCod }).map((n) => ({
    id: n.id,
    tipo: n.type,
    titulo: n.title,
    mensaje: n.message,
    Tar_Cod: n.tarCod ?? null,
    Tic_Cod: n.ticCod ?? null,
    kind: n.kind || null,
    at: n.at,
  }));
}

async function bandejaAgente(
  prisma: Awaited<ReturnType<typeof getPrisma>>,
  perCod: number,
  usuHint?: number,
  rolHint?: string | null
) {
  const usuCod =
    usuHint && usuHint > 0 ? usuHint : await resolveUsuCodFromPer(prisma, perCod);
  const rol = rolHint || (await resolvePanelRol(prisma, perCod)) || "developer";
  const tareas = await tareasActivasDev(prisma, perCod, usuCod || undefined, rol);
  return { usuCod: usuCod || 0, rol, tareas };
}

async function asignablesMonitor() {
  const rows = await listTicketAssignees();
  return rows
    .filter((a) => a.Usu_Cod && a.Usu_Cod > 0)
    .map((a) => ({
      Per_Cod: a.Per_Cod,
      Usu_Cod: a.Usu_Cod as number,
      Nombre: a.Nombre,
    }));
}

async function handle(req: NextRequest) {
  const keyErr = assertApiKey(req);
  if (keyErr) return keyErr;

  try {
    const { form, json } = await readBody(req);
    const accion = pick(form, json, req, "accion").trim();
    // Scope fijo: Emp_Cod=96 / Dat_Dis=exa (Torres Carrion MATRIZ)
    const dbDis = tasksDbDis();
    const empCod = tasksEmpCod();
    const prisma = getPrisma(dbDis);
    await ensureMonitoreoSchema(prisma);

    if (accion === "login") {
      const cedula =
        pick(form, json, req, "cedula").trim() ||
        pick(form, json, req, "identificador").trim();
      const password =
        pick(form, json, req, "password") ||
        pick(form, json, req, "clave") ||
        pick(form, json, req, "Usu_Pal");
      if (!cedula || !password) {
        return jsonRes("error", "Cedula y contrasena EXA son obligatorias.");
      }

      const { user, reason } = await authenticateByCedula(cedula, password, dbDis);
      if (!user) {
        return jsonRes("error", reason || "Cedula o contrasena incorrectas.");
      }
      if (!user.perCod || user.perCod <= 0) {
        return jsonRes(
          "error",
          "Tu usuario EXA es valido, pero no tiene ficha en personal de Emp_Cod=" +
            empCod +
            " (MATRIZ). Pide vincular tu Per_Cod."
        );
      }

      const prismaUser = getPrisma(user.dbDis || dbDis);
      const row = await findDesarrollador(prismaUser, String(user.perCod));
      if (!row) {
        return jsonRes(
          "error",
          "Usuario autenticado, pero no se encontro ficha de personal activa en Emp_Cod=" +
            empCod +
            "."
        );
      }

      const mac = pick(form, json, req, "mac_address").replace(/[^0-9A-Fa-f:]/g, "").slice(0, 32);
      const version = pick(form, json, req, "version_agente", "1.1").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 20);

      await upsertPresencia(prismaUser, {
        perCod: row.Per_Cod,
        ventana: "ExaMonitor Conectado",
        proceso: "ExaMonitor.exe",
        esIde: 0,
        mac,
        version,
      });

      const { rol, tareas } = await bandejaAgente(prismaUser, row.Per_Cod, user.usuCod, user.role);
      const refreshed = await findDesarrollador(prismaUser, String(row.Per_Cod));
      const mapped = await mapDevResponse(prismaUser, refreshed || row);
      const notificaciones = mapNotificaciones(row.Per_Cod, user.usuCod);
      const asignables = canAssignWork(rol) ? await asignablesMonitor() : [];

      return jsonRes("ok", "Desarrollador autenticado con exito.", {
        desarrollador: {
          ...mapped,
          Cedula: user.cedula,
          Nombre: mapped.Nombre || user.name,
          Usu_Cod: user.usuCod,
          Db_Dis: user.dbDis,
          Emp_Cod: empCod,
          Rol: rol,
        },
        tareas,
        mis_tareas: tareas,
        asignables,
        notificaciones,
      });
    }

    if (accion === "heartbeat" || accion === "check_status") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const ventana = pick(form, json, req, "ventana_activa");
      const proceso = pick(form, json, req, "proceso_activo");
      const esIde = parseInt(pick(form, json, req, "es_ide", "0"), 10) || 0;
      const mac = pick(form, json, req, "mac_address").replace(/[^0-9A-Fa-f:]/g, "").slice(0, 32);
      const version = pick(form, json, req, "version_agente", "1.1").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 20);

      const presencia = { perCod, ventana, proceso, esIde, mac, version };
      await upsertPresencia(prisma, presencia);
      await syncPresenciaAlt(dbDis, presencia);

      const row = await findDesarrollador(prisma, String(perCod));
      if (!row) return jsonRes("error", "Desarrollador no encontrado.");

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      const { rol, tareas } = await bandejaAgente(prisma, perCod, usuCod || undefined);
      const mapped = await mapDevResponse(prisma, row);
      const notificaciones = mapNotificaciones(perCod, usuCod || undefined);
      const asignables = canAssignWork(rol) ? await asignablesMonitor() : [];

      return jsonRes("ok", "Presencia y estado sincronizados.", {
        Mon_Activo: mapped.Mon_Activo,
        Mon_Intervalo_Minutos: mapped.Mon_Intervalo_Minutos,
        Mon_Captura_Pantalla: mapped.Mon_Captura_Pantalla,
        Mon_Forzar_Bandeja: mapped.Mon_Forzar_Bandeja,
        Mon_Permitir_Salir: mapped.Mon_Permitir_Salir,
        Rol: rol,
        tareas,
        mis_tareas: tareas,
        asignables,
        notificaciones,
      });
    }

    if (accion === "subir_telemetria") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const tarRaw = pick(form, json, req, "Tar_Cod");
      const ticRaw = pick(form, json, req, "Tic_Cod");
      let tarCod = tarRaw ? parseInt(tarRaw, 10) : null;
      let ticCod = ticRaw ? parseInt(ticRaw, 10) : null;
      if (tarCod && tarCod > 0) {
        // El combo del agente puede enviar Tic_Cod como Tar_Cod.
        const hit = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT 1 AS n FROM aud_tareas WHERE Tar_Cod = ? AND Tar_Est = 'A' LIMIT 1`,
          tarCod
        );
        if (!hit.length) {
          if (!ticCod || ticCod <= 0) ticCod = tarCod;
          tarCod = null;
        }
      }
      const clicks = parseInt(pick(form, json, req, "clicks", "0"), 10) || 0;
      const teclas = parseInt(pick(form, json, req, "teclas", "0"), 10) || 0;
      const segundos = parseInt(pick(form, json, req, "segundos_activos", "0"), 10) || 0;
      const porc = parseFloat(pick(form, json, req, "porc_actividad", "0")) || 0;
      const ventana = pick(form, json, req, "ventana_activa").slice(0, 250);
      const proceso = pick(form, json, req, "proceso_activo").slice(0, 95);
      const esIde = parseInt(pick(form, json, req, "es_ide", "0"), 10) || 0;
      const lineas = parseInt(pick(form, json, req, "lineas_estimadas", "0"), 10) || 0;
      const mac = pick(form, json, req, "mac_address").replace(/[^0-9A-Fa-f:]/g, "").slice(0, 32);
      const version = pick(form, json, req, "version_agente", "1.1").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 20);

      let capturaRuta: string | null = null;
      const shot = form?.get("screenshot");
      if (isUploadedFile(shot) && shot.size > 0) {
        capturaRuta = await saveScreenshot(perCod, shot);
      }

      const telData = {
        Per_Cod: perCod,
        Tar_Cod: tarCod && tarCod > 0 ? tarCod : null,
        Tel_Fecha_Hora: new Date(),
        Tel_Clicks: clicks,
        Tel_Teclas: teclas,
        Tel_Segundos_Activos: segundos,
        Tel_Porc_Actividad: porc,
        Tel_Ventana_Activa: ventana || null,
        Tel_Proceso_Activo: proceso || null,
        Tel_Es_IDE: esIde,
        Tel_Lineas_Estimadas: lineas,
        Tel_Captura_Ruta: capturaRuta,
        Tel_Estado: "OK",
        Tel_Mac_Address: mac || null,
      };

      const created = await prisma.aud_dev_telemetria.create({ data: telData });

      if (ticCod && ticCod > 0) {
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE aud_dev_telemetria SET Tic_Cod = ? WHERE Tel_Cod = ?`,
            ticCod,
            created.Tel_Cod
          );
        } catch {
          /* columna Tic_Cod puede no existir aún */
        }
      }

      const presencia = { perCod, ventana, proceso, esIde, mac, version };
      await upsertPresencia(prisma, presencia);

      // Mirror a BD secundaria solo si TELEMETRIA_MIRROR=1 (ahorra conexiones)
      if (telemetriaMirrorEnabled()) {
        try {
          const alt = getPrisma(altDatabase(dbDis));
          const createdAlt = await alt.aud_dev_telemetria.create({ data: telData });
          if (ticCod && ticCod > 0) {
            try {
              await alt.$executeRawUnsafe(
                `UPDATE aud_dev_telemetria SET Tic_Cod = ? WHERE Tel_Cod = ?`,
                ticCod,
                createdAlt.Tel_Cod
              );
            } catch {
              /* ignore */
            }
          }
          await upsertPresencia(alt, presencia);
        } catch {
          /* ignore secondary */
        }
      }

      return jsonRes("ok", "Telemetria registrada correctamente.", {
        captura_guardada: capturaRuta !== null,
        captura_ruta: capturaRuta,
      });
    }

    if (accion === "detalle_trabajo") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const tipo = (pick(form, json, req, "tipo") || "tarea").trim().toLowerCase();
      const cod =
        parseInt(pick(form, json, req, "Tar_Cod"), 10) ||
        parseInt(pick(form, json, req, "Tic_Cod"), 10) ||
        0;
      if (cod <= 0) return jsonRes("error", "Codigo de trabajo invalido.");

      const row = await findDesarrollador(prisma, String(perCod));
      if (!row) return jsonRes("error", "Desarrollador no encontrado.");

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      const rol = (await resolvePanelRol(prisma, perCod)) || "developer";
      const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
      if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) aseCodes.unshift(usuCod);

      if (tipo === "ticket") {
        const mesa = canAssignWork(rol);
        const ticket = mesa
          ? (await listTickets(dbDis, { ticCod: cod, limit: 1 }))[0]
          : (await listTickets(dbDis, { aseCodes, limit: 300 })).find((t) => t.Tic_Cod === cod);
        if (!ticket) {
          return jsonRes("error", "Ticket no encontrado o no asignado a ti.");
        }
        const sinAsignar = !ticket.Asignado_Usu_Cod;
        if (mesa && !sinAsignar) {
          return jsonRes("error", "Este ticket ya fue asignado.");
        }
        const asignables = mesa ? await asignablesMonitor() : [];
        return jsonRes("ok", "Detalle de ticket.", {
          tipo: "ticket",
          trabajo: {
            Cod: ticket.Tic_Cod,
            Titulo: ticket.Tic_Titulo,
            Descripcion: ticket.Tic_Descripcion || "",
            Prioridad: ticket.Tic_Prioridad || "Media",
            Complejidad: null,
            Estado: mesa && sinAsignar ? "Por asignar" : ticketEstadoToKanban(ticket.Tic_Estado),
            Fecha_Fin: null,
            Ava_Porcentaje:
              ticket.Tic_Estado === "Cerrado"
                ? 100
                : ticket.Tic_Estado === "En Proceso"
                  ? 40
                  : ticket.Tic_Estado === "Asignado"
                    ? 10
                    : 0,
            puede_registrar_avance: false,
            puede_cambiar_estado: !mesa && ticket.Tic_Estado !== "Cerrado",
            puede_subir_evidencia: !mesa,
            puede_asignar: mesa && sinAsignar,
            Enviado_Por: ticket.Enviado_Por || ticket.Creador_Nombre || null,
            Empresa: ticket.Emp_Nom || null,
            Telefono: ticket.Tic_Tel || null,
            Proceso: ticket.Proceso || null,
            Asignado_Nombre: ticket.Asignado_Nombre || null,
          },
          evidencias: ticket.Evidencias || [],
          asignables,
        });
      }

      const assigned = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT 1 AS n FROM aud_tareas_asignadas
         WHERE Tar_Cod = ? AND Per_Cod = ? AND Tas_Est = 'A' LIMIT 1`,
        cod,
        perCod
      );
      if (!assigned.length) {
        return jsonRes("error", "Tarea no encontrada o no asignada a ti.");
      }

      const detalle = await getTareaDetalle(dbDis, cod, { includeCapturas: false });
      if (!detalle) return jsonRes("error", "No se pudo cargar el detalle de la tarea.");

      return jsonRes("ok", "Detalle de tarea.", {
        tipo: "tarea",
        trabajo: {
          Cod: detalle.tarea.Tar_Cod,
          Titulo: detalle.tarea.Tar_Titulo,
          Descripcion: detalle.tarea.Tar_Descripcion || "",
          Prioridad: detalle.tarea.Tar_Prioridad || "Media",
          Complejidad: detalle.tarea.Tar_Complejidad || "Media",
          Estado: detalle.tarea.Tar_Estado || "",
          Fecha_Fin: detalle.tarea.Tar_Fecha_Fin,
          Ava_Porcentaje: detalle.tarea.Ava_Porcentaje ?? 0,
          puede_registrar_avance: true,
          puede_cambiar_estado: false,
          puede_subir_evidencia: true,
        },
        evidencias: detalle.evidencias_iniciales || [],
        avances: (detalle.avances || []).slice(0, 8).map((a) => ({
          Ava_Porcentaje: a.Ava_Porcentaje,
          Ava_Fecha: a.Ava_Fecha,
          realizado: a.realizado || "",
          Autor: a.Autor || "",
        })),
      });
    }

    if (accion === "registrar_avance") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const tarCod = parseInt(pick(form, json, req, "Tar_Cod"), 10) || 0;
      if (tarCod <= 0) return jsonRes("error", "Tar_Cod invalido.");

      const porcentaje = Number(pick(form, json, req, "porcentaje", "0"));
      if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        return jsonRes("error", "Porcentaje debe estar entre 0 y 100.");
      }

      const realizado = pick(form, json, req, "realizado") || pick(form, json, req, "descripcion");
      if (!realizado.trim()) {
        return jsonRes("error", "Describe lo que avanzaste para registrar el avance.");
      }

      const assigned = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
        `SELECT 1 AS n FROM aud_tareas_asignadas
         WHERE Tar_Cod = ? AND Per_Cod = ? AND Tas_Est = 'A' LIMIT 1`,
        tarCod,
        perCod
      );
      if (!assigned.length) {
        return jsonRes("error", "No puedes actualizar esa tarea (no esta asignada a ti).");
      }

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      let adjuntos: string[] = [];
      const rawAdj = pick(form, json, req, "adjuntos");
      if (rawAdj.trim()) {
        try {
          const parsed = JSON.parse(rawAdj);
          if (Array.isArray(parsed)) adjuntos = parsed.map((x) => String(x));
        } catch {
          adjuntos = rawAdj.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
      const bodyAvance = {
        realizado,
        siguiente: pick(form, json, req, "siguiente"),
        bloqueos: pick(form, json, req, "bloqueos"),
        horas: pick(form, json, req, "horas"),
        adjuntos,
      };
      const descripcion = descripcionAvanceDesdeBody(bodyAvance, tarCod);
      const res = await registrarAvance(dbDis, {
        tarCod,
        porcentaje,
        descripcion,
        usuCod: usuCod || undefined,
      });

      publishEvent({
        type: "avance_registrado",
        title: "Avance registrado",
        message: `ExaMonitor · #${tarCod} · ${res.porcentaje}%`,
        db: dbDis,
        tarCod,
        porcentaje: res.porcentaje,
        actor: "ExaMonitor",
        estado: res.porcentaje >= 100 ? "Finalizada" : "En Proceso",
      });

      const { tareas } = await bandejaAgente(prisma, perCod, usuCod || undefined);
      return jsonRes("ok", "Avance registrado.", {
        porcentaje: res.porcentaje,
        Tar_Cod: tarCod,
        mis_tareas: tareas,
        tareas,
      });
    }

    if (accion === "cambiar_estado_ticket") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const ticCod =
        parseInt(pick(form, json, req, "Tic_Cod"), 10) ||
        parseInt(pick(form, json, req, "Tar_Cod"), 10) ||
        0;
      if (ticCod <= 0) return jsonRes("error", "Tic_Cod invalido.");

      const estadoRaw = pick(form, json, req, "estado").trim();
      if (!estadoRaw) return jsonRes("error", "Estado requerido.");

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
      if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) aseCodes.unshift(usuCod);
      if (!aseCodes.length) return jsonRes("error", "Sin Usu_Cod vinculado.");

      const mios = await listTickets(dbDis, { aseCodes, limit: 500 });
      if (!mios.some((t) => t.Tic_Cod === ticCod)) {
        return jsonRes("error", "Ese ticket no esta asignado a ti.");
      }

      const estado = kanbanToTicketEstado(estadoRaw);
      await updateTicketEstado(dbDis, ticCod, estado);
      publishEvent({
        type: "estado_cambiado",
        title: "Ticket actualizado",
        message: `ExaMonitor · ticket #${ticCod} → ${estado}`,
        db: dbDis,
        ticCod,
        estado,
        kind: "ticket",
        actor: "ExaMonitor",
      });

      const { tareas } = await bandejaAgente(prisma, perCod, usuCod || undefined);
      return jsonRes("ok", "Estado de ticket actualizado.", {
        Tic_Cod: ticCod,
        estado,
        Estado_Kanban: ticketEstadoToKanban(estado),
        mis_tareas: tareas,
        tareas,
      });
    }

    if (accion === "asignar_ticket") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const ticCod =
        parseInt(pick(form, json, req, "Tic_Cod"), 10) ||
        parseInt(pick(form, json, req, "Tar_Cod"), 10) ||
        0;
      const usuCod = parseInt(pick(form, json, req, "Usu_Cod"), 10) || 0;
      if (ticCod <= 0 || usuCod <= 0) {
        return jsonRes("error", "Tic_Cod y desarrollador son obligatorios.");
      }

      const rol = (await resolvePanelRol(prisma, perCod)) || "developer";
      if (!canAssignWork(rol)) {
        return jsonRes("error", "Solo el encargado o atencion al cliente pueden asignar tickets desde ExaMonitor.");
      }

      const ticket = (await listTickets(dbDis, { ticCod, limit: 1 }))[0];
      if (!ticket) return jsonRes("error", "Ticket no encontrado.");
      if (ticket.Asignado_Usu_Cod) {
        return jsonRes("error", "Este ticket ya fue asignado.");
      }

      const asignables = await asignablesMonitor();
      const elegido = asignables.find((a) => a.Usu_Cod === usuCod);
      if (!elegido) return jsonRes("error", "Ese desarrollador no esta en el equipo.");

      const res = await assignTicket(dbDis, { ticCod, usuCod, perCod: elegido.Per_Cod });
      const titulo = res.ticket?.Tic_Titulo || ticket.Tic_Titulo || `Ticket #${ticCod}`;
      const nombre = res.ticket?.Asignado_Nombre || elegido.Nombre;
      const actorRow = await findDesarrollador(prisma, String(perCod));
      const actor =
        `${actorRow?.persona?.Prs_Ape || ""} ${actorRow?.persona?.Prs_Nom || ""}`.trim() ||
        "Atencion al cliente";
      publishAsignacion({
        kind: "ticket",
        title: "Ticket asignado",
        message: `#${ticCod} · ${titulo} → ${nombre}`,
        db: dbDis,
        ticCod,
        perCod: elegido.Per_Cod,
        usuCod,
        estado: res.ticket?.Tic_Estado || "Asignado",
        actor,
      });

      const { tareas } = await bandejaAgente(prisma, perCod, undefined, rol);
      return jsonRes("ok", `Ticket #${ticCod} asignado a ${nombre}.`, {
        Tic_Cod: ticCod,
        estado: res.ticket?.Tic_Estado || "Asignado",
        Asignado_Nombre: nombre,
        mis_tareas: tareas,
        tareas,
        asignables,
      });
    }

    if (accion === "subir_evidencia") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const tarCod = parseInt(pick(form, json, req, "Tar_Cod"), 10) || 0;
      const ticCod = parseInt(pick(form, json, req, "Tic_Cod"), 10) || 0;
      if (!tarCod && !ticCod) return jsonRes("error", "Tar_Cod o Tic_Cod requerido.");

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
      if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) aseCodes.unshift(usuCod);

      if (ticCod > 0) {
        const mios = await listTickets(dbDis, { aseCodes, limit: 500 });
        if (!mios.some((t) => t.Tic_Cod === ticCod)) {
          return jsonRes("error", "No puedes adjuntar evidencias a ese ticket.");
        }
      } else {
        const assigned = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
          `SELECT 1 AS n FROM aud_tareas_asignadas
           WHERE Tar_Cod = ? AND Per_Cod = ? AND Tas_Est = 'A' LIMIT 1`,
          tarCod,
          perCod
        );
        if (!assigned.length) {
          return jsonRes("error", "No puedes adjuntar evidencias a esa tarea.");
        }
      }

      const files: File[] = [];
      if (form) {
        for (const key of ["files", "file", "evidencia", "screenshot"]) {
          for (const v of form.getAll(key)) {
            if (isUploadedFile(v) && v.size > 0) files.push(v);
          }
        }
      }
      if (!files.length) return jsonRes("error", "No se recibieron archivos.");
      if (files.length > 10) return jsonRes("error", "Maximo 10 archivos por solicitud.");

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

      // En tickets se vinculan al cuerpo; en tareas las rutas se usan al registrar avance.
      if (ticCod > 0) {
        await attachTicketEvidencias(
          dbDis,
          ticCod,
          adjuntos.map((a) => a.ruta)
        );
      }

      return jsonRes("ok", "Evidencias subidas.", {
        adjuntos,
        Tar_Cod: tarCod || null,
        Tic_Cod: ticCod || null,
      });
    }

    return jsonRes("error", "Accion no especificada o desconocida.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("[monitoreo]", msg);
    return jsonRes("error", msg, null, 500);
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
