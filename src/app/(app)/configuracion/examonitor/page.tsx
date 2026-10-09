"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/list-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CAPTURA_RETENCION_DIAS_MAX,
  CAPTURA_RETENCION_DIAS_MIN,
  CAPTURA_RETENCION_PRESETS,
  type CapturaRetencionPreset,
} from "@/lib/domain-constants";
import {
  DIAS_LABORALES,
  HORARIO_DEFAULT,
  ahoraGuayaquil,
  estaEnAlmuerzo,
  estaEnHorarioLaboral,
  normalizeDias,
} from "@/lib/monitoreo-horario-shared";
import { fmtFechaHoraZona } from "@/lib/timezone";

type Colab = {
  Per_Cod: number;
  Nombre: string;
  Cedula: string;
  Cargo: string;
  Mon_Activo: number;
  Mon_Intervalo_Minutos: number;
  Mon_Captura_Pantalla: number;
  Mon_Forzar_Bandeja?: number;
  Mon_Permitir_Salir?: number;
  Mon_Horario_Activo?: number;
  Mon_Hora_Inicio?: string;
  Mon_Hora_Fin?: string;
  Mon_Dias_Laborales?: string;
  Mon_Almuerzo_Activo?: number;
  Mon_Almuerzo_Inicio?: string;
  Mon_Almuerzo_Fin?: string;
  Mon_En_Horario?: number | null;
  Mon_En_Almuerzo?: number | null;
};

type GlobalConfig = {
  Cap_Retencion_Activa: number;
  Cap_Retencion_Preset: CapturaRetencionPreset;
  Cap_Retencion_Dias: number;
  Cap_Auto_Purga: number;
  Cap_Preservar_Asignaciones?: number;
  Cap_Post_Cierre_Dias?: number;
  Cap_Ultima_Purga: string | null;
  Cap_Ultimo_Resultado: string | null;
};

type DiskStats = {
  root: string;
  bytes: number;
  bytesLabel: string;
  files: number;
  dateFolders: number;
  oldestDate: string | null;
  newestDate: string | null;
};

function fmtWhen(iso: string | null) {
  if (!iso) return "Nunca";
  return fmtFechaHoraZona(iso, { dateStyle: "short", timeStyle: "short" });
}

function horarioOf(c: Colab) {
  return {
    Mon_Horario_Activo: Number(c.Mon_Horario_Activo ?? 0) ? 1 : 0,
    Mon_Hora_Inicio: c.Mon_Hora_Inicio || HORARIO_DEFAULT.Mon_Hora_Inicio,
    Mon_Hora_Fin: c.Mon_Hora_Fin || HORARIO_DEFAULT.Mon_Hora_Fin,
    Mon_Dias_Laborales: normalizeDias(c.Mon_Dias_Laborales),
    Mon_Almuerzo_Activo: Number(c.Mon_Almuerzo_Activo ?? 0) ? 1 : 0,
    Mon_Almuerzo_Inicio: c.Mon_Almuerzo_Inicio || HORARIO_DEFAULT.Mon_Almuerzo_Inicio,
    Mon_Almuerzo_Fin: c.Mon_Almuerzo_Fin || HORARIO_DEFAULT.Mon_Almuerzo_Fin,
  };
}

function toggleDia(dias: string, day: number) {
  const set = new Set(
    normalizeDias(dias)
      .split(",")
      .map(Number)
      .filter((n) => n >= 1 && n <= 7)
  );
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return normalizeDias([...set].join(","));
}

