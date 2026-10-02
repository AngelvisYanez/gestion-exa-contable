/**
 * Cliente UltraMsg alineado con relavera/LOGICA/relavera_ultramsg_config.php
 * de exa-ofsercont. Por defecto NO envía (WHATSAPP_ENABLED != 1).
 */

export type UltramsgConfig = {
  enabled: boolean;
  instanceId: string;
  token: string;
};

export type UltramsgSendResult = {
  ok: boolean;
  skipped: boolean;
  reason?: string;
  httpStatus?: number;
  body?: string;
};

export function getUltramsgConfig(): UltramsgConfig {
  const enabled =
    String(process.env.WHATSAPP_ENABLED || "").trim() === "1" ||
    String(process.env.ULTRAMSG_ENABLED || "").trim() === "1";
  return {
    enabled,
    instanceId: (process.env.ULTRAMSG_INSTANCE_ID || "").trim(),
    token: (process.env.ULTRAMSG_TOKEN || "").trim(),
  };
}

export function normalizeWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  // Ecuador: 09xxxxxxxx -> 5939xxxxxxxx
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `593${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("9")) {
    digits = `593${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

async function postUltramsg(
  path: string,
  fields: Record<string, string>
): Promise<UltramsgSendResult> {
  const cfg = getUltramsgConfig();
  if (!cfg.enabled) {
    return { ok: true, skipped: true, reason: "WHATSAPP_ENABLED no es 1 (fase panel)" };
  }
  if (!cfg.instanceId || !cfg.token) {
    return {
      ok: false,
      skipped: true,
      reason: "Faltan ULTRAMSG_INSTANCE_ID / ULTRAMSG_TOKEN",
    };
  }

  const url = `https://api.ultramsg.com/${encodeURIComponent(cfg.instanceId)}${path}`;
  const body = new URLSearchParams({ token: cfg.token, ...fields });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await res.text();
    let errMsg = "";
    try {
      const json = JSON.parse(text) as { error?: unknown };
      if (json?.error) errMsg = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
    } catch {
      /* raw */
    }
    const ok = res.ok && !errMsg;
    return {
      ok,
      skipped: false,
      httpStatus: res.status,
      body: text.slice(0, 500),
      reason: ok ? undefined : errMsg || `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reason: e instanceof Error ? e.message : "Error de red UltraMsg",
    };
  }
}

/** Envío de texto. No-op si WhatsApp está desactivado. */
export async function ultramsgSendText(to: string, body: string): Promise<UltramsgSendResult> {
  const phone = normalizeWaPhone(to);
  if (!phone) return { ok: false, skipped: true, reason: "Telefono invalido" };
  return postUltramsg("/messages/chat", { to: phone, body: body.slice(0, 4000) });
}

/**
 * Envío de documento (PDF/MD) por URL pública.
 * UltraMsg requiere URL accesible; en fase 2 se usará la URL de docs en gestion.
 */
export async function ultramsgSendDocument(opts: {
  to: string;
  filename: string;
  documentUrl: string;
  caption?: string;
}): Promise<UltramsgSendResult> {
  const phone = normalizeWaPhone(opts.to);
  if (!phone) return { ok: false, skipped: true, reason: "Telefono invalido" };
  return postUltramsg("/messages/document", {
    to: phone,
    filename: opts.filename,
    document: opts.documentUrl,
    caption: (opts.caption || "").slice(0, 1000),
  });
}
