import { NextRequest, NextResponse } from "next/server";
import { getDashboardMetrics } from "@/lib/dashboard";
import { countTicketsNuevos } from "@/lib/tickets";
import { tasksDbDis, tasksEmpCod } from "@/lib/empresa";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const db = tasksDbDis(sp.get("Ses_Dat_Dis"));
    const empCod = tasksEmpCod(sp.get("Emp_Cod"));
    const desde = sp.get("desde") || sp.get("Desde");
    const hasta = sp.get("hasta") || sp.get("Hasta");
    const perRaw = sp.get("Per_Cod") || sp.get("perCod") || sp.get("desarrollador");
    const perCod = perRaw ? Number(perRaw) : null;
    const metrics = await getDashboardMetrics(db, empCod, {
      desde,
      hasta,
      perCod: Number.isFinite(perCod) && (perCod as number) > 0 ? perCod : null,
    });
    let ticketsNuevos = 0;
    try {
      ticketsNuevos = await countTicketsNuevos(db);
    } catch {
      ticketsNuevos = 0;
    }
    return NextResponse.json({
      success: true,
      db,
      Emp_Cod: empCod,
      ...metrics,
      ticketsNuevos,
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ success: false, message: mensaje }, { status: 500 });
  }
}
