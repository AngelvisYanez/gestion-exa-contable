import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base shadow-sm transition-colors sm:text-sm",
        "h-11 min-h-[44px] sm:h-10 sm:min-h-[2.5rem]",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        type === "date" || type === "datetime-local" || type === "time"
          ? "max-w-full appearance-none"
          : undefined,
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
