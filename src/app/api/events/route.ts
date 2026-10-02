import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import {
  eventVisibleToSession,
  listRecentEvents,
  subscribeEvents,
  type AppEvent,
} from "@/lib/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function encodeSse(event: AppEvent) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ success: false, message: "No autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: AppEvent) => {
        if (!eventVisibleToSession(event, session)) return;
        try {
          controller.enqueue(encoder.encode(encodeSse(event)));
        } catch {
          cleanup?.();
        }
      };

      for (const past of listRecentEvents(15)) {
        send(past);
      }

      const unsubscribe = subscribeEvents(send);
      heartbeat = setInterval(() => {
        send({
          id: `hb-${Date.now()}`,
          type: "heartbeat",
          title: "heartbeat",
          message: "ok",
          at: new Date().toISOString(),
        });
      }, 20000);

      cleanup = () => {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
