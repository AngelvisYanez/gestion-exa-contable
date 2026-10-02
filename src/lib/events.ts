export type AppEventType =
  | "tarea_creada"
  | "tarea_asignada"
  | "ticket_asignado"
  | "tarea_actualizada"
  | "avance_registrado"
  | "estado_cambiado"
  | "brief_generado"
  | "heartbeat";

export type AppEvent = {
  id: string;
  type: AppEventType;
  title: string;
  message: string;
  db?: string;
  tarCod?: number;
  ticCod?: number;
  estado?: string;
  porcentaje?: number;
  actor?: string;
  /** Destinatario: ficha personal (tareas / ExaMonitor). */
  perCod?: number;
  /** Destinatario: usuario EXA (tickets.Ase_Cod). */
  usuCod?: number;
  kind?: "tarea" | "ticket";
  at: string;
};

type Listener = (event: AppEvent) => void;

const globalStore = globalThis as typeof globalThis & {
  __exaEventsListeners?: Set<Listener>;
  __exaEventsRecent?: AppEvent[];
  __exaDevNotifByPer?: Map<number, AppEvent[]>;
  __exaDevNotifByUsu?: Map<number, AppEvent[]>;
};

function listeners() {
  if (!globalStore.__exaEventsListeners) {
    globalStore.__exaEventsListeners = new Set();
  }
  return globalStore.__exaEventsListeners;
}

function recent() {
  if (!globalStore.__exaEventsRecent) {
    globalStore.__exaEventsRecent = [];
  }
  return globalStore.__exaEventsRecent;
}

function pendingByPer() {
  if (!globalStore.__exaDevNotifByPer) {
    globalStore.__exaDevNotifByPer = new Map();
  }
  return globalStore.__exaDevNotifByPer;
}

function pendingByUsu() {
  if (!globalStore.__exaDevNotifByUsu) {
    globalStore.__exaDevNotifByUsu = new Map();
  }
  return globalStore.__exaDevNotifByUsu;
}

function pushPending(map: Map<number, AppEvent[]>, key: number, event: AppEvent) {
  if (!key || key <= 0) return;
  const list = map.get(key) || [];
  list.push(event);
  if (list.length > 30) list.splice(0, list.length - 30);
  map.set(key, list);
}

function queueForAgent(event: AppEvent) {
  if (event.type !== "tarea_asignada" && event.type !== "ticket_asignado") return;
  pushPending(pendingByPer(), event.perCod || 0, event);
  pushPending(pendingByUsu(), event.usuCod || 0, event);
}

/** Consume notificaciones pendientes para ExaMonitor (por Per_Cod y/o Usu_Cod). */
export function consumeDevNotifications(opts: {
  perCod?: number;
  usuCod?: number;
}): AppEvent[] {
  const out: AppEvent[] = [];
  const seen = new Set<string>();

  const take = (map: Map<number, AppEvent[]>, key: number) => {
    if (!key || key <= 0) return;
    const list = map.get(key) || [];
    map.set(key, []);
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push(e);
    }
  };

  take(pendingByPer(), opts.perCod || 0);
  take(pendingByUsu(), opts.usuCod || 0);
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out;
}

export function eventVisibleToSession(
  event: AppEvent,
  session: { role: string; perCod?: number; usuCod?: number }
): boolean {
  if (event.type === "heartbeat") return true;
  if (session.role === "manager" || session.role === "atencion") return true;

  const hasTarget =
    (event.perCod != null && event.perCod > 0) || (event.usuCod != null && event.usuCod > 0);

  // Desarrolladores solo ven eventos dirigidos a ellos (asignaciones, etc.)
  if (!hasTarget) return false;
  if (event.perCod && session.perCod && event.perCod === session.perCod) return true;
  if (event.usuCod && session.usuCod && event.usuCod === session.usuCod) return true;
  return false;
}

export function publishEvent(
  partial: Omit<AppEvent, "id" | "at"> & { id?: string; at?: string }
): AppEvent {
  const event: AppEvent = {
    ...partial,
    id: partial.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: partial.at || new Date().toISOString(),
  };

  const buf = recent();
  buf.unshift(event);
  if (buf.length > 80) buf.length = 80;

  queueForAgent(event);

  for (const listener of listeners()) {
    try {
      listener(event);
    } catch {
      /* ignore broken subscriber */
    }
  }
  return event;
}

/** Atajo para avisar al desarrollador de una asignación. */
export function publishAsignacion(opts: {
  kind: "tarea" | "ticket";
  title?: string;
  message: string;
  db?: string;
  tarCod?: number;
  ticCod?: number;
  perCod?: number;
  usuCod?: number;
  estado?: string;
  actor?: string;
}) {
  return publishEvent({
    type: opts.kind === "ticket" ? "ticket_asignado" : "tarea_asignada",
    title:
      opts.title ||
      (opts.kind === "ticket" ? "Ticket asignado" : "Tarea asignada"),
    message: opts.message,
    db: opts.db,
    tarCod: opts.tarCod,
    ticCod: opts.ticCod,
    perCod: opts.perCod,
    usuCod: opts.usuCod,
    estado: opts.estado,
    actor: opts.actor,
    kind: opts.kind,
  });
}

export function subscribeEvents(listener: Listener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}

export function listRecentEvents(limit = 30): AppEvent[] {
  return recent()
    .filter((e) => e.type !== "heartbeat")
    .slice(0, limit);
}
