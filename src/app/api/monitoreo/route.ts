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
import { parseAsignadosTicket, parsePerCodsTarea } from "@/lib/monitoreo-asignacion";
import {
  descripcionTicketAvance,
  listAvancesTicket,
  registrarAvanceTicket,
} from "@/lib/ticket-avances";
import {
  AsignacionInvalidaError,
  descripcionAvanceDesdeBody,
  getTareaDetalle,
  registrarAvance,
  setTareaAsignados,
} from "@/lib/tareas";
import { isImagePath } from "@/lib/avance-format";
import {
  attachTicketEvidencias,
  assignTicket,
  findTicketAsignado,
  kanbanToTicketEstado,
  listTicketAssignees,
  listTicketsAsignados,
  pickTicketByOrigen,
  ticketEstadoToKanban,
  ticketPerteneceA,
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
  const rol = rolHint || (await resolvePanelRol(prisma, perCod, usuCod || undefined)) || "developer";
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
      const rol = (await resolvePanelRol(prisma, perCod, usuCod || undefined)) || "developer";
      const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
      if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) aseCodes.unshift(usuCod);

      if (tipo === "ticket") {
        const mesa = canAssignWork(rol);
        const preferDb = pick(form, json, req, "Db_Origen");
        const ticket = mesa
          ? await (async () => {
              const rows = await listTicketsAsignados({ ticCod: cod, limit: 5 });
              return pickTicketByOrigen(rows, preferDb);
            })()
          : await findTicketAsignado({
              ticCod: cod,
              aseCodes,
              perCodes: perCod > 0 ? [perCod] : [],
              preferDb,
            });
        if (!ticket) {
          return jsonRes("error", "Ticket no encontrado o no asignado a ti.");
        }
        const sinAsignar = !ticket.Asignado_Usu_Cod;
        const mio = ticketPerteneceA(ticket, aseCodes, perCod);
        if (!mesa && !mio) {
          return jsonRes("error", "Ticket no encontrado o no asignado a ti.");
        }
        const asignables = mesa ? await asignablesMonitor() : [];
        const avances = ticket.Db_Origen
          ? await listAvancesTicket(ticket.Db_Origen, ticket.Tic_Cod)
          : [];
        const pct =
          ticket.Ava_Porcentaje != null
            ? ticket.Ava_Porcentaje
            : ticket.Tic_Estado === "Cerrado"
              ? 100
              : 0;
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
            Fecha_Asignacion: sinAsignar ? null : ticket.Fecha_Asignacion || null,
            Ava_Porcentaje: pct,
            puede_registrar_avance: mio && ticket.Tic_Estado !== "Cerrado",
            puede_cambiar_estado: mio && ticket.Tic_Estado !== "Cerrado" && ticket.Tic_Estado !== "En Proceso",
            puede_subir_evidencia: mio,
            puede_asignar: mesa && sinAsignar,
            Enviado_Por: ticket.Enviado_Por || ticket.Creador_Nombre || null,
            Empresa: ticket.Emp_Nom || null,
            Telefono: ticket.Tic_Tel || null,
            Proceso: ticket.Proceso || null,
            Asignado_Nombre: ticket.Asignado_Nombre || null,
            Db_Origen: ticket.Db_Origen || null,
          },
          evidencias: ticket.Evidencias || [],
          avances: avances.slice(0, 8).map((a) => ({
            Ava_Porcentaje: a.Ava_Porcentaje,
            Ava_Fecha: a.Ava_Fecha,
            realizado: a.realizado || "",
            Autor: a.Autor || "",
            adjuntos: a.adjuntos,
          })),
          asignables,
        });
      }

      const titulares = await prisma.$queryRawUnsafe<Array<{ Per_Cod: number | bigint }>>(
        `SELECT Per_Cod FROM aud_tareas_asignadas
         WHERE Tar_Cod = ? AND Tas_Est = 'A'`,
        cod
      );
      const mia = titulares.some((a) => Number(a.Per_Cod) === perCod);
      const sinAsignar = titulares.length === 0;
      const mesa = canAssignWork(rol);
      if (!mia && !mesa) {
        return jsonRes("error", "Tarea no encontrada o no asignada a ti.");
      }

      const detalle = await getTareaDetalle(dbDis, cod, { includeCapturas: false });
      if (!detalle) return jsonRes("error", "No se pudo cargar el detalle de la tarea.");

      const asignablesTarea = mesa && sinAsignar ? await asignablesMonitor() : [];
      return jsonRes("ok", "Detalle de tarea.", {
        tipo: "tarea",
        trabajo: {
          Cod: detalle.tarea.Tar_Cod,
          Titulo: detalle.tarea.Tar_Titulo,
          Descripcion: detalle.tarea.Tar_Descripcion || "",
          Prioridad: detalle.tarea.Tar_Prioridad || "Media",
          Complejidad: detalle.tarea.Tar_Complejidad || "Media",
          Estado: sinAsignar ? "Por asignar" : detalle.tarea.Tar_Estado || "",
          Fecha_Fin: detalle.tarea.Tar_Fecha_Fin,
          Ava_Porcentaje: detalle.tarea.Ava_Porcentaje ?? 0,
          puede_registrar_avance: mia,
          puede_cambiar_estado: false,
          puede_subir_evidencia: mia,
          puede_asignar: mesa && sinAsignar,
        },
        asignables: asignablesTarea,
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

    if (accion === "registrar_avance_ticket") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const ticCod =
        parseInt(pick(form, json, req, "Tic_Cod"), 10) ||
        parseInt(pick(form, json, req, "Tar_Cod"), 10) ||
        0;
      if (ticCod <= 0) return jsonRes("error", "Tic_Cod invalido.");

      const porcentaje = Number(pick(form, json, req, "porcentaje", "0"));
      if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        return jsonRes("error", "Porcentaje debe estar entre 0 y 100.");
      }

      const realizado = pick(form, json, req, "realizado") || pick(form, json, req, "descripcion");
      if (!realizado.trim()) {
        return jsonRes("error", "Describe lo que avanzaste para registrar el avance.");
      }

      const usuCod = await resolveUsuCodFromPer(prisma, perCod);
      const aseCodes = await resolveUsuCodesFromPer(prisma, perCod);
      if (usuCod && usuCod > 0 && !aseCodes.includes(usuCod)) aseCodes.unshift(usuCod);
      const mio = await findTicketAsignado({
        ticCod,
        aseCodes,
        perCodes: perCod > 0 ? [perCod] : [],
        preferDb: pick(form, json, req, "Db_Origen"),
      });
      if (!mio) return jsonRes("error", "Ese ticket no esta asignado a ti.");

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
      const descripcion = descripcionTicketAvance({ realizado, adjuntos }, ticCod);
      const ticketDb = mio.Db_Origen || dbDis;
      const res = await registrarAvanceTicket(ticketDb, {
        ticCod,
        porcentaje,
        descripcion,
        usuCod: usuCod || undefined,
        perCod,
      });
      publishEvent({
        type: "avance_registrado",
        title: "Avance de ticket",
        message: `ExaMonitor · ticket #${ticCod} · ${res.porcentaje}%`,
        db: ticketDb,
        ticCod,
        porcentaje: res.porcentaje,
        actor: "ExaMonitor",
        estado: res.estado || mio.Tic_Estado,
        kind: "ticket",
      });
      const rolAv = (await resolvePanelRol(prisma, perCod, usuCod || undefined)) || "developer";
      const { tareas } = await bandejaAgente(prisma, perCod, usuCod || undefined, rolAv);
      return jsonRes("ok", "Avance registrado.", {
        porcentaje: res.porcentaje,
        Tic_Cod: ticCod,
        estado: res.estado,
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

      const mio = await findTicketAsignado({
        ticCod,
        aseCodes,
        perCodes: perCod > 0 ? [perCod] : [],
        preferDb: pick(form, json, req, "Db_Origen"),
      });
      if (!mio) {
        return jsonRes("error", "Ese ticket no esta asignado a ti.");
      }

      const estado = kanbanToTicketEstado(estadoRaw);
      if (estado === "Cerrado") {
        return jsonRes("error", "El ticket se resuelve al registrar el avance en 100%.");
      }
      const ticketDb = mio.Db_Origen || dbDis;
      await updateTicketEstado(ticketDb, ticCod, estado);
      publishEvent({
        type: "estado_cambiado",
        title: "Ticket actualizado",
        message: `ExaMonitor · ticket #${ticCod} → ${estado}`,
        db: ticketDb,
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
      const elegidos = parseAsignadosTicket(
        pick(form, json, req, "asignados") || pick(form, json, req, "Usu_Cods"),
        usuCod
      );
      if (ticCod <= 0 || !elegidos.length) {
        return jsonRes("error", "Tic_Cod y desarrollador son obligatorios.");
      }

      const usuActor = await resolveUsuCodFromPer(prisma, perCod);
      const rol = (await resolvePanelRol(prisma, perCod, usuActor || undefined)) || "developer";
      if (!canAssignWork(rol)) {
        return jsonRes("error", "Solo el encargado o atencion al cliente pueden asignar tickets desde ExaMonitor.");
      }

      const preferDb = pick(form, json, req, "Db_Origen");
      const candidatos = await listTicketsAsignados({ ticCod, limit: 5 });
      const ticket = pickTicketByOrigen(candidatos, preferDb);
      if (!ticket) {
        return jsonRes(
          "error",
          candidatos.length > 1
            ? "Hay un ticket con el mismo numero en EXA y en Servicios. Actualiza ExaMonitor."
            : "Ticket no encontrado."
        );
      }
      if (ticket.Asignado_Usu_Cod) {
        return jsonRes("error", "Este ticket ya fue asignado.");
      }

      const asignables = await asignablesMonitor();
      const equipo = elegidos.map((e) => {
        const row = asignables.find((a) => a.Usu_Cod === e.usuCod);
        return row
          ? { usuCod: e.usuCod, perCod: e.perCod || row.Per_Cod, nombre: row.Nombre }
          : null;
      });
      if (equipo.some((e) => !e)) {
        return jsonRes("error", "Ese desarrollador no esta en el equipo.");
      }
      const validos = equipo.filter((e): e is NonNullable<typeof e> => !!e);

      const ticketDb = ticket.Db_Origen || dbDis;
      const res = await assignTicket(ticketDb, {
        ticCod,
        asignados: validos.map((e) => ({ usuCod: e.usuCod, perCod: e.perCod })),
      });
      const titulo = res.ticket?.Tic_Titulo || ticket.Tic_Titulo || `Ticket #${ticCod}`;
      const nombre = validos.map((e) => e.nombre).join(", ");
      const actorRow = await findDesarrollador(prisma, String(perCod));
      const actor =
        `${actorRow?.persona?.Prs_Ape || ""} ${actorRow?.persona?.Prs_Nom || ""}`.trim() ||
        "Atencion al cliente";
      for (const elegido of validos) {
        publishAsignacion({
          kind: "ticket",
          title: "Ticket asignado",
          message: `#${ticCod} · ${titulo} → ${nombre}`,
          db: ticketDb,
          ticCod,
          perCod: elegido.perCod,
          usuCod: elegido.usuCod,
          estado: res.ticket?.Tic_Estado || "Asignado",
          actor,
        });
      }

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

    if (accion === "asignar_tarea") {
      const perCod = parseInt(pick(form, json, req, "Per_Cod"), 10) || 0;
      if (perCod <= 0) return jsonRes("error", "Codigo de desarrollador invalido.");

      const tarCod = parseInt(pick(form, json, req, "Tar_Cod"), 10) || 0;
      const perCods = parsePerCodsTarea(
        pick(form, json, req, "Per_Cods") || pick(form, json, req, "asignados")
      );
      if (tarCod <= 0 || !perCods.length) {
        return jsonRes("error", "Tar_Cod y al menos una persona son obligatorios.");
      }

      const usuActor = await resolveUsuCodFromPer(prisma, perCod);
      const rol = (await resolvePanelRol(prisma, perCod, usuActor || undefined)) || "developer";
      if (!canAssignWork(rol)) {
        return jsonRes("error", "Solo el encargado o atencion al cliente pueden asignar tareas desde ExaMonitor.");
      }

      const [tareaRow] = await prisma.$queryRawUnsafe<
        Array<{ Tar_Titulo: string | null; Tar_Estado: string | null; n: number | bigint }>
      >(
        `SELECT CONVERT(t.Tar_Titulo USING utf8mb4) AS Tar_Titulo,
                CONVERT(t.Tar_Estado USING utf8mb4) AS Tar_Estado,
                (SELECT COUNT(*) FROM aud_tareas_asignadas a
                 WHERE a.Tar_Cod = t.Tar_Cod AND a.Tas_Est = 'A') AS n
         FROM aud_tareas t
         WHERE t.Tar_Cod = ? AND t.Tar_Est = 'A'
         LIMIT 1`,
        tarCod
      );
      if (!tareaRow) return jsonRes("error", "Tarea no encontrada.");
      if (String(tareaRow.Tar_Estado || "") === "Finalizada") {
        return jsonRes("error", "No se puede asignar una tarea finalizada.");
      }
      if (Number(tareaRow.n) > 0) {
        return jsonRes("error", "Esta tarea ya fue asignada.");
      }

      let estado = "Asignado";
      try {
        const asig = await setTareaAsignados(dbDis, tarCod, perCods);
        estado = asig.Tar_Estado;
      } catch (e) {
        if (e instanceof AsignacionInvalidaError) {
          return jsonRes("error", e.message);
        }
        throw e;
      }

      const asignables = await asignablesMonitor();
      const titulo = (tareaRow.Tar_Titulo || "").trim() || `Tarea #${tarCod}`;
      const nombres = perCods.map(
        (id) => asignables.find((a) => a.Per_Cod === id)?.Nombre || "el equipo"
      );
      const nombre = nombres.join(", ");
      const actorRow = await findDesarrollador(prisma, String(perCod));
      const actor =
        `${actorRow?.persona?.Prs_Ape || ""} ${actorRow?.persona?.Prs_Nom || ""}`.trim() ||
        "Atencion al cliente";
      for (const id of perCods) {
        const row = asignables.find((a) => a.Per_Cod === id);
        publishAsignacion({
          kind: "tarea",
          title: "Tarea asignada",
          message: `#${tarCod} · ${titulo} → ${nombre}`,
          db: dbDis,
          tarCod,
          perCod: id,
          usuCod: row?.Usu_Cod,
          estado,
          actor,
        });
      }

      const { tareas } = await bandejaAgente(prisma, perCod, undefined, rol);
      return jsonRes("ok", `Tarea #${tarCod} asignada a ${nombre}.`, {
        Tar_Cod: tarCod,
        estado,
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

      let ticketDb = dbDis;
      if (ticCod > 0) {
        const rolEv = (await resolvePanelRol(prisma, perCod, usuCod || undefined)) || "developer";
        const preferDb = pick(form, json, req, "Db_Origen");
        const ticket = canAssignWork(rolEv)
          ? await (async () => {
              const rows = await listTicketsAsignados({ ticCod, limit: 5 });
              return pickTicketByOrigen(rows, preferDb);
            })()
          : await findTicketAsignado({
              ticCod,
              aseCodes,
              perCodes: perCod > 0 ? [perCod] : [],
              preferDb,
            });
        if (!ticket) {
          return jsonRes("error", "No puedes adjuntar evidencias a ese ticket.");
        }
        ticketDb = ticket.Db_Origen || dbDis;
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

      // En tickets se vinculan al cuerpo; en un avance las rutas viajan con la nota.
      const vincular = pick(form, json, req, "vincular", "1") !== "0";
      if (ticCod > 0 && vincular) {
        await attachTicketEvidencias(
          ticketDb,
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
