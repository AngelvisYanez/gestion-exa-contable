/**
 * Cliente Gemini (Google AI) para briefs de desarrollo.
 * Modelo por defecto: gemini-3.8-flash (familia Gemini 3).
 */

export type GeminiConfig = {
  enabled: boolean;
  apiKey: string;
  model: string;
};

export function getGeminiConfig(): GeminiConfig {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.BRIEF_LLM_API_KEY ||
    ""
  ).trim();
  const enabledFlag = String(process.env.BRIEF_LLM_ENABLED || "1").trim();
  const enabled = enabledFlag !== "0" && enabledFlag.toLowerCase() !== "false" && !!apiKey;
  const model = (
    process.env.GEMINI_MODEL ||
    process.env.BRIEF_LLM_MODEL ||
    "gemini-3.8-flash"
  ).trim();
  return { enabled, apiKey, model };
}

export type GeminiGenerateResult = {
  ok: boolean;
  text: string;
  model: string;
  error?: string;
  attempts: number;
};

function extractText(payload: unknown): string {
  const p = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    error?: { message?: string };
  };
  if (p?.error?.message) throw new Error(p.error.message);
  const parts = p?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((x) => x.text || "")
    .join("")
    .trim();
}

async function callGeminiOnce(opts: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  timeoutMs: number;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: opts.system }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: opts.user }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.9,
          maxOutputTokens: 8192,
        },
      }),
    });
    const json = (await res.json()) as unknown;
    if (!res.ok) {
      const msg =
        (json as { error?: { message?: string } })?.error?.message ||
        `Gemini HTTP ${res.status}`;
      throw new Error(msg);
    }
    const text = extractText(json);
    if (!text) throw new Error("Gemini devolvio respuesta vacia");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateWithGemini(opts: {
  system: string;
  user: string;
  retries?: number;
}): Promise<GeminiGenerateResult> {
  const cfg = getGeminiConfig();
  if (!cfg.enabled || !cfg.apiKey) {
    return {
      ok: false,
      text: "",
      model: cfg.model,
      error: "Gemini desactivado o sin GEMINI_API_KEY",
      attempts: 0,
    };
  }

  const retries = Math.max(0, Math.min(2, opts.retries ?? 1));
  let lastErr = "";
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const text = await callGeminiOnce({
        apiKey: cfg.apiKey,
        model: cfg.model,
        system: opts.system,
        user: opts.user,
        timeoutMs: 90000,
      });
      return { ok: true, text, model: cfg.model, attempts: attempt };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "Error Gemini";
      if (attempt <= retries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
  }
  return {
    ok: false,
    text: "",
    model: cfg.model,
    error: lastErr,
    attempts: retries + 1,
  };
}

const REQUIRED_HEADINGS = [
  /qué tiene que quedar resuelto/i,
  /esquema|m[oó]dulo actual|flujo/i,
  /causa ra[ií]z|alcance funcional/i,
  /impacto/i,
  /alcance de la (correcci[oó]n|entrega)|plan de (correcci[oó]n|trabajo)/i,
];

export function validateBriefMarkdown(md: string): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!md || md.trim().length < 400) missing.push("contenido insuficiente");
  for (const re of REQUIRED_HEADINGS) {
    if (!re.test(md)) missing.push(re.source);
  }
  return { ok: missing.length === 0, missing };
}
