"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Link2, Loader2, Paperclip, Plus, Ticket, X } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";

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
  const { db } = useAuth();
  const esTicket = tarea?.tipo === "ticket";
  const apoyoDb = typeof extraBody?.Ses_Dat_Dis === "string"
    ? extraBody.Ses_Dat_Dis
    : typeof extraBody?.project === "string" ? extraBody.project : db || "";
  const ticketsVinculados = (!esTicket && tarea?.Tickets_Vinculados) || [];
  const refCod = esTicket ? (tarea?.Tic_Cod ?? tarea?.Tar_Cod ?? null) : (tarea?.Tar_Cod ?? null);
  const tarCod = refCod;
  const [base, setBase] = useState(tarea?.Ava_Porcentaje || 0);
  const [pct, setPct] = useState(base);
  const [realizado, setRealizado] = useState("");
  const [siguiente, setSiguiente] = useState("");
  const [bloqueos, setBloqueos] = useState("");
  const [standby, setStandby] = useState("");
  const [horas, setHoras] = useState("");
  const [apoyoPerCod, setApoyoPerCod] = useState("");
  const [apoyoError, setApoyoError] = useState("");
  const [asignables, setAsignables] = useState<Array<{ Per_Cod: number; Nombre: string }>>([]);
  const [loadingApoyos, setLoadingApoyos] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [enlaces, setEnlaces] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [rutasPegadas, setRutasPegadas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  /** Tickets que la tarea afiliada cerró al llegar al 100%. */
  const [ticketsCerrados, setTicketsCerrados] = useState<Array<{ Tic_Cod: number; Db: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const pastedRoutesRef = useRef<Set<string>>(new Set());
  const reservedUploadsRef = useRef(0);

  useEffect(() => {
    if (!tarea) return;
    setBase(tarea.Ava_Porcentaje || 0);
    setPct(tarea.Ava_Porcentaje || 0);
    setRealizado("");
    setSiguiente("");
    setBloqueos("");
    setStandby("");
    setHoras("");
    setEnlace("");
    setEnlaces([]);
    setFiles([]);
    setRutasPegadas([]);
    setError("");
    setSaving(false);
    setPendingUploads(0);
    setTicketsCerrados([]);
    pastedRoutesRef.current.clear();
    reservedUploadsRef.current = 0;
    // Solo reiniciar al abrir otra tarea; recargas de la lista no deben borrar lo escrito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarCod]);

  useEffect(() => {
    if (!tarea || esTicket) return;
    let cancelled = false;
    const apoyoInicial = tarea.Tar_Apoyo_Per_Cod ? String(tarea.Tar_Apoyo_Per_Cod) : "";
    setApoyoPerCod(apoyoInicial);
    setApoyoError("");
    setAsignables([]);
    setLoadingApoyos(true);
    fetch(`/api/devs?view=colaboradores&asignables=1&Ses_Dat_Dis=${encodeURIComponent(apoyoDb)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "No se pudo cargar el equipo.");
        return data.colaboradores as Array<{ Per_Cod: number; Nombre: string }>;
      })
      .then((rows) => {
        if (cancelled) return;
        setAsignables(rows);
        if (apoyoInicial && !rows.some((a) => String(a.Per_Cod) === apoyoInicial)) setApoyoPerCod("");
      })
      .catch((err) => {
        if (cancelled) return;
        // El apoyo es opcional: si no se lista el equipo, el avance se guarda igual.
        setApoyoPerCod("");
        setApoyoError(
          err instanceof Error
            ? `${err.message} Puedes registrar el avance sin indicar el apoyo.`
            : "No se pudo cargar el equipo. Puedes registrar el avance sin indicar el apoyo."
        );
      })
      .finally(() => { if (!cancelled) setLoadingApoyos(false); });
    return () => { cancelled = true; };
    // Se carga al abrir otra tarea; las recargas de la lista no borran la selección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarCod, esTicket, apoyoDb]);

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
      if (next.length + pastedRoutesRef.current.size + reservedUploadsRef.current >= MAX_FILES) {
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
    if (pendingUploads > 0) {
      setError("Espera a que terminen de adjuntarse los archivos pegados.");
      return;
    }
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
          standby: !esTicket ? standby : undefined,
          horas: horas ? Number(horas.replace(",", ".")) : null,
          apoyoPerCod: !esTicket && apoyoPerCod ? Number(apoyoPerCod) : undefined,
          enlaces: allLinks,
          adjuntos,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.message || "No se pudo guardar el avance");
      const cerrados: Array<{ Tic_Cod: number; Db: string }> = Array.isArray(j.tickets_resueltos)
        ? j.tickets_resueltos
        : [];
      await onSaved();
      if (!esTicket && cerrados.length) {
        // Tarea al 100% con ticket afiliado: mostrar el cierre antes de cerrar.
        setTicketsCerrados(cerrados);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!tarea} onOpenChange={(o) => !o && !saving && pendingUploads === 0 && onClose()}>
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
          {ticketsCerrados.length > 0 && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="flex items-center gap-2 font-bold text-emerald-800">
                <CheckCircle2 className="size-4" />
                Tarea al 100%: avance registrado.
              </p>
              <ul className="mt-2 space-y-1.5 text-xs">
                {ticketsCerrados.map((r) => (
                  <li key={`${r.Db}-${r.Tic_Cod}`} className="flex flex-wrap items-center gap-1.5">
                    <Ticket className="size-3.5 shrink-0 text-emerald-700" />
                    <Link
                      href={`/tickets?detalle=${r.Tic_Cod}&db=${encodeURIComponent(r.Db || "exa")}`}
                      className="font-bold underline underline-offset-2 hover:text-emerald-700"
                    >
                      Ticket #{r.Tic_Cod}
                    </Link>
                    quedó <strong className="font-bold">Cerrado</strong>.
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-emerald-800/90">
                El ticket permanece enlazado a esta tarea desde su detalle.
              </p>
            </div>
          )}
          {esTicket && pct === 100 && (
            <Alert variant="warning">
              Al guardar este avance al 100%, el ticket quedará resuelto y se podrá notificar al cliente.
            </Alert>
          )}
          {!esTicket &&
            pct >= 100 &&
            !ticketsCerrados.length &&
            ticketsVinculados.length > 0 && (
              <Alert variant="warning">
                {ticketsVinculados.length === 1
                  ? `Al guardar este avance al 100%, el ticket #${ticketsVinculados[0].Tic_Cod} vinculado quedará cerrado.`
                  : "Al guardar este avance al 100%, los tickets vinculados a esta tarea quedarán cerrados."}
              </Alert>
            )}

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
                  if (!isAllowedEvidenciaFile(file)) throw new Error(`"${file.name}": formato no permitido.`);
                  if (file.size > EVIDENCIA_MAX_BYTES) throw new Error(`"${file.name}" supera 12 MB.`);
                  if (files.length + pastedRoutesRef.current.size + reservedUploadsRef.current >= MAX_FILES) {
                    throw new Error(`Máximo ${MAX_FILES} archivos por avance.`);
                  }
                  reservedUploadsRef.current += 1;
                  try {
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
                    if (!up.ok || !uj.success || !item?.url || !item?.ruta) throw new Error(uj.message || `No se pudo adjuntar ${file.name}.`);
                    pastedRoutesRef.current.add(item.ruta);
                    setRutasPegadas((prev) => (prev.includes(item.ruta) ? prev : [...prev, item.ruta]));
                    return { url: item.url, nombre: item.nombre || file.name, esImagen: !!item.esImagen };
                  } finally {
                    reservedUploadsRef.current -= 1;
                  }
                }}
                onUploadStateChange={setPendingUploads}
                onUploadError={setError}
              />
            </div>
          </div>

          {!esTicket && (
            <div className="space-y-2">
              <Label htmlFor="avance-apoyo">¿Quién ayudó en este avance? (opcional)</Label>
              <Select
                id="avance-apoyo"
                value={apoyoPerCod}
                onChange={(e) => setApoyoPerCod(e.target.value)}
                disabled={saving || loadingApoyos}
              >
                <option value="">Nadie más</option>
                {asignables.map((a) => (
                  <option key={a.Per_Cod} value={a.Per_Cod}>{a.Nombre}</option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Se guardará con este avance, aunque luego cambie el apoyo de la tarea.
              </p>
              {apoyoError && (
                <p className="text-[11px] text-amber-700">{apoyoError}</p>
              )}
            </div>
          )}

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

          {!esTicket && (
            <div className="space-y-2">
              <Label htmlFor="avance-standby">
                ¿La tarea quedó en standby por feedback o validación pendiente? (opcional)
              </Label>
              <Textarea
                id="avance-standby"
                rows={2}
                placeholder="Ej.: Falta la validación del cliente del reporte para poder continuar."
                value={standby}
                onChange={(e) => setStandby(e.target.value)}
                disabled={saving}
              />
              {standby.trim() && pct < 100 && (
                <div className="space-y-1 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                  <p className="text-xs font-medium text-violet-900">
                    La tarea pasa a estado Standby
                  </p>
                  <p className="text-[11px] text-violet-900/80">
                    Se queda <strong>sin fecha de fin</strong> mientras espera el feedback
                    {tarea?.Tar_Fecha_Fin
                      ? ` (plazo actual ${String(tarea.Tar_Fecha_Fin).slice(0, 10)})`
                      : ""}
                    . El plazo anterior queda registrado en el avance.
                  </p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Queda registrado como parte del avance. La tarea no cambia de plazo: solo se marca
                en standby y espera un nuevo avance para reanudarse.
              </p>
            </div>
          )}

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
          {ticketsCerrados.length > 0 ? (
            <Button type="button" variant="success" onClick={onClose}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving || pendingUploads > 0}>
                Cancelar
              </Button>
              <Button type="button" variant="success" onClick={() => void guardar()} disabled={saving || pendingUploads > 0}>
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  pendingUploads > 0 ? `Adjuntando ${pendingUploads} archivo(s)...` : "Guardar avance"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
