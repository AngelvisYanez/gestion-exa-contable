"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { eventoTextoPlano, type AppEvent } from "@/lib/events";
import { navigateToDetail } from "@/lib/detail-link";
import { notificationTarget } from "@/lib/notif-links";
import {
  isEventTypeEnabled,
  loadNotifPrefs,
  DEFAULT_NOTIF_PREFS,
  type NotifPrefs,
} from "@/lib/notif-prefs";

export type AppNotification = AppEvent & { read: boolean };

type NotificationsContextValue = {
  items: AppNotification[];
  unread: number;
  toast: AppNotification | null;
  dismissToast: () => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
  /** Marca como leída y abre el detalle del elemento. Devuelve false si no tiene destino. */
  openNotification: (n: AppNotification) => boolean;
  lastTaskEventAt: number;
  prefs: NotifPrefs;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const MAX_ITEMS = 40;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [toast, setToast] = useState<AppNotification | null>(null);
  const [lastTaskEventAt, setLastTaskEventAt] = useState(0);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(new Set<string>());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const router = useRouter();
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const routerRef = useRef(router);
  routerRef.current = router;

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const openNotification = useCallback(
    (n: AppNotification) => {
      markRead(n.id);
      const target = notificationTarget(n, userRef.current);
      if (!target) return false;
      setToast((t) => (t?.id === n.id ? null : t));
      navigateToDetail(routerRef.current, target.href);
      return true;
    },
    [markRead]
  );
  const openNotificationRef = useRef(openNotification);
  openNotificationRef.current = openNotification;

  useEffect(() => {
    setPrefs(loadNotifPrefs());
    const sync = () => setPrefs(loadNotifPrefs());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "exa-tareas-notif-prefs") sync();
    };
    window.addEventListener("exa-notif-prefs", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("exa-notif-prefs", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const pushEvent = useCallback((event: AppEvent) => {
    if (event.type === "heartbeat") return;
    if (seen.current.has(event.id)) return;

    const current = prefsRef.current;
    if (!isEventTypeEnabled(current, event.type)) return;

    seen.current.add(event.id);

    const note: AppNotification = { ...event, read: false };
    setItems((prev) => [note, ...prev].slice(0, MAX_ITEMS));
    setLastTaskEventAt(Date.now());

    if (current.toast) {
      setToast(note);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 8000);
    }

    if (
      current.desktop &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      (event.type === "tarea_asignada" || event.type === "ticket_asignado")
    ) {
      try {
        const desktop = new Notification(event.title, {
          body: eventoTextoPlano(event),
          tag: event.id,
        });
        // Al pulsarla se trae la ventana al frente y se abre el detalle correspondiente.
        desktop.onclick = () => {
          window.focus();
          openNotificationRef.current(note);
          desktop.close();
        };
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/events");

      const onMessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(String(ev.data)) as AppEvent;
          pushEvent(data);
        } catch {
          /* ignore malformed */
        }
      };

      for (const type of [
        "tarea_creada",
        "tarea_asignada",
        "ticket_asignado",
        "tarea_actualizada",
        "avance_registrado",
        "estado_cambiado",
        "brief_generado",
        "message",
      ]) {
        es.addEventListener(type, onMessage);
      }

      es.onerror = () => {
        es?.close();
        if (!closed) {
          retryTimer = setTimeout(connect, 4000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      es?.close();
    };
  }, [pushEvent]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default" && prefs.desktop) {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, [prefs.desktop]);

  const dismissToast = useCallback(() => setToast(null), []);
  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);
  const clearAll = useCallback(() => {
    setItems([]);
    seen.current.clear();
  }, []);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const value = useMemo(
    () => ({
      items,
      unread,
      toast,
      dismissToast,
      markAllRead,
      markRead,
      clearAll,
      openNotification,
      lastTaskEventAt,
      prefs,
    }),
    [items, unread, toast, dismissToast, markAllRead, markRead, clearAll, openNotification, lastTaskEventAt, prefs]
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = use(NotificationsContext);
  if (!ctx) throw new Error("useNotifications debe usarse dentro de NotificationsProvider");
  return ctx;
}