export default function ExaMonitorConfigPage() {
  const { db } = useAuth();
  const [rows, setRows] = useState<Colab[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [cfg, setCfg] = useState<GlobalConfig | null>(null);
  const [disk, setDisk] = useState<DiskStats | null>(null);
  const [preset, setPreset] = useState<CapturaRetencionPreset>("1m");
  const [customDias, setCustomDias] = useState(30);
  const [retencionActiva, setRetencionActiva] = useState(true);
  const [autoPurga, setAutoPurga] = useState(true);
  const [preservarAsig, setPreservarAsig] = useState(true);
  const [postCierreDias, setPostCierreDias] = useState(90);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [purging, setPurging] = useState(false);

  const [bulkIntervalo, setBulkIntervalo] = useState(5);
  const [bulkCaptura, setBulkCaptura] = useState(true);
  const [bulkBandeja, setBulkBandeja] = useState(true);
  const [bulkSalir, setBulkSalir] = useState(false);
  const [bulkActivo, setBulkActivo] = useState(true);
  const [bulkHorario, setBulkHorario] = useState(false);
  const [bulkInicio, setBulkInicio] = useState<string>(HORARIO_DEFAULT.Mon_Hora_Inicio);
  const [bulkFin, setBulkFin] = useState<string>(HORARIO_DEFAULT.Mon_Hora_Fin);
  const [bulkDias, setBulkDias] = useState<string>(HORARIO_DEFAULT.Mon_Dias_Laborales);
  const [bulkAlmuerzo, setBulkAlmuerzo] = useState(true);
  const [bulkAlmuerzoInicio, setBulkAlmuerzoInicio] = useState<string>(
    HORARIO_DEFAULT.Mon_Almuerzo_Inicio
  );
  const [bulkAlmuerzoFin, setBulkAlmuerzoFin] = useState<string>(
    HORARIO_DEFAULT.Mon_Almuerzo_Fin
  );
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [ahoraLabel, setAhoraLabel] = useState(() => ahoraGuayaquil().hhmm);

  useEffect(() => {
    const t = setInterval(() => setAhoraLabel(ahoraGuayaquil().hhmm), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadGlobal = useCallback(async () => {
    const res = await fetch(
      `/api/config/monitoreo?Ses_Dat_Dis=${encodeURIComponent(db)}`
    );
    const j = await res.json();
    if (!j.success) throw new Error(j.message || "No se pudo cargar retención");
    const c = j.config as GlobalConfig;
    setCfg(c);
    setPreset(c.Cap_Retencion_Preset);
    setCustomDias(c.Cap_Retencion_Dias);
    setRetencionActiva(!!c.Cap_Retencion_Activa);
    setAutoPurga(!!c.Cap_Auto_Purga);
    setPreservarAsig(c.Cap_Preservar_Asignaciones !== 0);
    setPostCierreDias(c.Cap_Post_Cierre_Dias ?? 90);
    setDisk(j.disk as DiskStats);
  }, [db]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [colsRes, devsRes] = await Promise.all([
        fetch(
          `/api/devs?view=colaboradores&Ses_Dat_Dis=${encodeURIComponent(db)}&q=${encodeURIComponent(q)}`
        ),
        fetch(`/api/devs?Ses_Dat_Dis=${encodeURIComponent(db)}`),
        loadGlobal(),
      ]);
      const colsJ = await colsRes.json();
      const devsJ = await devsRes.json();
      if (!colsJ.success) throw new Error(colsJ.message || "No se pudieron cargar colaboradores");

      const bandejaMap = new Map<
        number,
        {
          Mon_Forzar_Bandeja: number;
          Mon_Permitir_Salir: number;
          Mon_Captura_Pantalla: number;
          Mon_Horario_Activo: number;
          Mon_Hora_Inicio: string;
          Mon_Hora_Fin: string;
          Mon_Dias_Laborales: string;
          Mon_Almuerzo_Activo: number;
          Mon_Almuerzo_Inicio: string;
          Mon_Almuerzo_Fin: string;
          Mon_En_Horario: number | null;
          Mon_En_Almuerzo: number | null;
          Mon_Activo: number;
        }
      >();
      for (const d of (devsJ.desarrolladores || []) as Colab[]) {
        bandejaMap.set(d.Per_Cod, {
          Mon_Forzar_Bandeja: d.Mon_Forzar_Bandeja ?? 1,
          Mon_Permitir_Salir: d.Mon_Permitir_Salir ?? 0,
          Mon_Captura_Pantalla: d.Mon_Captura_Pantalla ?? 1,
          Mon_Horario_Activo: d.Mon_Horario_Activo ?? 0,
          Mon_Hora_Inicio: d.Mon_Hora_Inicio || HORARIO_DEFAULT.Mon_Hora_Inicio,
          Mon_Hora_Fin: d.Mon_Hora_Fin || HORARIO_DEFAULT.Mon_Hora_Fin,
          Mon_Dias_Laborales: normalizeDias(d.Mon_Dias_Laborales),
          Mon_Almuerzo_Activo: d.Mon_Almuerzo_Activo ?? 0,
          Mon_Almuerzo_Inicio: d.Mon_Almuerzo_Inicio || HORARIO_DEFAULT.Mon_Almuerzo_Inicio,
          Mon_Almuerzo_Fin: d.Mon_Almuerzo_Fin || HORARIO_DEFAULT.Mon_Almuerzo_Fin,
          Mon_En_Horario: d.Mon_En_Horario ?? null,
          Mon_En_Almuerzo: d.Mon_En_Almuerzo ?? null,
          Mon_Activo: d.Mon_Activo ?? 0,
        });
      }

      setRows(
        ((colsJ.colaboradores || []) as Colab[]).map((c) => {
          const fromDev = bandejaMap.get(c.Per_Cod);
          return {
            ...c,
            Mon_Activo: fromDev?.Mon_Activo ?? c.Mon_Activo ?? 0,
            Mon_Captura_Pantalla:
              fromDev?.Mon_Captura_Pantalla ?? c.Mon_Captura_Pantalla ?? 1,
            Mon_Forzar_Bandeja: fromDev?.Mon_Forzar_Bandeja ?? c.Mon_Forzar_Bandeja ?? 1,
            Mon_Permitir_Salir: fromDev?.Mon_Permitir_Salir ?? c.Mon_Permitir_Salir ?? 0,
            Mon_Horario_Activo: fromDev?.Mon_Horario_Activo ?? c.Mon_Horario_Activo ?? 0,
            Mon_Hora_Inicio:
              fromDev?.Mon_Hora_Inicio ?? c.Mon_Hora_Inicio ?? HORARIO_DEFAULT.Mon_Hora_Inicio,
            Mon_Hora_Fin: fromDev?.Mon_Hora_Fin ?? c.Mon_Hora_Fin ?? HORARIO_DEFAULT.Mon_Hora_Fin,
            Mon_Dias_Laborales: normalizeDias(
              fromDev?.Mon_Dias_Laborales ?? c.Mon_Dias_Laborales
            ),
            Mon_Almuerzo_Activo:
              fromDev?.Mon_Almuerzo_Activo ?? c.Mon_Almuerzo_Activo ?? 0,
            Mon_Almuerzo_Inicio:
              fromDev?.Mon_Almuerzo_Inicio ??
              c.Mon_Almuerzo_Inicio ??
              HORARIO_DEFAULT.Mon_Almuerzo_Inicio,
            Mon_Almuerzo_Fin:
              fromDev?.Mon_Almuerzo_Fin ??
              c.Mon_Almuerzo_Fin ??
              HORARIO_DEFAULT.Mon_Almuerzo_Fin,
            Mon_En_Horario: fromDev?.Mon_En_Horario ?? c.Mon_En_Horario ?? null,
            Mon_En_Almuerzo: fromDev?.Mon_En_Almuerzo ?? c.Mon_En_Almuerzo ?? null,
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [db, q, loadGlobal]);

  useEffect(() => {
    void load();
  }, [load]);

  const diasEfectivos = useMemo(() => {
    const found = CAPTURA_RETENCION_PRESETS.find((p) => p.id === preset);
    if (found?.dias != null) return found.dias;
    return Math.max(
      CAPTURA_RETENCION_DIAS_MIN,
      Math.min(CAPTURA_RETENCION_DIAS_MAX, customDias || 1)
    );
  }, [preset, customDias]);

  const save = async (c: Colab, patch: Partial<Colab>) => {
    setSaving(c.Per_Cod);
    setError("");
    setOkMsg("");
    try {
      const next = { ...c, ...patch };
      const h = horarioOf(next);
      const res = await fetch("/api/devs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Ses_Dat_Dis: db,
          Per_Cod: c.Per_Cod,
          Mon_Activo: next.Mon_Activo,
          Mon_Intervalo_Minutos: next.Mon_Intervalo_Minutos,
          Mon_Captura_Pantalla: next.Mon_Captura_Pantalla,
          Mon_Forzar_Bandeja: next.Mon_Forzar_Bandeja ?? 1,
          Mon_Permitir_Salir: next.Mon_Permitir_Salir ?? 0,
          Mon_Horario_Activo: h.Mon_Horario_Activo,
          Mon_Hora_Inicio: h.Mon_Hora_Inicio,
          Mon_Hora_Fin: h.Mon_Hora_Fin,
          Mon_Dias_Laborales: h.Mon_Dias_Laborales,
          Mon_Almuerzo_Activo: h.Mon_Almuerzo_Activo,
          Mon_Almuerzo_Inicio: h.Mon_Almuerzo_Inicio,
          Mon_Almuerzo_Fin: h.Mon_Almuerzo_Fin,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo guardar");
      const cfg = j.config || {};
      setRows((prev) =>
        prev.map((r) =>
          r.Per_Cod === c.Per_Cod
            ? {
                ...next,
                Mon_Activo: cfg.Mon_Activo ?? next.Mon_Activo,
                Mon_Horario_Activo: cfg.Mon_Horario_Activo ?? h.Mon_Horario_Activo,
                Mon_Hora_Inicio: cfg.Mon_Hora_Inicio ?? h.Mon_Hora_Inicio,
                Mon_Hora_Fin: cfg.Mon_Hora_Fin ?? h.Mon_Hora_Fin,
                Mon_Dias_Laborales: cfg.Mon_Dias_Laborales ?? h.Mon_Dias_Laborales,
                Mon_Almuerzo_Activo: cfg.Mon_Almuerzo_Activo ?? h.Mon_Almuerzo_Activo,
                Mon_Almuerzo_Inicio: cfg.Mon_Almuerzo_Inicio ?? h.Mon_Almuerzo_Inicio,
                Mon_Almuerzo_Fin: cfg.Mon_Almuerzo_Fin ?? h.Mon_Almuerzo_Fin,
                Mon_En_Horario: h.Mon_Horario_Activo
                  ? estaEnHorarioLaboral(h)
                    ? 1
                    : 0
                  : null,
                Mon_En_Almuerzo: h.Mon_Horario_Activo
                  ? estaEnAlmuerzo(h)
                    ? 1
                    : 0
                  : null,
              }
            : r
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };

  const saveRetencion = async (runPurgeNow = false) => {
    setSavingGlobal(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/config/monitoreo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Ses_Dat_Dis: db,
          action: "save",
          Cap_Retencion_Activa: retencionActiva ? 1 : 0,
          Cap_Retencion_Preset: preset,
          Cap_Retencion_Dias: diasEfectivos,
          Cap_Auto_Purga: autoPurga ? 1 : 0,
          Cap_Preservar_Asignaciones: preservarAsig ? 1 : 0,
          Cap_Post_Cierre_Dias: postCierreDias,
          runPurgeNow,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo guardar");
      setCfg(j.config);
      if (j.disk) setDisk(j.disk);
      if (j.purge) {
        setOkMsg(
          `Guardado. Purga: ${j.purge.disk.filesDeleted} archivos, ${j.purge.diskLabel || "0 B"} liberados.`
        );
      } else {
        setOkMsg("Política de retención guardada.");
      }
      await loadGlobal();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSavingGlobal(false);
    }
  };

  const runPurge = async () => {
    setPurging(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/config/monitoreo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Ses_Dat_Dis: db, action: "purge", force: true }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "Purga fallida");
      if (j.config) setCfg(j.config);
      if (j.statsAfter) setDisk({ ...j.statsAfter, bytesLabel: j.statsAfter.bytesLabel });
      setOkMsg(
        `Purga lista: ${j.disk?.filesDeleted ?? 0} archivos · ${j.diskLabel || "0 B"} · carpetas ${
          j.disk?.foldersDeleted?.length ?? 0
        }`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setPurging(false);
    }
  };

  const toggleSelect = (perCod: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(perCod)) next.delete(perCod);
      else next.add(perCod);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.Per_Cod)));
  };

  const applyBulk = async () => {
    if (!selected.size) {
      setError("Selecciona colaboradores para aplicar en lote.");
      return;
    }
    setApplyingBulk(true);
    setError("");
    setOkMsg("");
    try {
      const res = await fetch("/api/config/monitoreo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Ses_Dat_Dis: db,
          action: "bulk",
          Per_Cods: Array.from(selected),
          Mon_Activo: bulkActivo ? 1 : 0,
          Mon_Intervalo_Minutos: bulkIntervalo,
          Mon_Captura_Pantalla: bulkCaptura ? 1 : 0,
          Mon_Forzar_Bandeja: bulkBandeja ? 1 : 0,
          Mon_Permitir_Salir: bulkSalir ? 1 : 0,
          Mon_Horario_Activo: bulkHorario ? 1 : 0,
          Mon_Hora_Inicio: bulkInicio,
          Mon_Hora_Fin: bulkFin,
          Mon_Dias_Laborales: bulkDias,
          Mon_Almuerzo_Activo: bulkHorario && bulkAlmuerzo ? 1 : 0,
          Mon_Almuerzo_Inicio: bulkAlmuerzoInicio,
          Mon_Almuerzo_Fin: bulkAlmuerzoFin,
        }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo aplicar");
      setOkMsg(`Políticas aplicadas a ${j.updated} colaborador(es).`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setApplyingBulk(false);
    }
  };

  const activos = rows.filter((r) => r.Mon_Activo).length;

  return (
    <>
      <Topbar title="Config. ExaMonitor" subtitle="Administracion" />
      <main className="mx-auto w-full min-w-0 max-w-[1400px] animate-fade-in space-y-5 px-4 py-6 sm:px-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="size-4" />
                Retención de screenshots
              </CardTitle>
              <CardDescription>
                Regla: las capturas ligadas a una tarea o ticket se conservan para el historial del
                admin (evaluar tiempo y trabajo en la asignacion). Solo se borran capturas huerfanas
                (sin asignacion) segun el plazo abajo. No elimina evidencias de avances.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={retencionActiva}
                    onCheckedChange={setRetencionActiva}
                    disabled={savingGlobal}
                  />
                  <Label>Retencion activa</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={autoPurga}
                    onCheckedChange={setAutoPurga}
                    disabled={savingGlobal || !retencionActiva}
                  />
                  <Label>Auto-purga (cada ~6 h via agente)</Label>
                </div>
              </div>

              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={preservarAsig}
                    onCheckedChange={setPreservarAsig}
                    disabled={savingGlobal}
                  />
                  <Label>Preservar capturas de tareas y tickets</Label>
                </div>
                <p className="text-xs text-sky-900/80">
                  Mientras el colaborador seleccione la tarea/ticket en ExaMonitor, las capturas
                  quedan vinculadas y el admin puede revisarlas por rango de fechas en el detalle.
                </p>
                {preservarAsig && (
                  <div className="flex max-w-sm flex-wrap items-end gap-2">
                    <div className="flex-1">
                      <Label htmlFor="post-cierre">Dias tras cierre (0 = indefinido)</Label>
                      <Input
                        id="post-cierre"
                        type="number"
                        min={0}
                        max={730}
                        value={postCierreDias}
                        onChange={(e) => setPostCierreDias(Number(e.target.value) || 0)}
                        disabled={savingGlobal}
                      />
                    </div>
                    <span className="pb-2 text-xs text-muted-foreground">
                      Tras finalizar/cerrar, se conservan {postCierreDias || "sin limite"} dia(s)
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-2 block">Borrar capturas huerfanas mas antiguas que</Label>
                <div className="flex flex-wrap gap-2">
                  {CAPTURA_RETENCION_PRESETS.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={preset === p.id ? "default" : "secondary"}
                      disabled={savingGlobal || !retencionActiva}
                      onClick={() => {
                        setPreset(p.id);
                        if (p.dias != null) setCustomDias(p.dias);
                      }}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              {preset === "custom" && (
                <div className="flex max-w-xs items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="custom-dias">Días personalizados</Label>
                    <Input
                      id="custom-dias"
                      type="number"
                      min={CAPTURA_RETENCION_DIAS_MIN}
                      max={CAPTURA_RETENCION_DIAS_MAX}
                      value={customDias}
                      onChange={(e) => setCustomDias(Number(e.target.value) || 1)}
                      disabled={savingGlobal || !retencionActiva}
                    />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">
                    ({CAPTURA_RETENCION_DIAS_MIN}–{CAPTURA_RETENCION_DIAS_MAX})
                  </span>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Efectivo: se conservan los últimos <strong className="text-foreground">{diasEfectivos}</strong>{" "}
                día(s). Última purga: {fmtWhen(cfg?.Cap_Ultima_Purga ?? null)}
                {cfg?.Cap_Ultimo_Resultado ? ` · ${cfg.Cap_Ultimo_Resultado}` : ""}
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void saveRetencion(false)}
                  disabled={savingGlobal}
                >
                  {savingGlobal ? <Loader2 className="animate-spin" /> : null}
                  Guardar política
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void saveRetencion(true)}
                  disabled={savingGlobal || !retencionActiva}
                >
                  Guardar y purgar ahora
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void runPurge()}
                  disabled={purging}
                >
                  {purging ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  Ejecutar purga
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Uso en disco</CardTitle>
              <CardDescription>Solo carpetas de capturas por fecha</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="info">{disk?.bytesLabel ?? "—"}</Badge>
                <Badge variant="muted">{disk?.files ?? 0} archivos</Badge>
                <Badge variant="muted">{disk?.dateFolders ?? 0} días</Badge>
              </div>
              <p className="text-muted-foreground">
                Rango: {disk?.oldestDate || "—"} → {disk?.newestDate || "—"}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={disk?.root}>
                {disk?.root || "…"}
              </p>
              <div className="pt-2">
                <Badge variant="success">{activos} monitoreo activo</Badge>{" "}
                <Badge variant="muted">{rows.length} colaboradores</Badge>{" "}
                <Badge variant="info">BD {db}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Aplicar políticas en lote
            </CardTitle>
            <CardDescription>
              Selecciona colaboradores en la tabla y aplica las mismas opciones de golpe.
              Horario en hora de Guayaquil (ahora {ahoraLabel}). Incluye pausa de almuerzo
              (1 h) que apaga el monitoreo dentro de la jornada.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div>
              <Label>Monitoreo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Switch
                  checked={bulkActivo}
                  onCheckedChange={setBulkActivo}
                  disabled={bulkHorario}
                />
                <span className="text-xs">{bulkHorario ? "Auto" : bulkActivo ? "Activo" : "Off"}</span>
              </div>
            </div>
            <div>
              <Label>Intervalo</Label>
              <Select
                className="mt-1 h-9 w-[100px]"
                value={String(bulkIntervalo)}
                onChange={(e) => setBulkIntervalo(Number(e.target.value))}
              >
                {[1, 2, 5, 10, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Captura</Label>
              <div className="mt-1">
                <Switch checked={bulkCaptura} onCheckedChange={setBulkCaptura} />
              </div>
            </div>
            <div>
              <Label>Forzar bandeja</Label>
              <div className="mt-1">
                <Switch checked={bulkBandeja} onCheckedChange={setBulkBandeja} />
              </div>
            </div>
            <div>
              <Label>Permitir salir</Label>
              <div className="mt-1">
                <Switch checked={bulkSalir} onCheckedChange={setBulkSalir} />
              </div>
            </div>
            <div>
              <Label>Horario auto</Label>
              <div className="mt-1 flex items-center gap-2">
                <Switch checked={bulkHorario} onCheckedChange={setBulkHorario} />
                <span className="text-xs">{bulkHorario ? "On" : "Off"}</span>
              </div>
            </div>
            <div>
              <Label>Desde</Label>
              <Input
                type="time"
                className="mt-1 h-9 w-[110px]"
                value={bulkInicio}
                onChange={(e) => setBulkInicio(e.target.value)}
                disabled={!bulkHorario}
              />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input
                type="time"
                className="mt-1 h-9 w-[110px]"
                value={bulkFin}
                onChange={(e) => setBulkFin(e.target.value)}
                disabled={!bulkHorario}
              />
            </div>
            <div>
              <Label>Días</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {DIAS_LABORALES.map((d) => {
                  const on = normalizeDias(bulkDias)
                    .split(",")
                    .map(Number)
                    .includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      title={d.title}
                      disabled={!bulkHorario}
                      onClick={() => setBulkDias(toggleDia(bulkDias, d.id))}
                      className={
                        "size-7 rounded text-xs font-semibold " +
                        (on
                          ? "bg-sky-600 text-white"
                          : "bg-muted text-muted-foreground") +
                        (bulkHorario ? "" : " opacity-50")
                      }
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Pausa almuerzo</Label>
              <div className="mt-1 flex items-center gap-2">
                <Switch
                  checked={bulkAlmuerzo}
                  onCheckedChange={setBulkAlmuerzo}
                  disabled={!bulkHorario}
                />
                <span className="text-xs">{bulkAlmuerzo ? "1 h off" : "Off"}</span>
              </div>
            </div>
            <div>
              <Label>Almuerzo desde</Label>
              <Input
                type="time"
                className="mt-1 h-9 w-[110px]"
                value={bulkAlmuerzoInicio}
                onChange={(e) => setBulkAlmuerzoInicio(e.target.value)}
                disabled={!bulkHorario || !bulkAlmuerzo}
              />
            </div>
            <div>
              <Label>Almuerzo hasta</Label>
              <Input
                type="time"
                className="mt-1 h-9 w-[110px]"
                value={bulkAlmuerzoFin}
                onChange={(e) => setBulkAlmuerzoFin(e.target.value)}
                disabled={!bulkHorario || !bulkAlmuerzo}
              />
            </div>
            <Button
              type="button"
              onClick={() => void applyBulk()}
              disabled={applyingBulk || !selected.size}
            >
              {applyingBulk ? <Loader2 className="animate-spin" /> : null}
              Aplicar a {selected.size || 0}
            </Button>
          </CardContent>
        </Card>

        <FilterBar>
          <div className="relative w-full min-w-0 sm:w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 min-h-0 pl-9 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o cedula..."
            />
          </div>
          <Button type="button" variant="secondary" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Actualizar
          </Button>
        </FilterBar>

        {error && <Alert variant="destructive">{error}</Alert>}
        {okMsg && <Alert variant="success">{okMsg}</Alert>}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-muted [&_th]:text-muted-foreground">
              <TableRow className="border-border hover:bg-muted">
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll}
                    aria-label="Seleccionar todos"
                  />
                </TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Monitoreo</TableHead>
                <TableHead className="min-w-[220px]">
                  Horario laboral (GYE {ahoraLabel})
                </TableHead>
                <TableHead>Intervalo</TableHead>
                <TableHead>Captura</TableHead>
                <TableHead>Forzar bandeja</TableHead>
                <TableHead>Permitir salir</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const h = horarioOf(c);
                const enAlmuerzo = h.Mon_Horario_Activo ? estaEnAlmuerzo(h) : false;
                const enHorario = h.Mon_Horario_Activo ? estaEnHorarioLaboral(h) : null;
                return (
                <TableRow key={c.Per_Cod}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(c.Per_Cod)}
                      onChange={() => toggleSelect(c.Per_Cod)}
                      aria-label={`Seleccionar ${c.Nombre}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold">{c.Nombre || "Sin nombre en ficha"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[c.Cedula && `Cédula ${c.Cedula}`, c.Cargo].filter(Boolean).join(" · ") ||
                        "Sin datos de ficha"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!c.Mon_Activo}
                          onCheckedChange={(v) => void save(c, { Mon_Activo: v ? 1 : 0 })}
                          disabled={saving === c.Per_Cod || !!h.Mon_Horario_Activo}
                        />
                        <span className="text-xs font-semibold">
                          {h.Mon_Horario_Activo
                            ? c.Mon_Activo
                              ? "En horario"
                              : enAlmuerzo
                                ? "Almuerzo"
                                : "Fuera"
                            : c.Mon_Activo
                              ? "Activo"
                              : "Off"}
                        </span>
                      </div>
                      {h.Mon_Horario_Activo ? (
                        <span className="text-[10px] text-muted-foreground">
                          Auto ·{" "}
                          {enAlmuerzo
                            ? "pausa almuerzo"
                            : enHorario
                              ? "dentro de jornada"
                              : "fuera de jornada"}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2 py-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!h.Mon_Horario_Activo}
                          onCheckedChange={(v) =>
                            void save(c, {
                              Mon_Horario_Activo: v ? 1 : 0,
                              ...(v && !c.Mon_Almuerzo_Activo
                                ? {
                                    Mon_Almuerzo_Activo: 1,
                                    Mon_Almuerzo_Inicio: HORARIO_DEFAULT.Mon_Almuerzo_Inicio,
                                    Mon_Almuerzo_Fin: HORARIO_DEFAULT.Mon_Almuerzo_Fin,
                                  }
                                : {}),
                            })
                          }
                          disabled={saving === c.Per_Cod}
                        />
                        <span className="text-xs font-medium">
                          {h.Mon_Horario_Activo ? "Automático" : "Manual"}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Input
                          type="time"
                          className="h-8 w-[104px] text-xs"
                          value={h.Mon_Hora_Inicio}
                          disabled={saving === c.Per_Cod || !h.Mon_Horario_Activo}
                          onChange={(e) =>
                            void save(c, { Mon_Hora_Inicio: e.target.value })
                          }
                        />
                        <span className="text-xs text-muted-foreground">→</span>
                        <Input
                          type="time"
                          className="h-8 w-[104px] text-xs"
                          value={h.Mon_Hora_Fin}
                          disabled={saving === c.Per_Cod || !h.Mon_Horario_Activo}
                          onChange={(e) => void save(c, { Mon_Hora_Fin: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {DIAS_LABORALES.map((d) => {
                          const on = h.Mon_Dias_Laborales.split(",").map(Number).includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              title={d.title}
                              disabled={saving === c.Per_Cod || !h.Mon_Horario_Activo}
                              onClick={() =>
                                void save(c, {
                                  Mon_Dias_Laborales: toggleDia(h.Mon_Dias_Laborales, d.id),
                                })
                              }
                              className={
                                "size-6 rounded text-[10px] font-semibold " +
                                (on
                                  ? "bg-sky-600 text-white"
                                  : "bg-muted text-muted-foreground") +
                                (h.Mon_Horario_Activo ? "" : " opacity-40")
                              }
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="rounded-md border border-amber-200/80 bg-amber-50/50 px-2 py-1.5 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!!h.Mon_Almuerzo_Activo}
                            onCheckedChange={(v) =>
                              void save(c, { Mon_Almuerzo_Activo: v ? 1 : 0 })
                            }
                            disabled={saving === c.Per_Cod || !h.Mon_Horario_Activo}
                          />
                          <span className="text-[11px] font-semibold text-amber-900">
                            Almuerzo (inactivo)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Input
                            type="time"
                            className="h-7 w-[104px] text-xs"
                            value={h.Mon_Almuerzo_Inicio}
                            disabled={
                              saving === c.Per_Cod ||
                              !h.Mon_Horario_Activo ||
                              !h.Mon_Almuerzo_Activo
                            }
                            onChange={(e) =>
                              void save(c, { Mon_Almuerzo_Inicio: e.target.value })
                            }
                          />
                          <span className="text-xs text-muted-foreground">→</span>
                          <Input
                            type="time"
                            className="h-7 w-[104px] text-xs"
                            value={h.Mon_Almuerzo_Fin}
                            disabled={
                              saving === c.Per_Cod ||
                              !h.Mon_Horario_Activo ||
                              !h.Mon_Almuerzo_Activo
                            }
                            onChange={(e) =>
                              void save(c, { Mon_Almuerzo_Fin: e.target.value })
                            }
                          />
                        </div>
                        <p className="text-[10px] leading-snug text-amber-900/70">
                          Por defecto 13:00–14:00 (1 h). En esa ventana el monitoreo se apaga.
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={String(c.Mon_Intervalo_Minutos)}
                      onChange={(e) =>
                        void save(c, { Mon_Intervalo_Minutos: Number(e.target.value) })
                      }
                      className="h-8 w-[90px] text-xs"
                      disabled={saving === c.Per_Cod}
                    >
                      {[1, 2, 5, 10, 15, 30, 60].map((n) => (
                        <option key={n} value={n}>
                          {n} min
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!!c.Mon_Captura_Pantalla}
                      onCheckedChange={(v) =>
                        void save(c, { Mon_Captura_Pantalla: v ? 1 : 0 })
                      }
                      disabled={saving === c.Per_Cod}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!!(c.Mon_Forzar_Bandeja ?? 1)}
                      onCheckedChange={(v) =>
                        void save(c, { Mon_Forzar_Bandeja: v ? 1 : 0 })
                      }
                      disabled={saving === c.Per_Cod}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={!!c.Mon_Permitir_Salir}
                      onCheckedChange={(v) =>
                        void save(c, { Mon_Permitir_Salir: v ? 1 : 0 })
                      }
                      disabled={saving === c.Per_Cod}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {saving === c.Per_Cod ? (
                      <Loader2 className="ml-auto size-4 animate-spin text-muted-foreground" />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                    Sin colaboradores en esta BD.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </>
  );
}
