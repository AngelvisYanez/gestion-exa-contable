"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { plainTextFromHtml } from "@/components/ui/rich-text";
import { isSafeUrl } from "@/lib/avance-format";
import {
  EVIDENCIA_ACCEPT,
  EVIDENCIA_HELP,
  EVIDENCIA_MAX_BYTES,
  evidenciaLabel,
  isAllowedEvidenciaFile,
} from "@/lib/evidencia-files";
import { cn } from "@/lib/utils";

const MAX_FILES = 5;

type Props = {
  tarea: Tarea | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  /** Endpoint que recibe action=avance (/api/mis-tareas o /api/tareas). */
  endpoint: string;
  extraBody?: Record<string, unknown>;
  requireDescripcion?: boolean;
};

export function AvanceDialog({ tarea, onClose, onSaved, endpoint, extraBody, requireDescripcion = true }: Props) {
  const esTicket = tarea?.tipo === "ticket";
  const refCod = esTicket ? (tarea?.Tic_Cod ?? tarea?.Tar_Cod ?? null) : (tarea?.Tar_Cod ?? null);
  const tarCod = refCod;
  const [base, setBase] = useState(tarea?.Ava_Porcentaje || 0);
  const [pct, setPct] = useState(base);
  const [realizado, setRealizado] = useState("");
  const [siguiente, setSiguiente] = useState("");
  const [bloqueos, setBloqueos] = useState("");
  const [horas, setHoras] = useState("");
  const [enlace, setEnlace] = useState("");
  const [enlaces, setEnlaces] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [rutasPegadas, setRutasPegadas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tarea) return;
    setBase(tarea.Ava_Porcentaje || 0);
    setPct(tarea.Ava_Porcentaje || 0);
    setRealizado("");
    setSiguiente("");
    setBloqueos("");
    setHoras("");
    setEnlace("");
    setEnlaces([]);
    setFiles([]);
    setRutasPegadas([]);
    setError("");
    setSaving(false);
    // Solo reiniciar al abrir otra tarea; recargas de la lista no deben borrar lo escrito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarCod]);

  const previews = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")),
    [files]
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const delta = pct - base;

  const addEnlace = () => {
    const v = enlace.trim();
    if (!v) return;
    if (!isSafeUrl(v)) {
      setError("El enlace debe empezar con http:// o https://");
      return;
    }
    setEnlaces((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setEnlace("");
    setError("");
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > EVIDENCIA_MAX_BYTES) {
        setError(`"${f.name}" supera ${Math.round(EVIDENCIA_MAX_BYTES / (1024 * 1024))} MB.`);
        continue;
      }
      if (!isAllowedEvidenciaFile(f)) {
        setError(`"${f.name}": formato no permitido.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`Maximo ${MAX_FILES} archivos por avance.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const guardar = async () => {
    if (!tarea) return;
    if (requireDescripcion && !plainTextFromHtml(realizado).trim()) {
      setError("Describe que avanzaste: es la evidencia principal del avance.");
      return;
    }
    const pendingLink = enlace.trim();
    if (pendingLink && !isSafeUrl(pendingLink)) {
      setError("El enlace debe empezar con http:// o https://");
      return;
    }
    const allLinks = pendingLink && !enlaces.includes(pendingLink) ? [...enlaces, pendingLink] : enlaces;

    setSaving(true);
    setError("");
    try {
      let adjuntos: string[] = [];
      if (files.length) {
        const fd = new FormData();
        if (esTicket) {
          fd.set("Tic_Cod", String(refCod));
          if (tarea.Db_Origen) fd.set("Db_Origen", tarea.Db_Origen);
        } else {
          fd.set("Tar_Cod", String(tarea.Tar_Cod));
        }
        for (const f of files) fd.append("files", f);
        const up = await fetch("/api/evidencias", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok || !uj.success) throw new Error(uj.message || "No se pudieron subir las evidencias");
        adjuntos = (uj.adjuntos || []).map((a: { ruta: string }) => a.ruta);
      }
      adjuntos = [...adjuntos, ...rutasPegadas.filter((r) => !adjuntos.includes(r))];

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...extraBody,
          action: "avance",
          tipo: esTicket ? "ticket" : "tarea",
          Tic_Cod: esTicket ? refCod : undefined,
          Db_Origen: esTicket ? tarea.Db_Origen : undefined,
          Tar_Cod: esTicket ? undefined : tarea.Tar_Cod,
          porcentaje: pct,
          realizado,
          siguiente,
          bloqueos,
          horas: horas ? Number(horas.replace(",", ".")) : null,
          enlaces: allLinks,
          adjuntos,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudo guardar el avance");
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!tarea} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar avance</DialogTitle>
          <DialogDescription>
            {esTicket ? "Ticket" : "Tarea"} #{refCod} {tarea?.Tar_Titulo}
            {pct >= 100 ? " · al 100% queda resuelto" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="overflow-hidden rounded-xl border border-border/80">
            <div className="bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Label>Porcentaje de avance</Label>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{pct}%</span>
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums",
                      delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-muted-foreground"
                    )}
                  >
                    {delta > 0 ? `+${delta}` : delta} vs {base}%
                  </span>
                </div>
              </div>
              <Slider min={0} max={100} step={1} value={[pct]} onValueChange={(v) => setPct(v[0] ?? 0)} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[5, 10, 25].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPct((p) => Math.min(100, p + n))}
                  >
                    +{n}%
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setPct(100)}>
                  Completar (100%)
                </Button>
                {delta !== 0 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPct(base)}>
                    Restablecer
                  </Button>
                )}
              </div>
              {delta < 0 && (
                <p className="mt-2 text-[11px] text-amber-700">
                  Estas bajando el porcentaje. Explica el motivo en el detalle.
                </p>
              )}
            </div>
            <div className="border-t border-border/80 bg-background">
              <div className="px-3 pb-1 pt-2">
                <Label>
                  ¿Que avanzaste? {requireDescripcion && <span className="text-red-600">*</span>}
                </Label>
              </div>
              <RichTextEditor
                value={realizado}
                onChange={setRealizado}
                disabled={saving}
                placeholder="Ej.: Implemente el endpoint de facturas, agregue validaciones y probe con 20 casos. Puedes pegar imagenes o documentos."
                className="rounded-none border-0 shadow-none"
                uploadFile={async (file) => {
                  if (!refCod) return null;
                  if (!isAllowedEvidenciaFile(file) || file.size > EVIDENCIA_MAX_BYTES) return null;
                  const fd = new FormData();
                  if (esTicket) {
                    fd.set("Tic_Cod", String(refCod));
                    if (tarea?.Db_Origen) fd.set("Db_Origen", tarea.Db_Origen);
                  } else {
                    fd.set("Tar_Cod", String(refCod));
                  }
                  fd.append("files", file);
                  const up = await fetch("/api/evidencias", { method: "POST", body: fd });
                  const uj = await up.json();
                  const item = uj.adjuntos?.[0];
                  if (!up.ok || !uj.success || !item?.url) return null;
                  if (item.ruta) {
                    setRutasPegadas((prev) => (prev.includes(item.ruta) ? prev : [...prev, item.ruta]));
                  }
                  return { url: item.url, nombre: item.nombre || file.name, esImagen: !!item.esImagen };
                }}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Siguiente paso</Label>
              <Textarea
                rows={2}
                placeholder="Lo que harás a continuación"
                value={siguiente}
                onChange={(e) => setSiguiente(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Bloqueos / riesgos</Label>
              <Textarea
                rows={2}
                placeholder="Dependencias, dudas o impedimentos"
                value={bloqueos}
                onChange={(e) => setBloqueos(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <div className="space-y-2">
              <Label>Horas invertidas</Label>
              <Input
                type="number"
                min={0}
                max={24}
                step={0.25}
                placeholder="0"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label>Enlace de evidencia (commit, PR, documento...)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://..."
                  value={enlace}
                  onChange={(e) => setEnlace(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEnlace();
                    }
                  }}
                  disabled={saving}
                />
                <Button type="button" variant="outline" size="icon" onClick={addEnlace} disabled={saving}>
                  <Plus />
                </Button>
              </div>
            </div>
          </div>

          {enlaces.length > 0 && (
            <ul className="space-y-1">
              {enlaces.map((u) => (
                <li key={u} className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
                  <Link2 className="size-3.5 shrink-0 text-sky-600" />
                  <span className="min-w-0 flex-1 truncate">{u}</span>
                  <button type="button" onClick={() => setEnlaces((p) => p.filter((x) => x !== u))}>
                    <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <Label>Archivos de evidencia (máx. {MAX_FILES})</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 px-3 py-4 text-center text-xs text-muted-foreground transition hover:border-sky-300 hover:bg-sky-50/40"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(e.dataTransfer.files);
              }}
              onPaste={(e) => addFiles(e.clipboardData.files)}
              tabIndex={0}
            >
              <Paperclip className="size-4" />
              Arrastra, pega (Ctrl+V) o haz clic para adjuntar
              <span className="text-[10px]">{EVIDENCIA_HELP}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={EVIDENCIA_ACCEPT}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            {files.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-xs"
                  >
                    {previews[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[i]} alt="" className="size-8 rounded object-cover" />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded bg-muted">
                        <FileText className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {evidenciaLabel(f.name)} · {Math.ceil(f.size / 1024)} KB
                      </div>
                    </div>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                      <X className="size-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="success" onClick={() => void guardar()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar avance"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
