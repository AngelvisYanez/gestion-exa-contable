"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

function usesInlineWidth(className?: string) {
  if (!className) return false;
  return (
    /\bw-auto\b/.test(className) ||
    /\bw-fit\b/.test(className) ||
    /\bmin-w-/.test(className) ||
    /\bw-\[/.test(className)
  );
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, disabled, children, ...props }, ref) => {
    const inline = usesInlineWidth(className) || usesInlineWidth(wrapperClassName);

    return (
      <div
        className={cn(
          "relative max-w-full min-w-0",
          inline ? "inline-flex w-auto" : "block w-full",
          disabled && "opacity-50",
          wrapperClassName
        )}
      >
        <select
          disabled={disabled}
          className={cn(
            "w-full min-w-0 appearance-none rounded-lg border border-input bg-background",
            "py-2 pl-3 pr-9 text-base shadow-sm transition-colors sm:text-sm",
            "h-11 min-h-[44px] sm:h-10 sm:min-h-[2.5rem]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
