"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle({ className }: { className?: string }) {
  const { toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-lg border border-transparent text-brand-gray-600 transition-colors hover:border-brand-gray-200 hover:bg-brand-gray-100 hover:text-brand-gray-900 sm:size-8",
        className
      )}
      aria-label="Cambiar entre modo claro y oscuro"
      title="Cambiar tema"
    >
      <Sun className="hidden h-4 w-4 dark:block" strokeWidth={2} />
      <Moon className="block h-4 w-4 dark:hidden" strokeWidth={2} />
    </button>
  );
}
