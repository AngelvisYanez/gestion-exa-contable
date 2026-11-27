export function tareaDetailUrl(origin: string, id: number): string {
  const url = new URL("/tareas", origin);
  url.searchParams.set("detalle", String(id));
  return url.href;
}

export function ticketDetailUrl(origin: string, id: number, db: string): string {
  const url = new URL("/tickets", origin);
  url.searchParams.set("detalle", String(id));
  url.searchParams.set("db", db);
  return url.href;
}

export function detailIdFromSearch(search: string): number | null {
  const raw = new URLSearchParams(search).get("detalle");
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** Se dispara cuando la URL cambia a `?detalle=` sin recargar la página actual. */
export const DETAIL_LINK_EVENT = "exa-detail-link";

/**
 * Abre un enlace de detalle. Si ya estamos en esa pantalla solo actualiza la URL y avisa a la
 * página (que no se vuelve a montar); si no, navega con el router de Next.
 */
export function navigateToDetail(router: { push: (href: string) => void }, href: string) {
  const url = new URL(href, window.location.origin);
  if (url.pathname === window.location.pathname) {
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(DETAIL_LINK_EVENT));
    return;
  }
  router.push(`${url.pathname}${url.search}${url.hash}`);
}

export function clearDetailLink(...params: string[]) {
  const url = new URL(window.location.href);
  url.searchParams.delete("detalle");
  for (const param of params) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
