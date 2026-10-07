# -*- coding: utf-8 -*-
"""Filtro de la bandeja de ExaMonitor, sin depender de Flet."""
from __future__ import annotations


def visible_trabajos(tasks, *, es_mesa: bool, bandeja: str, tipo_filtro: str) -> list:
    """Encargado y atención filtran por pestaña. El desarrollador ignora esa pestaña."""
    items = list(tasks or [])
    if es_mesa:
        if bandeja == "asignar":
            items = [t for t in items if t.get("por_asignar")]
        else:
            items = [t for t in items if not t.get("por_asignar")]
    if tipo_filtro == "tarea":
        items = [t for t in items if t.get("tipo") != "ticket"]
    elif tipo_filtro == "ticket":
        items = [t for t in items if t.get("tipo") == "ticket"]
    return items


def trabajos_activos(tasks) -> list:
    """Telemetría: solo lo asignado a la persona, no la cola por asignar."""
    return [t for t in (tasks or []) if not t.get("por_asignar")]
