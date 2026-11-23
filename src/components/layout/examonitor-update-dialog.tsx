"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { EXAMONITOR_UPDATE_DOWNLOAD, EXAMONITOR_VERSION } from "@/lib/examonitor-release";

export function ExaMonitorUpdateDialog() {
  const { loading, user } = useAuth();
  const [open, setOpen] = useState(false);
  const storageKey = user ? `examonitor-update-${EXAMONITOR_VERSION}-${user.perCod || user.username}` : null;

  useEffect(() => {
    if (loading || !storageKey) return;
    try {
      setOpen(localStorage.getItem(storageKey) !== "seen");
    } catch {
      setOpen(true);
    }
  }, [loading, storageKey]);

  function dismiss() {
    setOpen(false);
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, "seen");
    } catch {
      // El cierre también funciona si el navegador bloquea el almacenamiento.
    }
  }

  return (
    <Dialog open={open && !!storageKey} onOpenChange={(nextOpen) => !nextOpen && dismiss()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva versión de ExaMonitor {EXAMONITOR_VERSION}</DialogTitle>
          <DialogDescription>Ya puedes gestionar los proyectos de las tareas desde ExaMonitor.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>Elige Exa Relavera, Exa Ofsercont u Otro al crear una tarea.</li>
          <li>Consulta el proyecto en una etiqueta del detalle.</li>
          <li>Cambia o quita el proyecto desde el detalle si tienes permiso para editar la tarea.</li>
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={dismiss}>Ahora no</Button>
          <Button asChild>
            <a href={EXAMONITOR_UPDATE_DOWNLOAD} onClick={dismiss}>
              <Download className="size-4" aria-hidden="true" />
              Descargar para Windows
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
