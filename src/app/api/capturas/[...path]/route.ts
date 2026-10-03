import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveCaptureFile } from "@/lib/captures";
import { isAllowedEvidenciaExt, mimeForExt } from "@/lib/evidencia-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const file = resolveCaptureFile(segments || []);
  if (!file) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const ext = path.extname(file).slice(1).toLowerCase();
  if (!isAllowedEvidenciaExt(ext)) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const data = await fs.promises.readFile(file);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": mimeForExt(ext),
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
