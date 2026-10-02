"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Settings2,
  Users,
  XCircle,
} from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { useAuth } from "@/contexts/AuthContext";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
  DEFAULT_NOTIF_PREFS,
  NOTIF_EVENT_OPTIONS,
  loadNotifPrefs,
  saveNotifPrefs,
  type NotifPrefs,
} from "@/lib/notif-prefs";

type TeamMemberRow = {
  name: string;
  role: "manager" | "developer";
  linked: boolean;
  Per_Cod: number | null;
  Nombre_BD: string | null;
  Cedula: string | null;
  Cargo: string | null;
  Mon_Activo: number | null;
};

type GeneralPayload = {
  db: string;
  empresa: {
    empCod: number;
    empNom: string;
    sucDes: string;
    sucCod: number;
    datDis: string;
  };
  projects: Array<{
    id: string;
    name: string;
    dbDis: string;
    description: string;
  }>;
  databases: string[];
  team: {
    managers: TeamMemberRow[];
    developers: TeamMemberRow[];
    linked: number;
    total: number;
  };
  sistema: {
    timezone: string;
    locale: string;
    utcOffset: string;
    telemetriaRetencionDias: number;
    capturesDir: string | null;
    errorLog: string | null;
    estadosTarea: string[];
    prioridades: string[];
    estadosTicket: Record<string, string>;
  };
};

function roleLabel(role: string) {
  return role === "manager" ? "Encargado" : "Desarrollador";
}

