"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CompartirEstado = "copiado" | "error" | null;

export function ShareMenu({
  title,
  getText,
  getUrl,
  onStatus,
  disabled,
}: {
  title: string;
  getText: () => string;
  getUrl: () => string;
  onStatus: (status: CompartirEstado) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const message = () => `${getText()}\n\nAbrir en EXA: ${getUrl()}`;

  const compartirWhatsApp = () => {
    onStatus(null);
    window.open(`https://wa.me/?text=${encodeURIComponent(message())}`, "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  const compartirCorreo = () => {
    onStatus(null);
    const subject = encodeURIComponent(title);
    const body = encodeURIComponent(message());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setOpen(false);
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(message());
      onStatus("copiado");
    } catch {
      onStatus("error");
    }
    setOpen(false);
  };

  const compartirDispositivo = async () => {
    try {
      await navigator.share({ title, text: getText(), url: getUrl() });
      onStatus(null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onStatus("error");
    }
    setOpen(false);
  };

  const optionClass =
    "flex min-h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={disabled}>
          <Share2 className="size-4" />
          Compartir
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-52 p-1">
        <button type="button" className={optionClass} onClick={compartirWhatsApp}>
          <MessageCircle className="size-4" /> WhatsApp
        </button>
        <button type="button" className={optionClass} onClick={compartirCorreo}>
          <Mail className="size-4" /> Correo electrónico
        </button>
        <button type="button" className={optionClass} onClick={() => void copiar()}>
          <Copy className="size-4" /> Copiar texto
        </button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <button type="button" className={optionClass} onClick={() => void compartirDispositivo()}>
            <Smartphone className="size-4" /> Compartir con dispositivo
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
