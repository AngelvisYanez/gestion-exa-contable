"use client";

import { useAuth } from "@/contexts/AuthContext";
import { hasRolePermission } from "@/lib/auth/role-permissions";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Plus } from "lucide-react";
import Topbar from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CAPACITACION_PROYECTOS, nombreProyectoCapacitacion } from "@/lib/capacitaciones-proyectos";

type Training = { Cap_Cod: number; Cap_Titulo: string; Cap_Empresa: string; Cap_Cliente: string; Cap_Proyecto: string; Cap_Responsable_Per_Cod: number; Cap_Responsable_Nombre: string; Cap_Inicio: string; Cap_Duracion_Min: number; Cap_Estado: string; Cap_Finalizada: string | null };
type Member = { Per_Cod: number; Nombre: string };
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatDate = (value: string) => new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function CapacitacionesPage() {
  const { user } = useAuth();
  // Elegir responsable y finalizar depende del permiso, no del rol.
  const isManager = hasRolePermission(user, "capacitaciones.gestionar");
  const projectOptions = CAPACITACION_PROYECTOS;
  const [items, setItems] = useState<Training[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [project, setProject] = useState("");
  const [responsablePerCod, setResponsablePerCod] = useState("");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [form, setForm] = useState({ titulo: "", empresa: "", cliente: "", inicio: "", duracionMin: "60" });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!project) setProject(CAPACITACION_PROYECTOS[0].id); }, [project]);
  useEffect(() => {
    if (!project || !isManager || !showForm) return;
    let active = true;
    setMembers([]); setResponsablePerCod("");
    fetch(`/api/capacitaciones?view=miembros&proyecto=${encodeURIComponent(project)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message); return j; })
      .then((j) => { if (active) setMembers(j.miembros || []); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "No se pudo cargar el equipo."); });
    return () => { active = false; };
  }, [project, isManager, showForm]);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/capacitaciones", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "No se pudo cargar el calendario.");
      setItems(data.items);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Error de conexión."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const byDay = useMemo(() => {
    const map = new Map<string, Training[]>();
    for (const item of items) {
      const key = dateKey(new Date(item.Cap_Inicio));
      map.set(key, [...(map.get(key) || []), item]);
    }
    return map;
  }, [items]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = Array.from({ length: Math.ceil((offset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
  const selectedItems = byDay.get(selected) || [];

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/capacitaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, proyecto: project, responsablePerCod: Number(responsablePerCod), inicio: new Date(form.inicio).toISOString(), duracionMin: Number(form.duracionMin) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setShowForm(false); setForm({ titulo: "", empresa: "", cliente: "", inicio: "", duracionMin: "60" });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  }

  async function finish(id: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/capacitaciones", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo finalizar."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6 p-4 md:p-6">
    <Topbar title="Calendario de capacitaciones" />
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={!user} onClick={() => { setForm((v) => ({ ...v, inicio: `${selected}T09:00` })); setShowForm(!showForm); }}><Plus className="mr-2 size-4" />Nueva capacitación</Button>
      <Button variant="outline" asChild><a href="/api/capacitaciones?format=ics"><Download className="mr-2 size-4" />Exportar calendario actualizado</a></Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {showForm && <form onSubmit={save} className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="proyecto">Proyecto</Label><Select id="proyecto" required value={project} onChange={(e) => setProject(e.target.value)}><option value="">Selecciona un proyecto</option>{projectOptions.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></div>
      {isManager ? <div className="space-y-1"><Label htmlFor="responsable">Quién hace la capacitación</Label><Select id="responsable" required value={responsablePerCod} onChange={(e) => setResponsablePerCod(e.target.value)}><option value="">Selecciona un miembro</option>{members.map((m) => <option key={m.Per_Cod} value={m.Per_Cod}>{m.Nombre}</option>)}</Select></div> : <div className="space-y-1"><Label>Responsable</Label><p className="text-sm">{user?.name} (se asigna al guardar)</p></div>}
      <div className="space-y-1"><Label htmlFor="titulo">Capacitación</Label><Input id="titulo" required maxLength={255} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="empresa">Empresa</Label><Input id="empresa" required maxLength={180} value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="cliente">Cliente</Label><Input id="cliente" required maxLength={180} value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="inicio">Fecha y hora</Label><Input id="inicio" type="datetime-local" required value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="duracion">Duración en minutos</Label><Input id="duracion" type="number" min="1" max="10080" required value={form.duracionMin} onChange={(e) => setForm({ ...form, duracionMin: e.target.value })} /></div>
      <div className="flex items-end"><Button disabled={busy} type="submit">{busy ? "Guardando…" : "Guardar capacitación"}</Button></div>
    </form>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="rounded-xl border bg-card p-3 md:p-5" aria-label="Calendario mensual">
        <div className="mb-4 flex items-center justify-between"><Button variant="ghost" size="icon" aria-label="Mes anterior" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></Button><h2 className="font-semibold capitalize">{new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric" }).format(month)}</h2><Button variant="ghost" size="icon" aria-label="Mes siguiente" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></Button></div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">{["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="mt-2 grid grid-cols-7 gap-1">{days.map((day) => { const key = dateKey(day); const count = byDay.get(key)?.length || 0; return <button key={key} type="button" onClick={() => setSelected(key)} className={`min-h-16 rounded-md border p-1 text-left text-sm hover:bg-accent ${key === selected ? "border-primary bg-accent" : ""} ${day.getMonth() !== month.getMonth() ? "text-muted-foreground opacity-50" : ""}`}><span>{day.getDate()}</span>{count > 0 && <span className="mt-1 block rounded bg-primary/15 px-1 text-xs text-primary">{count} sesión{count > 1 ? "es" : ""}</span>}</button>; })}</div>
      </section>
      <section className="rounded-xl border bg-card p-4"><h2 className="mb-4 flex items-center gap-2 font-semibold"><CalendarDays className="size-4" />{new Intl.DateTimeFormat("es-VE", { dateStyle: "long" }).format(new Date(`${selected}T12:00:00`))}</h2>{selectedItems.length === 0 ? <p className="text-sm text-muted-foreground">Sin capacitaciones este día.</p> : <div className="space-y-3">{selectedItems.map((item) => <article key={item.Cap_Cod} className="rounded-lg border p-3 text-sm"><h3 className="font-semibold">{item.Cap_Titulo}</h3><p>{nombreProyectoCapacitacion(item.Cap_Proyecto)} · {item.Cap_Responsable_Nombre || "Sin responsable"}</p><p>{item.Cap_Empresa} · {item.Cap_Cliente}</p><p className="text-muted-foreground">{formatDate(item.Cap_Inicio)} · {item.Cap_Duracion_Min} min</p><p className="mt-1 font-medium">{item.Cap_Estado}</p>{isManager && item.Cap_Estado === "Programada" && <Button className="mt-2" size="sm" variant="outline" disabled={busy} onClick={() => void finish(item.Cap_Cod)}>Finalizar</Button>}</article>)}</div>}</section>
    </div>
  </div>;
}