export default function ConfiguracionGeneralPage() {
  const { db } = useAuth();
  const [data, setData] = useState<GeneralPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [desktopPerm, setDesktopPerm] = useState<NotificationPermission | "unsupported">(
    "default"
  );
  const [savedFlash, setSavedFlash] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/config/general?Ses_Dat_Dis=${encodeURIComponent(db)}`);
      const j = await res.json();
      if (!j.success) throw new Error(j.message || "No se pudo cargar");
      setData(j as GeneralPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPrefs(loadNotifPrefs());
    if (typeof window === "undefined" || !("Notification" in window)) {
      setDesktopPerm("unsupported");
    } else {
      setDesktopPerm(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  const persistPrefs = (next: NotifPrefs) => {
    setPrefs(next);
    saveNotifPrefs(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  };

  const requestDesktop = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setDesktopPerm(result);
    if (result === "granted") {
      persistPrefs({ ...prefs, desktop: true });
    }
  };

  return (
    <>
      <Topbar title="Config. general" subtitle="Administracion" />
      <main className="mx-auto w-full min-w-0 max-w-5xl animate-fade-in space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-brand-gray-600">
              Proyecto operativo, equipo autorizado, notificaciones y parametros del panel.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Actualizar
          </Button>
        </div>

        {error && <Alert variant="destructive">{error}</Alert>}
        {savedFlash && (
          <Alert variant="success" className="border-emerald-200 bg-emerald-50 text-emerald-800">
            Preferencias de notificaciones guardadas en este navegador.
          </Alert>
        )}

        {/* Proyecto / empresa */}
        <Card id="proyecto">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red text-white">
              <Building2 className="size-5" />
            </div>
            <CardTitle>Proyecto y empresa</CardTitle>
            <CardDescription>
              Alcance fijo del panel de tareas (Emp_Cod MATRIZ). El selector de BD del topbar
              afecta monitores auxiliares; las tareas viven en la BD operativa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && !data ? (
              <div className="flex items-center gap-2 text-sm text-brand-gray-500">
                <Loader2 className="size-4 animate-spin" /> Cargando…
              </div>
            ) : data ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetaTile label="Empresa" value={data.empresa.empNom} />
                  <MetaTile label="Sucursal" value={data.empresa.sucDes} />
                  <MetaTile label="Emp_Cod" value={String(data.empresa.empCod)} />
                  <MetaTile
                    label="BD operativa"
                    value={`${data.empresa.datDis} (Suc ${data.empresa.sucCod})`}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wide text-brand-gray-500">
                    Proyectos configurados
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.projects.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg border border-brand-gray-200 bg-brand-gray-50/60 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-brand-gray-900">
                            {p.name}
                          </span>
                          <Badge variant="secondary">{p.dbDis}</Badge>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-brand-gray-600">
                          {p.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-brand-gray-500">
                  Bases permitidas en .env: {data.databases.join(", ") || "—"}. Consulta actual:{" "}
                  <span className="font-semibold text-brand-gray-700">{data.db}</span>
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Equipo */}
        <Card id="equipo">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red text-white">
              <Users className="size-5" />
            </div>
            <CardTitle>Equipo autorizado</CardTitle>
            <CardDescription>
              Solo estos perfiles pueden recibir tareas/tickets. El vinculo se resuelve por nombre
              contra personal Emp_Cod={data?.empresa.empCod ?? 96}.
              {data && (
                <>
                  {" "}
                  Vinculados:{" "}
                  <strong>
                    {data.team.linked}/{data.team.total}
                  </strong>
                  .
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {data && (
              <>
                <TeamTable title="Encargados" rows={data.team.managers} />
                <TeamTable title="Desarrolladores" rows={data.team.developers} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Notificaciones */}
        <Card id="notificaciones">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red text-white">
              <Bell className="size-5" />
            </div>
            <CardTitle>Notificaciones</CardTitle>
            <CardDescription>
              Preferencias de este navegador (SSE en tiempo real). No se sincronizan entre
              dispositivos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  desktopPerm === "granted"
                    ? "success"
                    : desktopPerm === "denied"
                      ? "danger"
                      : "muted"
                }
              >
                Escritorio:{" "}
                {desktopPerm === "unsupported"
                  ? "no soportado"
                  : desktopPerm === "granted"
                    ? "permitido"
                    : desktopPerm === "denied"
                      ? "bloqueado"
                      : "pendiente"}
              </Badge>
              {desktopPerm !== "granted" && desktopPerm !== "unsupported" && (
                <Button type="button" size="sm" variant="outline" onClick={() => void requestDesktop()}>
                  Solicitar permiso
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PrefSwitch
                label="Toasts en pantalla"
                description="Banner inferior derecho al llegar un evento"
                checked={prefs.toast}
                onChange={(v) => persistPrefs({ ...prefs, toast: v })}
              />
              <PrefSwitch
                label="Notificacion de escritorio"
                description="Solo asignaciones (tarea / ticket)"
                checked={prefs.desktop}
                onChange={(v) => persistPrefs({ ...prefs, desktop: v })}
              />
              <PrefSwitch
                label="Sonido (reservado)"
                description="Proximamente; el switch queda listo"
                checked={prefs.sound}
                onChange={(v) => persistPrefs({ ...prefs, sound: v })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wide text-brand-gray-500">
                Tipos de evento
              </Label>
              <div className="divide-y divide-brand-gray-100 rounded-lg border border-brand-gray-200">
                {NOTIF_EVENT_OPTIONS.map((opt) => (
                  <div
                    key={opt.type}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-gray-900">{opt.label}</p>
                      <p className="text-[11px] text-brand-gray-500">{opt.description}</p>
                    </div>
                    <Switch
                      checked={prefs.types[opt.type] !== false}
                      onCheckedChange={(v) =>
                        persistPrefs({
                          ...prefs,
                          types: { ...prefs.types, [opt.type]: v },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sistema / dominio */}
        <Card id="sistema">
          <CardHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-red text-white">
              <Settings2 className="size-5" />
            </div>
            <CardTitle>Sistema y dominio</CardTitle>
            <CardDescription>
              Zona horaria operativa, retencion sugerida y catalogos usados en filtros/validacion.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetaTile
                    label="Zona horaria"
                    value={`${data.sistema.timezone} (${data.sistema.utcOffset})`}
                  />
                  <MetaTile label="Locale" value={data.sistema.locale} />
                  <MetaTile
                    label="Retencion telemetria"
                    value={`${data.sistema.telemetriaRetencionDias} dias`}
                  />
                  <MetaTile
                    label="Capturas (CAPTURES_DIR)"
                    value={data.sistema.capturesDir || "por defecto del servidor"}
                  />
                  <MetaTile
                    label="Log errores EXA"
                    value={data.sistema.errorLog || "EXA_ERROR_LOG no definido"}
                  />
                  <MetaTile
                    label="Screenshots"
                    value="Config. ExaMonitor"
                    hint="Retencion y purga en /configuracion/examonitor"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <CatalogBlock title="Estados de tarea" items={[...data.sistema.estadosTarea]} />
                  <CatalogBlock title="Prioridades" items={[...data.sistema.prioridades]} />
                  <CatalogBlock
                    title="Estados de ticket"
                    items={Object.entries(data.sistema.estadosTicket).map(
                      ([code, label]) => `${code} → ${label}`
                    )}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function MetaTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-brand-gray-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-brand-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-brand-gray-500">{hint}</p>}
    </div>
  );
}

function PrefSwitch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-brand-gray-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-brand-gray-900">{label}</p>
        <p className="text-[11px] text-brand-gray-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TeamTable({ title, rows }: { title: string; rows: TeamMemberRow[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-gray-500">{title}</p>
      <div className="overflow-hidden rounded-lg border border-brand-gray-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Miembro</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Ficha EXA</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>
                  <div className="font-semibold text-brand-gray-900">{r.name}</div>
                  {r.Nombre_BD && r.Nombre_BD !== r.name && (
                    <div className="text-[10px] text-brand-gray-500">BD: {r.Nombre_BD}</div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={r.role === "manager" ? "info" : "secondary"}>
                    {roleLabel(r.role)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-brand-gray-700">
                  {r.linked ? (
                    <>
                      Per_Cod {r.Per_Cod}
                      {r.Cedula ? ` · ${r.Cedula}` : ""}
                      {r.Cargo ? (
                        <span className="block text-[10px] text-brand-gray-500">{r.Cargo}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-brand-gray-400">Sin ficha vinculada</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.linked ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="size-3.5" /> Vinculado
                      {r.Mon_Activo ? (
                        <Badge variant="success" className="ml-1">
                          Monitoreo
                        </Badge>
                      ) : null}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <XCircle className="size-3.5" /> Pendiente
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CatalogBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-brand-gray-200 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-brand-gray-500">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {items.map((it) => (
          <Badge key={it} variant="muted">
            {it}
          </Badge>
        ))}
      </div>
    </div>
  );
}
