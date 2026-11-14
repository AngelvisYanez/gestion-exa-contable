import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db";
import { CAPACITACION_PROYECTOS, nombreProyectoCapacitacion } from "@/lib/capacitaciones-proyectos";
import { listAsignables } from "@/lib/tareas";

export const dynamic = "force-dynamic";
type Row = { Cap_Cod: number; Cap_Titulo: string; Cap_Empresa: string; Cap_Cliente: string; Cap_Proyecto: string; Cap_Responsable_Per_Cod: number; Cap_Responsable_Nombre: string; Cap_Inicio: Date; Cap_Duracion_Min: number; Cap_Estado: string; Cap_Finalizada: Date | null; Cap_Actualizada: Date };
const db = () => getPrisma("exa");
const bad = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });
const validText = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session?.role !== "manager") return bad("Solo encargados.", 403);
  try {
    const proyecto = req.nextUrl.searchParams.get("proyecto");
    if (proyecto && !CAPACITACION_PROYECTOS.some((p) => p.id === proyecto)) return bad("Proyecto inválido.");
    if (req.nextUrl.searchParams.get("view") === "miembros") {
      if (!proyecto || !CAPACITACION_PROYECTOS.some((p) => p.id === proyecto)) return bad("Proyecto inválido.");
      const miembros = await listAsignables(proyecto);
      return NextResponse.json({ success: true, miembros: miembros.map((m) => ({ Per_Cod: m.Per_Cod, Nombre: m.Nombre })) });
    }
    const rows = await db().$queryRaw<Row[]>`SELECT Cap_Cod, Cap_Titulo, Cap_Empresa, Cap_Cliente, Cap_Proyecto, Cap_Responsable_Per_Cod, Cap_Responsable_Nombre, Cap_Inicio, Cap_Duracion_Min, Cap_Estado, Cap_Finalizada, Cap_Actualizada FROM aud_capacitaciones ORDER BY Cap_Inicio ASC`;
    const visible = proyecto ? rows.filter((r) => r.Cap_Proyecto === proyecto) : rows;
    if (req.nextUrl.searchParams.get("format") !== "ics") return NextResponse.json({ success: true, items: visible });
    const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//EXA//Capacitaciones//ES", "CALSCALE:GREGORIAN", ...visible.flatMap((r) => [
      "BEGIN:VEVENT", `UID:capacitacion-${r.Cap_Cod}@gestion.exacontable.com`, `DTSTAMP:${stamp(r.Cap_Actualizada)}`,
      `DTSTART:${stamp(r.Cap_Inicio)}`, `DTEND:${stamp(new Date(r.Cap_Inicio.getTime() + r.Cap_Duracion_Min * 60000))}`,
      `SUMMARY:${escape(r.Cap_Titulo)}`, `DESCRIPTION:${escape(`Proyecto: ${nombreProyectoCapacitacion(r.Cap_Proyecto)}\nResponsable: ${r.Cap_Responsable_Nombre}\nEmpresa: ${r.Cap_Empresa}\nCliente: ${r.Cap_Cliente}\nEstado: ${r.Cap_Estado}`)}`,
      `STATUS:${r.Cap_Estado === "Finalizada" ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT",
    ]), "END:VCALENDAR"];
    return new NextResponse(lines.join("\r\n") + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": "attachment; filename=capacitaciones.ics", "Cache-Control": "no-store" } });
  } catch (e) { console.error("capacitaciones GET", e); return bad("No se pudieron consultar las capacitaciones. Verifica que la tabla esté instalada.", 500); }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session?.role !== "manager") return bad("Solo encargados.", 403);
  try {
    const body = await req.json();
    if (!validText(body.titulo, 255) || !validText(body.empresa, 180) || !validText(body.cliente, 180)) return bad("Completa título, empresa y cliente.");
    const proyecto = String(body.proyecto || "");
    const responsable = Number(body.responsablePerCod);
    if (!CAPACITACION_PROYECTOS.some((p) => p.id === proyecto)) return bad("Proyecto inválido.");
    if (!Number.isSafeInteger(responsable) || responsable < 1) return bad("Selecciona quién hará la capacitación.");
    const miembro = (await listAsignables(proyecto)).find((m) => m.Per_Cod === responsable);
    if (!miembro) return bad("El responsable no pertenece al proyecto.");
    const inicio = new Date(body.inicio);
    const duracion = Number(body.duracionMin);
    if (!Number.isFinite(inicio.getTime()) || !Number.isSafeInteger(duracion) || duracion < 1 || duracion > 10080) return bad("Fecha o duración inválida.");
    await db().$executeRaw`INSERT INTO aud_capacitaciones (Cap_Titulo, Cap_Empresa, Cap_Cliente, Cap_Proyecto, Cap_Responsable_Per_Cod, Cap_Responsable_Nombre, Cap_Inicio, Cap_Duracion_Min, Cap_Creador) VALUES (${body.titulo.trim()}, ${body.empresa.trim()}, ${body.cliente.trim()}, ${proyecto}, ${responsable}, ${miembro.Nombre}, ${inicio}, ${duracion}, ${session.usuCod})`;
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) { console.error("capacitaciones POST", e); return bad("No se pudo crear la capacitación.", 500); }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (session?.role !== "manager") return bad("Solo encargados.", 403);
  try {
    const { id } = await req.json();
    if (!Number.isSafeInteger(id) || id < 1) return bad("Identificador inválido.");
    const rows = await db().$queryRaw<Array<{ Cap_Proyecto: string }>>`SELECT Cap_Proyecto FROM aud_capacitaciones WHERE Cap_Cod = ${id} LIMIT 1`;
    if (!rows.length) return bad("Capacitación no encontrada.", 404);
    const count = await db().$executeRaw`UPDATE aud_capacitaciones SET Cap_Estado = 'Finalizada', Cap_Finalizada = NOW(3) WHERE Cap_Cod = ${id} AND Cap_Estado = 'Programada'`;
    if (!count) return bad("La capacitación no existe o ya fue finalizada.", 409);
    return NextResponse.json({ success: true });
  } catch (e) { console.error("capacitaciones PATCH", e); return bad("No se pudo finalizar la capacitación.", 500); }
}
