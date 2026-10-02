import { createHash } from "crypto";
import { getPrisma } from "@/lib/db";
import { EMPRESA_TAREAS, tasksDbDis, tasksEmpCod } from "@/lib/empresa";
import { findPanelActivo, setPanelUsuario } from "@/lib/panel-usuarios";
import { ensurePersonalForEmp, resolvePerCod } from "./resolvePer";
import { matchTeamMember, PROJECTS, type UserRole } from "./users";

export type ExaAuthUser = {
  username: string;
  cedula: string;
  name: string;
  role: UserRole;
  projects: string[];
  perCod: number;
  usuCod: number;
  prsCod: number;
  empCod: number;
  dbDis: string;
  teamName: string;
};

function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}

function managerCedulas(): Set<string> {
  const raw = process.env.AUTH_MANAGER_CEDULAS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/**
 * Autentica por cedula + clave EXA y restringe al equipo autorizado.
 */
export async function authenticateByCedula(
  cedulaRaw: string,
  password: string,
  preferredDb?: string
): Promise<{ user: ExaAuthUser | null; reason?: string }> {
  const cedula = cedulaRaw.replace(/\D/g, "") || cedulaRaw.trim();
  if (!cedula || !password) {
    return { user: null, reason: "Cedula y contrasena son obligatorias." };
  }

  const passMd5 = md5(password);
  const empCodFixed = tasksEmpCod();
  const dbFixed = tasksDbDis(preferredDb);
  // Solo BD operativa de tareas (exa / Emp 96); no recorrer otras empresas.
  const dbs = [dbFixed];

  let foundInDb = false;

  for (const dbDis of dbs) {
    try {
      const prisma = getPrisma(dbDis);

      const userWhereBase = {
        Usu_Est: "A" as const,
        OR: [{ Usu_Ced: cedula }, { persona: { Prs_Ced: cedula } }],
        sucursal: {
          Suc_Est: "A" as const,
          Emp_Cod: empCodFixed,
        },
      };

      let user = await prisma.usuarios.findFirst({
        where: { ...userWhereBase, Usu_Pal: passMd5 },
        include: {
          persona: true,
          sucursal: { include: { empresa: true } },
        },
        orderBy: { Usu_Cod: "asc" }, // preferir Suc MATRIZ (99) sobre PROGRAMA 002
      });

      if (!user) {
        user = await prisma.usuarios.findFirst({
          where: { ...userWhereBase, Usu_Pal: password },
          include: {
            persona: true,
            sucursal: { include: { empresa: true } },
          },
          orderBy: { Usu_Cod: "asc" },
        });
      }

      // Preferir sucursal MATRIZ (Suc_Cod=99) si hay varias en Emp 96
      if (user) {
        const matriz = await prisma.usuarios.findFirst({
          where: {
            ...userWhereBase,
            Usu_Pal: user.Usu_Pal || undefined,
            Suc_Cod: EMPRESA_TAREAS.sucCod,
          },
          include: {
            persona: true,
            sucursal: { include: { empresa: true } },
          },
        });
        if (matriz) user = matriz;
      }

      if (!user) continue;
      foundInDb = true;

      const fullName = `${user.persona?.Prs_Ape || ""} ${user.persona?.Prs_Nom || ""}`.trim();
      const ced = user.Usu_Ced || user.persona?.Prs_Ced || cedula;
      const cedDigits = String(ced).replace(/\D/g, "").slice(0, 10) || ced;
      const forcedManager =
        managerCedulas().has(String(ced)) || managerCedulas().has(cedDigits);

      let panel = await findPanelActivo(prisma, user.Usu_Cod);
      if (forcedManager && panel?.rol !== "manager") {
        await setPanelUsuario(dbDis, user.Usu_Cod, panel ? "role" : "add", "manager");
        panel = await findPanelActivo(prisma, user.Usu_Cod);
      }
      if (!panel) {
        return {
          user: null,
          reason:
            "Tu usuario EXA es valido, pero no estas habilitado en la gestion. El encargado debe agregarte en Configuracion > Usuarios.",
        };
      }

      const role: UserRole = forcedManager ? "manager" : panel.rol;
      const team = matchTeamMember(fullName || panel.nombre);
      let perCod =
        panel.perCod > 0
          ? panel.perCod
          : await resolvePerCod(dbDis, {
              prsCod: user.Prs_Cod,
              cedula: cedDigits,
              empCod: empCodFixed,
              nameMatch: team?.nameMatch,
            });

      // Encargados/devs del panel sin ficha Emp 96: crear personal (ExaMonitor).
      if (perCod <= 0 && user.Prs_Cod > 0) {
        perCod = await ensurePersonalForEmp(dbDis, {
          prsCod: user.Prs_Cod,
          empCod: empCodFixed,
          cargo: role === "manager" ? "ENCARGADO" : "DESARROLLO",
        });
      }

      // Persistir Per_Cod en el panel cuando se resuelve o crea.
      if (perCod > 0 && panel.perCod !== perCod) {
        try {
          await getPrisma(dbDis).$executeRawUnsafe(
            `UPDATE aud_panel_usuarios
             SET Per_Cod = ?, Pan_Actualizado = NOW()
             WHERE Usu_Cod = ? AND Pan_Est = 'A'`,
            perCod,
            user.Usu_Cod
          );
        } catch {
          /* no bloquear el login si falla el update */
        }
      }

      return {
        user: {
          username: cedDigits,
          cedula: cedDigits,
          name: fullName || panel.nombre,
          role,
          projects: PROJECTS.map((p) => p.id),
          perCod,
          usuCod: user.Usu_Cod,
          prsCod: user.Prs_Cod,
          empCod: empCodFixed,
          dbDis,
          teamName: panel.nombre || fullName,
        },
      };
    } catch (err) {
      console.error(`[auth] BD ${dbDis}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!foundInDb) {
    return {
      user: null,
      reason: "Cedula o contrasena incorrectas, o el usuario no esta activo en EXA.",
    };
  }

  return { user: null, reason: "No autorizado." };
}
