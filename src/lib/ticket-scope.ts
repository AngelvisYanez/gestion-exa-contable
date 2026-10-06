import { resolvePerCod } from "@/lib/auth/resolvePer";
import { matchTeamMember } from "@/lib/auth/users";
import { getPrisma } from "@/lib/db";
import { tasksDbDis } from "@/lib/empresa";
import { resolveUsuCodesFromPer } from "@/lib/monitoreo";

/** Usu_Cod y Per_Cod con los que un colaborador ve tickets asignados. */
export async function ticketScopeForSession(session: {
  usuCod: number;
  perCod: number;
  prsCod: number;
  cedula: string;
  name: string;
}) {
  const db = tasksDbDis();
  const team = matchTeamMember(session.name);
  const perCod = await resolvePerCod(db, {
    perCod: session.perCod > 0 ? session.perCod : undefined,
    prsCod: session.prsCod,
    cedula: session.cedula,
    nameMatch: team?.nameMatch,
  });
  const codes = new Set<number>();
  if (session.usuCod > 0) codes.add(session.usuCod);
  if (perCod > 0) {
    const prisma = getPrisma(db);
    for (const c of await resolveUsuCodesFromPer(prisma, perCod)) {
      if (c > 0) codes.add(c);
    }
  }
  return {
    perCod,
    aseCodes: [...codes],
    perCodes: perCod > 0 ? [perCod] : [],
  };
}
