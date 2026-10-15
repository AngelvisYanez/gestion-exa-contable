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

export function clearDetailLink(...params: string[]) {
  const url = new URL(window.location.href);
  url.searchParams.delete("detalle");
  for (const param of params) url.searchParams.delete(param);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
