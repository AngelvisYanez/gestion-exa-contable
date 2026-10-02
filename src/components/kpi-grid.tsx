import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Kpi = {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
};

const toneClass: Record<NonNullable<Kpi["tone"]>, string> = {
  default: "text-primary",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-600",
  muted: "text-slate-600",
};

export function KpiGrid({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((k) => (
        <Card key={k.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className={cn("mt-1 text-2xl font-bold tabular-nums", toneClass[k.tone || "default"])}>
              {k.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
