/**
 * Asignacion de tickets por parte del desarrollador: solo puede elegir sus
 * propios usuarios EXA (multi-sucursal) y su ficha de personal.
 */
export type DestinoAsignacion = {
  usuCod: number;
  perCod?: number;
};

export type AlcancePropio = {
  aseCodes: number[];
  perCodes: number[];
};

/**
 * Devuelve los destinos normalizados (con el Per_Cod propio) o `null` cuando
 * la lista incluye a otra persona o viene vacia.
 */
export function asignacionSoloPropia(
  destinos: DestinoAsignacion[],
  alcance: AlcancePropio
): DestinoAsignacion[] | null {
  const propios = new Set(alcance.aseCodes.filter((n) => Number.isFinite(n) && n > 0));
  const fichas = alcance.perCodes.filter((n) => Number.isFinite(n) && n > 0);
  if (!destinos.length) return null;
  if (destinos.some((d) => !propios.has(d.usuCod))) return null;
  return destinos.map((d) => ({
    usuCod: d.usuCod,
    perCod: d.perCod && fichas.includes(d.perCod) ? d.perCod : fichas[0],
  }));
}
