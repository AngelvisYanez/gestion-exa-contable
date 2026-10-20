"use client";

import Link from "next/link";
import { Ticket as TicketIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type TicketRef = {
  Tic_Cod: number;
  Tic_Db?: string | null;
  Titulo?: string | null;
  Estado?: string | null;
};

/**
 * Chip con la afiliación de una tarea a su ticket origen ("Convertir a tarea").
 * Abre el detalle del ticket; no dispara el click de la tarjeta contenedora.
 */
export function TicketVinculadoChip({
  tickets,
  className,
}: {
  tickets?: TicketRef[] | null;
  className?: string;
}) {
  if (!tickets?.length) return null;
  const first = tickets[0];
  const db = first.Tic_Db || "exa";
  const resto = tickets.length - 1;
  const estado = (first.Estado || "").trim();
  const cerrado = estado === "Cerrado";
  return (
    <Link
      href={`/tickets?detalle=${first.Tic_Cod}&db=${encodeURIComponent(db)}`}
      onClick={(e) => e.stopPropagation()}
      title={
        first.Titulo
          ? `Ticket #${first.Tic_Cod}: ${first.Titulo}`
          : `Ticket #${first.Tic_Cod} (${db})`
      }
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold",
        cerrado
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-400 hover:bg-amber-100",
        className
      )}
    >
      <TicketIcon className="size-3 shrink-0" />
      <span className="truncate">Ticket #{first.Tic_Cod}</span>
      {resto > 0 ? <span className="shrink-0">+{resto}</span> : null}
      {estado ? <span className="shrink-0 font-medium opacity-70">· {estado}</span> : null}
    </Link>
  );
}
