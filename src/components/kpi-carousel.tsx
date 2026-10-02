"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type KpiCarouselItem = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
};

const toneClass: Record<NonNullable<KpiCarouselItem["tone"]>, string> = {
  default: "text-primary",
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
  info: "text-sky-600",
  muted: "text-slate-600",
};

type Props = {
  items: KpiCarouselItem[];
  className?: string;
  /** Ancho mínimo de cada tarjeta (px). */
  cardMinWidth?: number;
};

export function KpiCarousel({ items, className, cardMinWidth = 168 }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    setCanPrev(scrollLeft > 4);
    setCanNext(scrollLeft < maxScroll - 4);
    const total = maxScroll <= 0 ? 1 : Math.max(1, Math.ceil(scrollWidth / Math.max(clientWidth, 1)));
    setPages(total);
    const idx =
      maxScroll <= 0 ? 0 : Math.min(total - 1, Math.round((scrollLeft / maxScroll) * (total - 1)));
    setPage(idx);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [sync, items.length]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const goToPage = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = pages <= 1 ? 0 : (i / (pages - 1)) * maxScroll;
    el.scrollTo({ left, behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden h-9 w-9 shrink-0 p-0 sm:inline-flex"
          disabled={!canPrev}
          onClick={() => scrollByPage(-1)}
          aria-label="Anterior"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div
          ref={scrollerRef}
          className={cn(
            "flex min-w-0 flex-1 gap-3 overflow-x-auto scroll-smooth pb-1",
            "snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {items.map((k) => (
            <Card
              key={k.label}
              className="shrink-0 snap-start overflow-hidden"
              style={{ width: `min(100%, ${cardMinWidth}px)`, minWidth: `min(70vw, ${cardMinWidth}px)` }}
            >
              <CardContent className="p-4">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {k.label}
                </div>
                <div
                  className={cn(
                    "mt-1 text-2xl font-bold tabular-nums",
                    toneClass[k.tone || "default"]
                  )}
                >
                  {k.value}
                </div>
                {k.hint ? (
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{k.hint}</div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden h-9 w-9 shrink-0 p-0 sm:inline-flex"
          disabled={!canNext}
          onClick={() => scrollByPage(1)}
          aria-label="Siguiente"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {pages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Pagina ${i + 1}`}
              onClick={() => goToPage(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === page ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
