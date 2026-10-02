import { NextResponse } from "next/server";
import { allowedDatabases } from "@/lib/db";
import { EMPRESA_TAREAS, tasksDbDis, tasksEmpCod } from "@/lib/empresa";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    success: true,
    databases: allowedDatabases(),
    tasks_db: tasksDbDis(),
    tasks_emp_cod: tasksEmpCod(),
    empresa: EMPRESA_TAREAS,
    captures_dir: process.env.CAPTURES_DIR || null,
  });
}
