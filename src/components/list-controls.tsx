"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Columns3, LayoutGrid, LayoutList, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

/** Barra de filtros: siempre una sola fila (desplaza en horizontal si no cabe). */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain filter-scroll",
        "[&>*]:shrink-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export type ListViewMode = "lista" | "grid" | "kanban";

type ToggleOption = {
  id: ListViewMode;
  label: string;
  icon: typeof LayoutList;
};

const DEFAULT_OPTIONS: ToggleOption[] = [
  { id: "lista", label: "Lista", icon: LayoutList },
  { id: "grid", label: "Grid", icon: LayoutGrid },
];

const WITH_KANBAN: ToggleOption[] = [
  ...DEFAULT_OPTIONS,
  { id: "kanban", label: "Kanban", icon: Columns3 },
];

type ViewModeToggleProps = {
  value: ListViewMode;
  onChange: (mode: ListViewMode) => void;
  withKanban?: boolean;
  className?: string;
};

export function ViewModeToggle({ value, onChange, withKanban, className }: ViewModeToggleProps) {
  const options = withKanban ? WITH_KANBAN : DEFAULT_OPTIONS;
  return (
    <div className={cn("inline-flex max-w-full rounded-lg border border-border bg-muted/40 p-0.5", className)}>
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            title={o.label}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-bold transition-colors",
              value === o.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type PageSizeFilterProps = {
  value: PageSize;
  onChange: (size: PageSize) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
};

export function PageSizeFilter({
  value,
  onChange,
  disabled,
  className,
  compact,
}: PageSizeFilterProps) {
  return (
    <div
      className={cn(
        "inline-flex w-auto max-w-none min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 shadow-sm",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <Rows3 className="size-3.5 shrink-0 text-muted-foreground" />
      {!compact && (
        <Label
          htmlFor="filtro-paginacion"
          className="mb-0 shrink-0 whitespace-nowrap normal-case tracking-normal"
        >
          Por página
        </Label>
      )}
      <Select
        id="filtro-paginacion"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) as PageSize)}
        wrapperClassName="min-w-[4.5rem] shrink-0"
        className="h-9 min-h-[40px] py-1 pl-2 pr-8 text-xs sm:min-h-[2.25rem]"
        aria-label="Elementos por página"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </Select>
    </div>
  );
}

type PaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: PageSize) => void;
  hidePageSize?: boolean;
  className?: string;
};

export function PaginationBar({
  page,
  totalPages,
  total,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  hidePageSize,
  className,
}: PaginationProps) {
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-center text-xs text-muted-foreground sm:text-left">
        Mostrando{" "}
        <span className="font-semibold text-foreground">
          {from}–{to}
        </span>{" "}
        de <span className="font-semibold text-foreground">{total}</span>
        <span className="ml-1 text-muted-foreground/80">({pageSize}/pág.)</span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {!hidePageSize && onPageSizeChange && (
          <PageSizeFilter value={pageSize} onChange={onPageSizeChange} compact />
        )}
        <div className="flex items-center justify-center gap-1 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-h-[44px] flex-1 px-3 sm:h-8 sm:min-h-0 sm:flex-none sm:px-2"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-3.5" />
            Ant
          </Button>
          <span className="min-w-[4.5rem] text-center text-xs font-semibold tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-h-[44px] flex-1 px-3 sm:h-8 sm:min-h-0 sm:flex-none sm:px-2"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Sig
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
