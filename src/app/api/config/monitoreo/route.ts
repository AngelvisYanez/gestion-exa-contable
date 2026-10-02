import { NextRequest, NextResponse } from "next/server";
import { getCapturesDiskStats } from "@/lib/captures";
import { sanitizeDbDis } from "@/lib/db";
import { CAPTURA_RETENCION_PRESETS } from "@/lib/domain-constants";
import {
  formatBytes,
  getMonitoreoGlobal,
  purgeScreenshotsByRetention,
  setMonitoreoGlobal,
} from "@/lib/monitoreo-global";
import { setMonitoreoConfig } from "@/lib/tareas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const db = sanitizeDbDis(req.nextUrl.searchParams.get("Ses_Dat_Dis"));
    const [config, stats] = await Promise.all([
      getMonitoreoGlobal(db),
      Promise.resolve(getCapturesDiskStats()),
    ]);
    return NextResponse.json({
      success: true,
      db,
      config,
      presets: CAPTURA_RETENCION_PRESETS,
      disk: {
        ...stats,
        bytesLabel: formatBytes(stats.bytes),
      },
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
    const action = String(body.action || "save");

    if (action === "purge") {
      const result = await purgeScreenshotsByRetention(db, { force: !!body.force });
      return NextResponse.json({
        success: true,
        ...result,
        diskLabel: formatBytes(result.disk.bytesFreed),
        statsAfter: {
          ...result.statsAfter,
          bytesLabel: formatBytes(result.statsAfter.bytes),
        },
      });
    }

    if (action === "bulk") {
      const perCodes: number[] = Array.isArray(body.Per_Cods)
        ? body.Per_Cods.map((n: unknown) => Number(n)).filter((n: number) => n > 0)
        : [];
      if (!perCodes.length) {
        return NextResponse.json(
          { success: false, message: "Selecciona al menos un colaborador" },
          { status: 400 }
        );
      }
      const patch = {
        activo: body.Mon_Activo != null ? Number(body.Mon_Activo) : undefined,
        intervalo:
          body.Mon_Intervalo_Minutos != null
            ? Number(body.Mon_Intervalo_Minutos)
            : undefined,
        captura:
          body.Mon_Captura_Pantalla != null
            ? Number(body.Mon_Captura_Pantalla)
            : undefined,
        forzarBandeja:
          body.Mon_Forzar_Bandeja != null ? Number(body.Mon_Forzar_Bandeja) : undefined,
        permitirSalir:
          body.Mon_Permitir_Salir != null ? Number(body.Mon_Permitir_Salir) : undefined,
        horarioActivo:
          body.Mon_Horario_Activo != null ? Number(body.Mon_Horario_Activo) : undefined,
        horaInicio: body.Mon_Hora_Inicio != null ? String(body.Mon_Hora_Inicio) : undefined,
        horaFin: body.Mon_Hora_Fin != null ? String(body.Mon_Hora_Fin) : undefined,
        diasLaborales:
          body.Mon_Dias_Laborales != null ? String(body.Mon_Dias_Laborales) : undefined,
        almuerzoActivo:
          body.Mon_Almuerzo_Activo != null ? Number(body.Mon_Almuerzo_Activo) : undefined,
        almuerzoInicio:
          body.Mon_Almuerzo_Inicio != null ? String(body.Mon_Almuerzo_Inicio) : undefined,
        almuerzoFin:
          body.Mon_Almuerzo_Fin != null ? String(body.Mon_Almuerzo_Fin) : undefined,
      };
      let updated = 0;
      for (const perCod of perCodes) {
        await setMonitoreoConfig(db, perCod, patch);
        updated++;
      }
      return NextResponse.json({ success: true, updated });
    }

    const config = await setMonitoreoGlobal(db, {
      activa: body.Cap_Retencion_Activa != null ? Number(body.Cap_Retencion_Activa) : undefined,
      preset: body.Cap_Retencion_Preset != null ? String(body.Cap_Retencion_Preset) : undefined,
      dias: body.Cap_Retencion_Dias != null ? Number(body.Cap_Retencion_Dias) : undefined,
      autoPurga: body.Cap_Auto_Purga != null ? Number(body.Cap_Auto_Purga) : undefined,
      preservarAsignaciones:
        body.Cap_Preservar_Asignaciones != null
          ? Number(body.Cap_Preservar_Asignaciones)
          : undefined,
      postCierreDias:
        body.Cap_Post_Cierre_Dias != null ? Number(body.Cap_Post_Cierre_Dias) : undefined,
    });

    let purgeResult = null;
    if (body.runPurgeNow) {
      purgeResult = await purgeScreenshotsByRetention(db, { force: true });
    }

    return NextResponse.json({
      success: true,
      config,
      purge: purgeResult,
      disk: (() => {
        const stats = getCapturesDiskStats();
        return { ...stats, bytesLabel: formatBytes(stats.bytes) };
      })(),
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
