export const CAPACITACION_PROYECTOS = [
  { id: "servicios", nombre: "Exa Ofsercont" },
  { id: "relavera", nombre: "Exa Relavera" },
] as const;

export function nombreProyectoCapacitacion(id: string): string {
  return CAPACITACION_PROYECTOS.find((proyecto) => proyecto.id === id)?.nombre || id;
}
