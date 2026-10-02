"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import type { TareaDetalle } from "@/lib/tareas";

type Props = {
  open: boolean;
  tarea: Tarea | null;
  detalle: TareaDetalle["tarea"] | null;
  onClose: () => void;
  onGenerated?: () => void | Promise<void>;
};

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function GenerarBriefDialog({ open, tarea, detalle, onClose, onGenerated }: Props) {
  const { db } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [proceso, setProceso] = useState("");
  const [modulo, setModulo] = useState("");
  const [directorio, setDirectorio] = useState("");
  const [tipo, setTipo] = useState<"mejora" | "creacion">("mejora");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    mdRel: string;
    pdfRel: string;
    whatsappNote: string;
    llmNote: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setResult(null);
    setTitulo(detalle?.Tar_Titulo || tarea?.Tar_Titulo || "");
    setDescripcion(stripHtml(detalle?.Tar_Descripcion || tarea?.Tar_Descripcion || ""));
    setProceso(detalle?.Tar_Proceso || "");
    setModulo(detalle?.Tar_Modulo || "");
    setDirectorio(detalle?.Tar_Directorio || "");
    setTipo(detalle?.Tar_Brief_Tipo === "creacion" ? "creacion" : "mejora");
  }, [open, detalle, tarea]);

  const generar = async () => {
    if (!tarea?.Tar_Cod) return;
    if (!titulo.trim()) {
      setError("El titulo es obligatorio.");
      return;
    }
    if (!proceso.trim() || !modulo.trim() || !directorio.trim()) {
      setError("Proceso, modulo y directorio son obligatorios para anclar el brief a OFSERCONT.");
      return;
    }
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_brief",
          Ses_Dat_Dis: db,
          Tar_Cod: tarea.Tar_Cod,
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          proceso: proceso.trim(),
          modulo: modulo.trim(),
          directorio: directorio.trim(),
          tipo,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo generar el brief");
      const brief = j.brief as {
        mdRel: string;
        pdfRel: string;
        whatsapp?: { note?: string };
        llm?: { note?: string; ok?: boolean; model?: string | null };
      };
      setResult({
        mdRel: brief.mdRel,
        pdfRel: brief.pdfRel,
        whatsappNote: brief.whatsapp?.note || "",
        llmNote: brief.llm?.note || "",
      });
      await onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Generar brief de desarrollo
          </DialogTitle>
          <DialogDescription>
            Crea Markdown y PDF en <code className="text-xs">docs/</code> del proyecto gestion.
            Gemini 3 analiza el directorio indicado en EXA OFSERCONT (no el ERP completo). WhatsApp
            queda preparado (UltraMsg); por ahora se notifica en el panel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {error && <Alert variant="destructive">{error}</Alert>}
          {result && (
            <Alert variant="success" className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <div className="space-y-1 text-sm">
                <p className="font-semibold">Brief generado</p>
                <p className="flex items-center gap-1.5 text-xs">
                  <FileText className="size-3.5" />
                  {result.mdRel}
                </p>
                <p className="flex items-center gap-1.5 text-xs">
                  <FileText className="size-3.5" />
                  {result.pdfRel}
                </p>
                {result.llmNote && (
                  <p className="text-[11px] text-emerald-800/80">{result.llmNote}</p>
                )}
                {result.whatsappNote && (
                  <p className="text-[11px] text-emerald-800/80">{result.whatsappNote}</p>
                )}
              </div>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="brief-tipo">Tipo</Label>
            <Select
              id="brief-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value === "creacion" ? "creacion" : "mejora")}
            >
              <option value="mejora">Mejora de modulo</option>
              <option value="creacion">Creacion de modulo</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-titulo">Titulo</Label>
            <Input
              id="brief-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-desc">Descripcion</Label>
            <Textarea
              id="brief-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
              className="resize-y"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brief-proceso">Proceso</Label>
              <Input
                id="brief-proceso"
                placeholder="Tesoreria, Facturacion…"
                value={proceso}
                onChange={(e) => setProceso(e.target.value)}
                list="brief-procesos"
              />
              <datalist id="brief-procesos">
                <option value="Tesoreria" />
                <option value="Facturacion" />
                <option value="Contabilidad" />
                <option value="Compras" />
                <option value="Inventario" />
                <option value="RRHH" />
                <option value="Administracion" />
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brief-modulo">Modulo</Label>
              <Input
                id="brief-modulo"
                placeholder="CxPP lotes, Retenciones…"
                value={modulo}
                onChange={(e) => setModulo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brief-dir">Directorio (OFSERCONT)</Label>
            <Input
              id="brief-dir"
              placeholder="tesoreria o facturacion/FRONT"
              value={directorio}
              onChange={(e) => setDirectorio(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Ruta relativa a la raiz de exa-ofsercont en el servidor.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            {result ? "Cerrar" : "Cancelar"}
          </Button>
          <Button type="button" onClick={() => void generar()} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {saving ? "Generando…" : "Generar brief"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
