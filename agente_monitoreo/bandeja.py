# -*- coding: utf-8 -*-
"""Filtro de la bandeja de ExaMonitor, sin depender de Flet."""
from __future__ import annotations


def visible_trabajos(tasks, *, es_mesa: bool, bandeja: str, tipo_filtro: str,
                     es_encargado: bool = False, estado_filtro: str = "todos") -> list:
    """El encargado consulta el equipo; atención conserva su bandeja de asignación."""
    items = list(tasks or [])
    if es_encargado:
        if bandeja == "asignar":
            items = [t for t in items if t.get("por_asignar")]
    elif es_mesa:
        if bandeja == "asignar":
            items = [t for t in items if t.get("por_asignar")]
        else:
            items = [t for t in items if not t.get("por_asignar")]
    elif bandeja == "creadas":
        items = [t for t in items if t.get("creada_por_mi")]
    else:
        items = [t for t in items if not t.get("creada_por_mi")]
    if tipo_filtro == "tarea":
        items = [t for t in items if t.get("tipo") != "ticket"]
    elif tipo_filtro == "ticket":
        items = [t for t in items if t.get("tipo") == "ticket"]
    if es_encargado and estado_filtro != "todos":
        items = [t for t in items if str(t.get("Tar_Estado") or "") == estado_filtro]
    return items


def trabajos_activos(tasks, *, es_mesa: bool = False) -> list:
    """Telemetría: una tarea del equipo no equivale a una asignación personal."""
    return [t for t in (tasks or []) if not t.get("por_asignar")
            and (not es_mesa or t.get("asignada_a_mi"))]
