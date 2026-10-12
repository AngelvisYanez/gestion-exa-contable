export type TareaAccess = {
  isCreator: boolean;
  isAssigned: boolean;
  hasAssignees: boolean;
};

export function developerUpdatePermission(
  access: TareaAccess | null,
  change: { touchesContent: boolean; changesState: boolean; nextState?: string }
): "allowed" | "forbidden" | "unassigned" {
  if (!access) return "forbidden";
  if (change.touchesContent && !access.isCreator) return "forbidden";
  if (change.changesState && !access.isCreator && !access.isAssigned) return "forbidden";
  if (change.nextState === "Asignado" && !access.hasAssignees) return "unassigned";
  return "allowed";
}
