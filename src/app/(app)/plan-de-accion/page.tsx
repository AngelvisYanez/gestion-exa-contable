"use client";
import { useState, type FormEvent } from "react";
import Topbar from "@/components/layout/Topbar";
type Project = "relavera" | "ofsercont";
export default function PlanDeAccionPage() {
  const [project, setProject] = useState<Project>("relavera");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  async function ask(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(""); setUrl("");
    try {
      const response = await fetch("/api/config/floorplan/cursor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, question }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setUrl(data.url);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar Cursor"); }
    finally { setBusy(false); }
  }
  return <>
    <Topbar title="Plan de Acción" subtitle="Mapa de proyectos" />
    <main className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="floorplan-project" className="font-semibold">Proyecto</label>
        <select id="floorplan-project" className="rounded border bg-background p-2" value={project} onChange={e => { setProject(e.target.value as Project); setQuestion(""); setError(""); setUrl(""); }}>
          <option value="relavera">EXA Relavera</option><option value="ofsercont">EXA Ofsercont</option>
        </select>
      </div>
      <form onSubmit={ask} className="flex flex-wrap items-center gap-2">
        <label htmlFor="floorplan-question" className="sr-only">Pregunta sobre el proyecto</label>
        <input id="floorplan-question" className="min-w-60 flex-1 rounded border bg-background p-2" value={question} onChange={e => setQuestion(e.target.value)} maxLength={4000} required placeholder="¿Qué partes intervienen en este proceso?" />
        <button className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50" disabled={busy}>{busy ? "Iniciando consulta…" : "Preguntar a Cursor"}</button>
      </form>
      <p className="text-xs text-muted-foreground">Cursor consultará el repositorio del proyecto elegido. La respuesta se abre en Cursor.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 underline">Abrir respuesta en Cursor</a>}
      <iframe key={project} title={`Mapa interactivo de ${project === "relavera" ? "EXA Relavera" : "EXA Ofsercont"}`} src={`/configuracion/floorplan/mapa?proyecto=${project}`} sandbox="allow-scripts allow-downloads" className="h-[78vh] w-full rounded-lg border" />
    </main>
  </>;
}
