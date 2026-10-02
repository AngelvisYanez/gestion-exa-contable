"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Pencil, X } from "lucide-react";
import type { Tarea } from "@/components/dashboard/types";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useAuth } from "@/contexts/AuthContext";
import type { TareaDetalle } from "@/lib/tareas";
import {
  EVIDENCIA_ACCEPT,
  EVIDENCIA_HELP,
  EVIDENCIA_MAX_BYTES,
  evidenciaLabel,
  isAllowedEvidenciaFile,
} from "@/lib/evidencia-files";

const UPLOAD_BATCH = 20;

type EvidenciaItem = { ruta: string; url: string; nombre: string; esImagen: boolean };
type Asignable = { Per_Cod: number; Nombre: string };

type Props = {
  open: boolean;
  tarea: Tarea | null;
  detailUrl: (tarCod: number) => string;
  /** Extra body for /api/tareas (Ses_Dat_Dis, etc.) */
  extraBody?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function TareaEditDialog({ open, tarea, detailUrl, extraBody, onClose, onSaved }: Props) {
  const { db } = useAuth();
  const tarCod = tarea?.Tar_Cod ?? null;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("Media");
  const [complejidad, setComplejidad] = useState("Media");
  const [fechaFin, setFechaFin] = useState("");
  const [estado, setEstado] = useState("Pendiente");
  const [perCod, setPerCod] = useState("");
  const [asignables, setAsignables] = useState<Asignable[]>([]);
  const [evidencias, setEvidencias] = useState<EvidenciaItem[]>([]);
  const [nuevasFotos, setNuevasFotos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () =>
      nuevasFotos.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")),
    [nuevasFotos]
  );
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  useEffect(() => {
    if (!open || !tarCod) return;
    let cancel = false;
    setLoading(true);
    setError("");
    setNuevasFotos([]);
    Promise.all([
      fetch(detailUrl(tarCod)).then((r) => r.json()),
      fetch(
        `/api/devs?view=colaboradores&asignables=1&Ses_Dat_Dis=${encodeURIComponent(db || "")}`
      ).then((r) => r.json()),
    ])
      .then(([j, cols]) => {
        if (cancel) return;
        if (!j.success) throw new Error(j.message || "No se pudo cargar la tarea");
        const d = j as TareaDetalle;
        const t = d.tarea;
        setTitulo(t?.Tar_Titulo || tarea?.Tar_Titulo || "");
        setDescripcion(t?.Tar_Descripcion || tarea?.Tar_Descripcion || "");
        setPrioridad(t?.Tar_Prioridad || tarea?.Tar_Prioridad || "Media");
        setComplejidad(t?.Tar_Complejidad || tarea?.Tar_Complejidad || "Media");
        setFechaFin(String(t?.Tar_Fecha_Fin || tarea?.Tar_Fecha_Fin || "").slice(0, 10));
        setEstado(t?.Tar_Estado || tarea?.Tar_Estado || "Pendiente");
        setEvidencias(d.evidencias_iniciales || []);
        const first = d.asignados?.[0];
        setPerCod(first?.Per_Cod ? String(first.Per_Cod) : "");
        setAsignables(
          (cols.colaboradores || []).map((c: Asignable) => ({
            Per_Cod: c.Per_Cod,
            Nombre: c.Nombre,
          }))
        );
      })
      .catch((e) => !cancel && setError(e instanceof Error ? e.message : "Error"))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tarCod, db]);

  const addFotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...nuevasFotos];
    let rejected = false;
    for (const f of Array.from(list)) {
      if (f.size > EVIDENCIA_MAX_BYTES) {
        setError(`"${f.name}" supera ${Math.round(EVIDENCIA_MAX_BYTES / (1024 * 1024))} MB.`);
        rejected = true;
        continue;
      }
      if (!isAllowedEvidenciaFile(f)) {
        setError(`"${f.name}": formato no permitido.`);
        rejected = true;
        continue;
      }
      next.push(f);
    }
    if (!rejected) setError("");
    setNuevasFotos(next);
  };

  const guardar = async () => {
    if (!tarCod) return;
    if (!titulo.trim()) {
      setError("El titulo es obligatorio.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let adjuntos = evidencias.map((e) => e.ruta);

      if (nuevasFotos.length) {
        const nuevas: string[] = [];
        for (let i = 0; i < nuevasFotos.length; i += UPLOAD_BATCH) {
          const batch = nuevasFotos.slice(i, i + UPLOAD_BATCH);
          const fd = new FormData();
          fd.append("Tar_Cod", String(tarCod));
          for (const f of batch) fd.append("files", f);
          const up = await fetch("/api/evidencias", { method: "POST", body: fd });
          const uj = await up.json();
          if (!up.ok || !uj.success) throw new Error(uj.message || "No se pudieron subir las fotos");
          for (const a of uj.adjuntos || []) nuevas.push(a.ruta as string);
        }
        adjuntos = [...adjuntos, ...nuevas];
      }

      const res = await fetch("/api/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          ...(extraBody || {}),
          Tar_Cod: tarCod,
          titulo: titulo.trim(),
          descripcion,
          prioridad,
          complejidad,
          fechaFin: fechaFin || null,
          estado,
          adjuntos,
          perCodAsignar: perCod ? Number(perCod) : "",
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudo guardar");
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open && !!tarea}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Pencil className="size-4" />
            Editar tarea #{tarCod}
          </DialogTitle>
          <DialogDescription>
            Solo el encargado puede modificar titulo, descripcion, fechas, complejidad y evidencias.
          </DialogDescription>
        </DialogHeader>

        {error ? <Alert variant="destructive">{error}</Alert> : null}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={saving} />
            </div>
            <div className="space-y-2">
              <Label>Descripcion</Label>
              <RichTextEditor
                value={descripcion}
                onChange={setDescripcion}
                disabled={saving}
                placeholder="Describe la tarea con formato (negrita, listas, enlaces...)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} disabled={saving}>
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Complejidad</Label>
                <Select value={complejidad} onChange={(e) => setComplejidad(e.target.value)} disabled={saving}>
                  <option>Baja</option>
                  <option>Media</option>
                  <option>Alta</option>
                  <option>Muy alta</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <DatePicker
                  value={fechaFin}
                  onChange={setFechaFin}
                  disabled={saving}
                  allowClear
                  placeholder="Sin fecha limite"
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={estado} onChange={(e) => setEstado(e.target.value)} disabled={saving}>
                  <option>Pendiente</option>
                  <option>Asignado</option>
                  <option>En Proceso</option>
                  <option>Finalizada</option>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Asignado a</Label>
              <Select value={perCod} onChange={(e) => setPerCod(e.target.value)} disabled={saving}>
                <option value="">Sin asignar</option>
                {asignables.map((a) => (
                  <option key={a.Per_Cod} value={a.Per_Cod}>
                    {a.Nombre}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Si eliges una persona, el estado pasa a Asignado automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Adjuntos de descripcion</Label>
              {(evidencias.length > 0 || nuevasFotos.length > 0) && (
                <div className="grid grid-cols-3 gap-2">
                  {evidencias.map((e) => (
                    <div key={e.ruta} className="relative overflow-hidden rounded-lg border border-border/70">
                      {e.esImagen ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.url} alt={e.nombre} className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted p-2 text-center">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {evidenciaLabel(e.nombre)}
                          </span>
                          <span className="line-clamp-2 text-[10px] font-medium">{e.nombre}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                        disabled={saving}
                        onClick={() => setEvidencias((prev) => prev.filter((x) => x.ruta !== e.ruta))}
                        aria-label="Quitar evidencia"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {nuevasFotos.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="relative overflow-hidden rounded-lg border border-sky-300">
                      {previews[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previews[i]} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="flex aspect-square flex-col items-center justify-center gap-1 bg-muted p-2 text-center">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">
                            {evidenciaLabel(f.name)}
                          </span>
                          <span className="line-clamp-2 text-[10px] font-medium">{f.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                        disabled={saving}
                        onClick={() => setNuevasFotos((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Quitar archivo nuevo"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={EVIDENCIA_ACCEPT}
                multiple
                className="hidden"
                disabled={saving}
                onChange={(e) => {
                  addFotos(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" />
                Adjuntar archivos
                {evidencias.length + nuevasFotos.length > 0
                  ? ` (${evidencias.length + nuevasFotos.length})`
                  : ""}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Sin limite de cantidad · {EVIDENCIA_HELP}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={saving || loading}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar cambios"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
