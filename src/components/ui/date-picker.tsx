"use client";

import { useMemo, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_LOCALE, fechaEnZona, startOfDayZona } from "@/lib/timezone";
import { cn } from "@/lib/utils";

type Props = {
  value?: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  /** Botón más compacto (filtros / dialogs densos). */
  size?: "default" | "sm";
  allowClear?: boolean;
};

function parseYmd(ymd?: string): Date | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd.slice(0, 10))) return undefined;
  return startOfDayZona(ymd.slice(0, 10));
}

function formatDisplay(ymd?: string) {
  const d = parseYmd(ymd);
  if (!d) return "";
  return d.toLocaleDateString(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  disabled,
  placeholder = "Elegir fecha",
  className,
  id,
  size = "default",
  allowClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseYmd(value), [value]);
  const fromDate = useMemo(() => parseYmd(min), [min]);
  const toDate = useMemo(() => parseYmd(max), [max]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-semibold",
            size === "sm" ? "h-8 px-2.5 text-xs" : "h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className={cn(size === "sm" ? "size-3.5" : "size-4", "text-muted-foreground")} />
          <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected || fromDate || toDate}
          disabled={[
            ...(fromDate ? [{ before: fromDate }] : []),
            ...(toDate ? [{ after: toDate }] : []),
          ]}
          onSelect={(day) => {
            if (!day) {
              if (allowClear) onChange("");
              return;
            }
            onChange(fechaEnZona(day));
            setOpen(false);
          }}
        />
        {allowClear && value ? (
          <div className="border-t border-border/70 p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Limpiar fecha
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
