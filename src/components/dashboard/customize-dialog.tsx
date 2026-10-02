"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  DashboardPrefs,
  DashboardRole,
  catalogFor,
  getDefaultPrefs,
  metaFor,
} from "./widget-registry";

type Props = {
  role: DashboardRole;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prefs: DashboardPrefs;
  onPrefsChange: (prefs: DashboardPrefs) => void;
};

export function CustomizeWidgetsDialog({
  role,
  open,
  onOpenChange,
  prefs,
  onPrefsChange,
}: Props) {
  const catalog = catalogFor(role);

  const toggle = (id: string, on: boolean) => {
    if (on) {
      if (prefs.enabled.includes(id)) return;
      const hasLayout = prefs.layouts.some((l) => l.i === id);
      onPrefsChange({
        enabled: [...prefs.enabled, id],
        layouts: hasLayout
          ? prefs.layouts
          : [...prefs.layouts, { ...metaFor(role, id).defaultLayout }],
      });
    } else {
      onPrefsChange({
        ...prefs,
        enabled: prefs.enabled.filter((w) => w !== id),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Personalizar dashboard</DialogTitle>
          <DialogDescription>
            Activa o desactiva widgets. Con «Editar layout» puedes arrastrarlos y redimensionarlos.
            Tus preferencias se guardan en este navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {catalog.map((w) => {
            const enabled = prefs.enabled.includes(w.id);
            return (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{w.title}</div>
                  <div className="text-xs text-muted-foreground">{w.description}</div>
                </div>
                <Switch checked={enabled} onCheckedChange={(v) => toggle(w.id, v)} />
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onPrefsChange(getDefaultPrefs(role))}>
            <RotateCcw />
            Restaurar por defecto
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
