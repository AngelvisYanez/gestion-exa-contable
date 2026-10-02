"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { OfsercontModulo } from "@/lib/brief/catalog";

export type AlcanceOfsercont = {
  modulo: string;
  proceso: string;
  directorio: string;
};

type Props = {
  db: string;
  value: AlcanceOfsercont;
  onChange: (next: AlcanceOfsercont) => void;
  idPrefix?: string;
};

function norm(s: string) {
  return s.trim().toLocaleLowerCase("es");
}

export function OfsercontAlcanceFields({ db, value, onChange, idPrefix = "alcance" }: Props) {
  const [modulos, setModulos] = useState<OfsercontModulo[] | null>(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("");
  const [moduloId, setModuloId] = useState("");
  const [procesoId, setProcesoId] = useState("");

  useEffect(() => {
    let cancel = false;
    setError("");
    void (async () => {
      try {
        const res = await fetch(
          `/api/tareas?catalogo=ofsercont&Ses_Dat_Dis=${encodeURIComponent(db)}`
        );
        const j = await res.json();
        if (!j.success) throw new Error(j.message || "No se pudo cargar el menú");
        if (!cancel) setModulos(Array.isArray(j.modulos) ? j.modulos : []);
      } catch (e) {
        if (!cancel) {
          setModulos([]);
          setError(e instanceof Error ? e.message : "No se pudo cargar el menú");
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [db]);

  useEffect(() => {
    if (!modulos?.length) return;
    const mod =
      modulos.find((m) => norm(m.nombre) === norm(value.modulo)) ||
      modulos.find((m) => norm(m.nombre) === norm(value.proceso));
    setModuloId(mod ? String(mod.id) : "");
    if (!mod) {
      setProcesoId("");
      return;
    }
    const proc =
      mod.procesos.find((p) => norm(p.nombre) === norm(value.proceso)) ||
      mod.procesos.find((p) => norm(p.nombre) === norm(value.modulo));
    setProcesoId(proc ? String(proc.id) : "");
  }, [modulos, value.modulo, value.proceso]);

  const modulo = modulos?.find((m) => String(m.id) === moduloId) || null;
  const procesos = modulo?.procesos || [];
  const filtroNorm = norm(filtro);
  const visibles = useMemo(() => {
    if (!filtroNorm) return procesos;
    return procesos.filter(
      (p) => norm(p.nombre).includes(filtroNorm) || norm(p.grupo).includes(filtroNorm)
    );
  }, [procesos, filtroNorm]);

  const grupos = useMemo(() => {
    const map = new Map<string, typeof visibles>();
    for (const p of visibles) {
      const list = map.get(p.grupo) || [];
      list.push(p);
      map.set(p.grupo, list);
    }
    return [...map.entries()];
  }, [visibles]);

  const elegirModulo = (id: string) => {
    setModuloId(id);
    setProcesoId("");
    setFiltro("");
    const mod = modulos?.find((m) => String(m.id) === id);
    onChange({
      modulo: mod?.nombre || "",
      proceso: "",
      directorio: "",
    });
  };

  const elegirProceso = (id: string) => {
    setProcesoId(id);
    const proc = procesos.find((p) => String(p.id) === id);
    onChange({
      modulo: modulo?.nombre || value.modulo,
      proceso: proc?.nombre || "",
      directorio: proc?.directorio || "",
    });
  };

  if (modulos === null) {
    return <p className="text-xs text-muted-foreground">Cargando módulos y procesos del sistema…</p>;
  }

  if (!modulos.length) {
    return (
      <p className="text-xs text-destructive">
        {error || "No hay módulos activos en el menú de OFSERCONT."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-modulo`}>Módulo</Label>
        <Select
          id={`${idPrefix}-modulo`}
          value={moduloId}
          onChange={(e) => elegirModulo(e.target.value)}
        >
          <option value="">Selecciona un módulo</option>
          {modulos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} ({m.procesos.length})
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-proceso`}>Proceso</Label>
        <Input
          id={`${idPrefix}-filtro`}
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={modulo ? "Filtrar procesos de este módulo" : "Elige primero un módulo"}
          disabled={!modulo}
        />
        <Select
          id={`${idPrefix}-proceso`}
          value={procesoId}
          onChange={(e) => elegirProceso(e.target.value)}
          disabled={!modulo}
        >
          <option value="">
            {modulo
              ? visibles.length
                ? "Selecciona un proceso"
                : "Ningún proceso coincide con el filtro"
              : "Selecciona un módulo"}
          </option>
          {grupos.map(([grupo, items]) => (
            <optgroup key={grupo} label={grupo}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        {modulo && (
          <p className="text-[11px] text-muted-foreground">
            {visibles.length} de {procesos.length} procesos en {modulo.nombre}.
          </p>
        )}
      </div>
    </div>
  );
}
