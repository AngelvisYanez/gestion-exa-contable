"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type KpiCarouselItem = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted";
  icon?: LucideIcon;
};

const toneStyle: Record<
  NonNullable<KpiCarouselItem["tone"]>,
  { text: string; icon: string; badge: string }
> = {
  default: {
    text: "text-primary",
    icon: "text-primary",
    badge: "bg-primary/10 ring-primary/15",
  },
  success: {
    text: "text-emerald-600",
    icon: "text-emerald-600",
    badge: "bg-emerald-500/10 ring-emerald-500/20",
  },
  warning: {
    text: "text-amber-600",
    icon: "text-amber-600",
    badge: "bg-amber-500/10 ring-amber-500/25",
  },
  danger: {
    text: "text-red-600",
    icon: "text-red-600",
    badge: "bg-red-500/10 ring-red-500/20",
  },
  info: {
    text: "text-sky-600",
    icon: "text-sky-600",
    badge: "bg-sky-500/10 ring-sky-500/20",
  },
  muted: {
    text: "text-slate-600",
    icon: "text-slate-500",
    badge: "bg-slate-500/10 ring-slate-500/15",
  },
};

type Props = {
  items: KpiCarouselItem[];
  className?: string;
};

const GAP_PX = 8;
/** Ancho al que apunta cada tarjeta; el carrusel mete más o menos columnas para llenar la fila. */
const PREFERRED_CARD_PX = 132;
const MIN_COLS = 2;
const MAX_COLS = 8;

function columnsFor(width: number) {
  const raw = Math.floor((width + GAP_PX) / (PREFERRED_CARD_PX + GAP_PX));
  return Math.min(MAX_COLS, Math.max(MIN_COLS, raw || MIN_COLS));
}

export function KpiCarousel({ items, className }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [cols, setCols] = useState(MIN_COLS);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return { pageStep: 0, total: 1, idx: 0, maxScroll: 0 };
    const card = el.querySelector<HTMLElement>("[data-kpi-card]");
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || String(GAP_PX)) || GAP_PX;
    const cardStep = card ? card.getBoundingClientRect().width + gap : el.clientWidth;
    const visible = Math.max(1, Math.round((el.clientWidth + gap) / cardStep));
    const pageStep = Math.max(1, cardStep * visible);
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    const total = maxScroll <= 4 ? 1 : Math.floor(maxScroll / pageStep) + 1;
    const idx = maxScroll <= 4 ? 0 : Math.min(total - 1, Math.round(el.scrollLeft / pageStep));
    return { pageStep, total, idx, maxScroll };
  }, []);

  const sync = useCallback(() => {
    const { total, idx, maxScroll } = measure();
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < maxScroll - 4);
    setPages(total);
    setPage(idx);
  }, [measure]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const apply = () => {
      const next = columnsFor(el.clientWidth);
      setCols((current) => (current === next ? current : next));
      sync();
    };
    apply();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [sync, items.length]);

  useLayoutEffect(() => {
    sync();
  }, [cols, sync, items.length]);

  const scrollByPage = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const { pageStep, maxScroll } = measure();
    const left = Math.min(maxScroll, Math.max(0, el.scrollLeft + dir * pageStep));
    el.scrollTo({ left, behavior: "smooth" });
  };

  const goToPage = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const { pageStep, maxScroll } = measure();
    el.scrollTo({ left: Math.min(i * pageStep, maxScroll), behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden size-7 shrink-0 p-0 sm:inline-flex"
          disabled={!canPrev}
          onClick={() => scrollByPage(-1)}
          aria-label="Anterior"
        >
          <ChevronLeft className="size-3.5" />
        </Button>

        <div
          ref={scrollerRef}
          className={cn(
            "flex min-w-0 flex-1 gap-2 overflow-x-auto scroll-smooth pb-0.5",
            "snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          )}
        >
          {items.map((k) => {
            const tone = toneStyle[k.tone || "default"];
            const Icon = k.icon;
            return (
              <Card
                key={k.label}
                data-kpi-card
                title={k.hint ? `${k.label}. ${k.hint}` : k.label}
                className="flex shrink-0 snap-start self-stretch overflow-hidden"
                style={{ width: `calc((100% - ${(cols - 1) * GAP_PX}px) / ${cols})` }}
              >
                <CardContent className="flex w-full items-center gap-1.5 px-2 py-1.5">
                  {Icon ? (
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md ring-1",
                        tone.badge
                      )}
                    >
                      <Icon className={cn("size-3.5", tone.icon)} strokeWidth={2.25} />
                    </span>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {k.label}
                    </div>
                    <div className={cn("text-lg font-bold leading-tight tabular-nums", tone.text)}>
                      {k.value}
                    </div>
                    {k.hint ? (
                      <div className="truncate text-[10px] leading-tight text-muted-foreground">{k.hint}</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden size-7 shrink-0 p-0 sm:inline-flex"
          disabled={!canNext}
          onClick={() => scrollByPage(1)}
          aria-label="Siguiente"
        >
          <ChevronRight className="size-3.5" />
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
