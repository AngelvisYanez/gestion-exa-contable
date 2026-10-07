import type { TrabajoMonitorItem } from "./monitoreo";

export type BandejaMesaInput = {
  tareasSinAsignar: TrabajoMonitorItem[];
  ticketsSinAsignar: TrabajoMonitorItem[];
  tareasMias: TrabajoMonitorItem[];
  ticketsMios: TrabajoMonitorItem[];
};

function claveTicket(t: TrabajoMonitorItem): string {
  return `${t.Db_Origen || ""}:${t.Tic_Cod ?? t.Tar_Cod}`;
}

/** Cuatro colas de encargado y atención: por asignar arriba, lo propio debajo. */
export function armarBandejaMesa(input: BandejaMesaInput): TrabajoMonitorItem[] {
  const libresTar = new Set(input.tareasSinAsignar.map((t) => t.Tar_Cod));
  const libresTic = new Set(input.ticketsSinAsignar.map(claveTicket));

  const porAsignar = [...input.tareasSinAsignar, ...input.ticketsSinAsignar].map((t) => ({
    ...t,
    por_asignar: true,
  }));

  const mias = [
    ...input.tareasMias.filter((t) => !libresTar.has(t.Tar_Cod)),
    ...input.ticketsMios.filter((t) => !libresTic.has(claveTicket(t))),
  ].map((t) => ({
    ...t,
    por_asignar: false,
  }));

  return [...porAsignar, ...mias];
}

/** El desarrollador solo ve lo suyo, nunca la cola por asignar. */
export function bandejaAsignadaDev(items: TrabajoMonitorItem[]): TrabajoMonitorItem[] {
  return items
    .filter((t) => !t.por_asignar)
    .map((t) => ({
      ...t,
      por_asignar: false,
    }));
}
