"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type AdjuntoPreview = {
  url: string;
  nombre: string;
  tipo: "imagen" | "pdf";
};

export function esPdfAdjunto(archivo: { nombre: string; ruta: string }) {
  return /\.pdf$/i.test(archivo.nombre) || /\.pdf$/i.test(archivo.ruta);
}

export function AdjuntoPreviewDialog({
  archivo,
  onClose,
}: {
  archivo: AdjuntoPreview | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!archivo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[94dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3 pr-14 sm:px-6 sm:pr-16">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm sm:text-base">
            {archivo?.nombre || "Vista previa"}
          </DialogTitle>
          <DialogDescription className="sr-only">Vista previa del archivo adjunto</DialogDescription>
          {archivo && (
            <Button asChild size="sm" variant="outline">
              <a href={archivo.url} download={archivo.nombre}>
                <Download className="size-4" />
                Descargar
              </a>
            </Button>
          )}
        </div>
        {archivo?.tipo === "imagen" && (
          <div className="flex min-h-0 items-center justify-center overflow-auto bg-muted/30 p-2 sm:p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={archivo.url}
              alt={archivo.nombre}
              className="max-h-[78dvh] max-w-full rounded-lg object-contain"
            />
          </div>
        )}
        {archivo?.tipo === "pdf" && (
          <iframe
            key={archivo.url}
            src={archivo.url}
            title={`Vista previa de ${archivo.nombre}`}
            className="h-[78dvh] min-h-0 w-full bg-background"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
