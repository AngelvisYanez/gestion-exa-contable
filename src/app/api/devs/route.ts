import { NextRequest, NextResponse } from "next/server";
import { sanitizeDbDis } from "@/lib/db";
import {
  historialCapturas,
  listAsignables,
  listColaboradores,
  listDevsMonitoreo,
  setMonitoreoConfig,
} from "@/lib/tareas";
import { hoyFecha } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const db = sanitizeDbDis(sp.get("Ses_Dat_Dis"));
    const view = sp.get("view") || "devs";

    if (view === "historial") {
      const perCod = parseInt(sp.get("Per_Cod") || "0", 10);
      if (perCod <= 0) {
        return NextResponse.json({ success: false, message: "Per_Cod inválido" }, { status: 400 });
      }
      const fecha = sp.get("Fecha") || hoyFecha();
      const autoFecha = sp.get("autoFecha") === "1";
      const desde = sp.get("desde") || sp.get("Desde") || undefined;
      const hasta = sp.get("hasta") || sp.get("Hasta") || undefined;
      const maximo = sp.get("rangoMaximo") === "1" || sp.get("maximo") === "1";
      const data = await historialCapturas(db, perCod, fecha, autoFecha, { desde, hasta, maximo });
      return NextResponse.json({ success: true, ...data });
    }

    if (view === "colaboradores") {
      const asignables = sp.get("asignables") === "1";
      if (asignables) {
        const rows = await listAsignables(db);
        return NextResponse.json({ success: true, colaboradores: rows });
      }
      const filtro = sp.get("q") || "";
      const rows = await listColaboradores(db, filtro);
      return NextResponse.json({ success: true, colaboradores: rows });
    }

    const soloActivos = sp.get("soloActivos") === "1";
    const desde = sp.get("desde") || sp.get("Desde") || undefined;
    const hasta = sp.get("hasta") || sp.get("Hasta") || undefined;
    const data = await listDevsMonitoreo(db, soloActivos, { desde, hasta });
    return NextResponse.json({
      success: true,
      db,
      desarrolladores: data.desarrolladores,
      rango: data.rango,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = sanitizeDbDis(body.Ses_Dat_Dis);
    const perCod = Number(body.Per_Cod || 0);
    if (perCod <= 0) {
      return NextResponse.json({ success: false, message: "Per_Cod inválido" }, { status: 400 });
    }
    const cfg = await setMonitoreoConfig(db, perCod, {
      activo: body.Mon_Activo != null ? Number(body.Mon_Activo) : undefined,
      intervalo: body.Mon_Intervalo_Minutos != null ? Number(body.Mon_Intervalo_Minutos) : undefined,
      captura: body.Mon_Captura_Pantalla != null ? Number(body.Mon_Captura_Pantalla) : undefined,
      forzarBandeja: body.Mon_Forzar_Bandeja != null ? Number(body.Mon_Forzar_Bandeja) : undefined,
      permitirSalir: body.Mon_Permitir_Salir != null ? Number(body.Mon_Permitir_Salir) : undefined,
      horarioActivo: body.Mon_Horario_Activo != null ? Number(body.Mon_Horario_Activo) : undefined,
      horaInicio: body.Mon_Hora_Inicio != null ? String(body.Mon_Hora_Inicio) : undefined,
      horaFin: body.Mon_Hora_Fin != null ? String(body.Mon_Hora_Fin) : undefined,
      diasLaborales: body.Mon_Dias_Laborales != null ? String(body.Mon_Dias_Laborales) : undefined,
      almuerzoActivo:
        body.Mon_Almuerzo_Activo != null ? Number(body.Mon_Almuerzo_Activo) : undefined,
      almuerzoInicio:
        body.Mon_Almuerzo_Inicio != null ? String(body.Mon_Almuerzo_Inicio) : undefined,
      almuerzoFin: body.Mon_Almuerzo_Fin != null ? String(body.Mon_Almuerzo_Fin) : undefined,
    });
    return NextResponse.json({ success: true, config: cfg });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
