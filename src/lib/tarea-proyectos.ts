export const TAREA_PROYECTOS = {
  relavera: "Exa Relavera",
  ofsercont: "Exa Ofsercont",
  otro: "Otro",
} as const;

export type TareaProyecto = keyof typeof TAREA_PROYECTOS;

export function esTareaProyecto(value: unknown): value is TareaProyecto {
  return typeof value === "string" && Object.hasOwn(TAREA_PROYECTOS, value);
}
