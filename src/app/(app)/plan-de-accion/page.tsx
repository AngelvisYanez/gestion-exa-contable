"use client";
import { useEffect, useState, type FormEvent } from "react";
import Topbar from "@/components/layout/Topbar";
type Project = "relavera" | "ofsercont";
type Mode = "plan" | "agent";
type Message = { role: "user" | "cursor"; text: string; mode?: Mode; prUrl?: string };
type Thread = { agentId: string; runId: string; url: string; messages: Message[]; busy: boolean };
const empty = (): Thread => ({ agentId: "", runId: "", url: "", messages: [], busy: false });
export default function PlanDeAccionPage() {
  const [project, setProject] = useState<Project>("relavera");
  const [threads, setThreads] = useState<Record<Project, Thread>>({ relavera: empty(), ofsercont: empty() });
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("plan");
  const [error, setError] = useState("");
  const thread = threads[project];
  useEffect(() => {
    if (!thread.busy || !thread.agentId || !thread.runId) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/config/floorplan/cursor?agentId=${encodeURIComponent(thread.agentId)}&runId=${encodeURIComponent(thread.runId)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "No se pudo consultar Cursor");
        if (!alive) return;
        if (["FINISHED", "ERROR", "CANCELLED", "EXPIRED"].includes(data.status)) {
          setThreads(prev => ({ ...prev, [project]: { ...prev[project], busy: false, messages: [...prev[project].messages, { role: "cursor", text: data.result || (data.status === "FINISHED" ? "Cursor terminó sin texto de respuesta." : `Cursor terminó con estado ${data.status}.`), prUrl: data.prUrl || undefined }] } }));
        }
      } catch (e) { if (alive) { setError(e instanceof Error ? e.message : "Error al consultar Cursor"); setThreads(prev => ({ ...prev, [project]: { ...prev[project], busy: false } })); } }
    };
    void poll(); const timer = setInterval(() => { void poll(); }, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [project, thread.busy, thread.agentId, thread.runId]);
  async function send(event: FormEvent) {
    event.preventDefault(); if (thread.busy || !question.trim()) return;
    const text = question.trim(); setQuestion(""); setError("");
    setThreads(prev => ({ ...prev, [project]: { ...prev[project], busy: true, messages: [...prev[project].messages, { role: "user", text, mode }] } }));
    try {
      const res = await fetch("/api/config/floorplan/cursor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, question: text, mode, agentId: thread.agentId || undefined }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "No se pudo enviar el mensaje");
      setThreads(prev => ({ ...prev, [project]: { ...prev[project], agentId: data.agentId, runId: data.runId, url: data.url } }));
    } catch (e) { setError(e instanceof Error ? e.message : "Error al enviar a Cursor"); setThreads(prev => ({ ...prev, [project]: { ...prev[project], busy: false } })); }
  }
  return <>
    <Topbar title="Plan de Acción" subtitle="Mapas y chat de proyectos" />
    <main className="flex h-[calc(100vh-6rem)] min-h-[38rem] flex-col gap-3 p-4">
      <div className="flex items-center gap-3"><label htmlFor="floorplan-project" className="font-semibold">Proyecto</label>
        <select id="floorplan-project" className="rounded border bg-background p-2" value={project} onChange={e => { setProject(e.target.value as Project); setQuestion(""); setError(""); }}><option value="relavera">EXA Relavera</option><option value="ofsercont">EXA Ofsercont</option></select>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <iframe key={project} title={`Mapa de EXA ${project}`} src={`/configuracion/floorplan/mapa?proyecto=${project}`} sandbox="allow-scripts allow-downloads" className="h-full min-h-[28rem] w-full rounded-lg border bg-background" />
        <section aria-label="Chat con Cursor" className="flex min-h-[24rem] flex-col rounded-lg border bg-background shadow-sm">
          <div className="border-b p-3"><h2 className="font-semibold">Chat con Cursor</h2><p className="text-xs text-muted-foreground">Consulta el mapa o pide una corrección del proyecto seleccionado.</p></div>
          <div aria-live="polite" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {thread.messages.length === 0 && <p className="text-muted-foreground">Escribe una pregunta para empezar.</p>}
            {thread.messages.map((m, i) => <div key={i} className={`rounded-lg p-3 ${m.role === "user" ? "bg-brand-red-subtle" : "bg-muted"}`}><div className="mb-1 text-xs font-semibold">{m.role === "user" ? (m.mode === "agent" ? "Corrección solicitada" : "Tu consulta") : "Cursor"}</div><p className="whitespace-pre-wrap break-words">{m.text}</p>{m.prUrl && <a href={m.prUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block font-semibold text-blue-700 underline">Revisar propuesta de cambio</a>}</div>)}
            {thread.busy && <p className="text-muted-foreground">Cursor está trabajando…</p>}
          </div>
          <form onSubmit={send} className="space-y-2 border-t p-3"><label htmlFor="cursor-mode" className="sr-only">Tipo de mensaje</label><select id="cursor-mode" value={mode} onChange={e => setMode(e.target.value as Mode)} className="w-full rounded border bg-background p-2 text-sm"><option value="plan">Consultar o planificar</option><option value="agent">Proponer corrección en una rama</option></select><label htmlFor="cursor-question" className="sr-only">Mensaje a Cursor</label><textarea id="cursor-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={4000} required rows={3} placeholder="Pregunta o describe la corrección…" className="w-full resize-y rounded border bg-background p-2 text-sm" />{mode === "agent" && <p className="text-xs text-muted-foreground">Cursor podrá modificar una rama y abrir una propuesta. No se fusionará ni desplegará automáticamente.</p>}{error && <p role="alert" className="text-xs text-red-600">{error}</p>}<button disabled={thread.busy} className="w-full rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">{thread.busy ? "Esperando a Cursor…" : "Enviar a Cursor"}</button>{thread.url && <a href={thread.url} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-blue-700 underline">Abrir conversación en Cursor</a>}</form>
        </section>
      </div>
    </main>
  </>;
}
