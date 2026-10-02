"use client";

import { GripVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  editMode?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function WidgetShell({ title, editMode, onRemove, children, className, bodyClassName }: Props) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        editMode && "ring-2 ring-primary/30",
        className
      )}
    >
      <div
        className={cn(
          "flex h-9 shrink-0 items-center gap-2 border-b border-border/80 bg-muted/40 px-3",
          editMode && "widget-drag-handle cursor-grab active:cursor-grabbing"
        )}
      >
        {editMode && <GripVertical className="size-4 shrink-0 text-muted-foreground" />}
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight">{title}</h3>
        {editMode && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Quitar widget"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden p-2.5", bodyClassName)}>{children}</div>
    </div>
  );
}
