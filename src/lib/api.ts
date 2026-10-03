import { NextRequest, NextResponse } from "next/server";

export type JsonStatus = "ok" | "error";

export function jsonRes(
  status: JsonStatus,
  mensaje: string,
  data: unknown = null,
  http = status === "ok" ? 200 : 400
) {
  return NextResponse.json({ status, mensaje, data }, { status: http });
}

export function getParam(
  req: NextRequest,
  form: FormData | null,
  key: string
): string {
  if (form) {
    const v = form.get(key);
    if (v != null && String(v) !== "") return String(v);
  }
  const url = req.nextUrl.searchParams.get(key);
  return url ?? "";
}

export function assertApiKey(req: NextRequest): NextResponse | null {
  const expected = process.env.EXA_MONITOR_API_KEY;
  if (!expected) return null;
  const got =
    req.headers.get("x-api-key") ||
    req.nextUrl.searchParams.get("api_key") ||
    "";
  if (got !== expected) {
    return jsonRes("error", "API key inválida.", null, 401);
  }
  return null;
}

export async function readBody(req: NextRequest): Promise<{
  form: FormData | null;
  json: Record<string, unknown> | null;
}> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    try {
      const form = await req.formData();
      return { form, json: null };
    } catch {
      return { form: null, json: null };
    }
  }
  if (ct.includes("application/json")) {
    try {
      const json = (await req.json()) as Record<string, unknown>;
      return { form: null, json };
    } catch {
      return { form: null, json: null };
    }
  }
  // ExaMonitor a veces manda POST sin content-type estricto
  try {
    const form = await req.formData();
    return { form, json: null };
  } catch {
    return { form: null, json: null };
  }
}

/** Node < 20 no define el global File; `instanceof File` lanza ReferenceError. */
export function isUploadedFile(value: unknown): value is File {
  if (typeof value !== "object" || value === null) return false;
  if (typeof File === "function" && value instanceof File) return true;
  const blob = value as { arrayBuffer?: unknown; stream?: unknown; name?: unknown; size?: unknown };
  return (
    typeof blob.size === "number" &&
    typeof blob.name === "string" &&
    (typeof blob.arrayBuffer === "function" || typeof blob.stream === "function")
  );
}

export function pick(
  form: FormData | null,
  json: Record<string, unknown> | null,
  req: NextRequest,
  key: string,
  fallback = ""
): string {
  if (form) {
    const v = form.get(key);
    if (v != null && !isUploadedFile(v) && String(v) !== "") return String(v);
  }
  if (json && json[key] != null && String(json[key]) !== "") return String(json[key]);
  const q = req.nextUrl.searchParams.get(key);
  return q ?? fallback;
}
