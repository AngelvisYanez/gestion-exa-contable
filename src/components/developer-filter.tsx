"use client";

import { UserRound } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type DeveloperOption = {
  Per_Cod: number;
  Nombre: string;
};

type Props = {
  value: number | null;
  options: DeveloperOption[];
  onChange: (perCod: number | null) => void;
  disabled?: boolean;
  className?: string;
};

export function DeveloperFilter({ value, options, onChange, disabled, className }: Props) {
  return (
    <div
      className={cn(
        "flex h-auto min-h-10 w-full max-w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1 shadow-sm sm:inline-flex sm:w-auto sm:py-0",
        className
      )}
    >
      <UserRound className="size-4 shrink-0 text-muted-foreground" />
      <Label htmlFor="filtro-dev" className="mb-0 shrink-0 normal-case tracking-normal">
        Dev
      </Label>
      <Select
        id="filtro-dev"
        wrapperClassName="min-w-0 w-full flex-1 sm:w-[180px] sm:flex-none"
        className="h-8 min-h-0 w-full py-0 text-xs"
        value={value ? String(value) : ""}
        disabled={disabled || options.length === 0}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v ? Number(v) : null);
        }}
      >
        <option value="">Todo el equipo</option>
        {options.map((d) => (
          <option key={d.Per_Cod} value={d.Per_Cod}>
            {d.Nombre}
          </option>
        ))}
      </Select>
    </div>
  );
}
