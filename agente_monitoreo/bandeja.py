# -*- coding: utf-8 -*-
"""Filtro de la bandeja de ExaMonitor, sin depender de Flet."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta


def plazo_tarea(inicio: str | None, fin: str | None, estado: str = "") -> str:
    """Misma regla de plazo que Gestión: 0, hasta 6, o más días."""
    if estado in ("Pausada", "Standby"):
        return "Standby"
    try:
        dias = (date.fromisoformat(str(fin)[:10]) - date.fromisoformat(str(inicio)[:10])).days
    except (TypeError, ValueError):
        return "Sin fechas"
    if dias <= 0:
        return "Diaria"
    if dias <= 6:
        return "Semanal"
    return "Mensual"


def fecha_fin_para_plazo(inicio: str, plazo: str) -> str:
    """Fecha fin de Gestión: hoy, +6 días o mismo día del mes siguiente."""
    base = date.fromisoformat(inicio)
    if plazo == "Diaria":
        fin = base
    elif plazo == "Semanal":
        fin = base + timedelta(days=6)
    elif plazo == "Mensual":
        anio = base.year + (base.month // 12)
        mes = base.month % 12 + 1
        fin = date(anio, mes, min(base.day, monthrange(anio, mes)[1]))
    else:
        raise ValueError("Plazo inválido")
    return fin.isoformat()


def visible_trabajos(tasks, *, es_mesa: bool, bandeja: str, tipo_filtro: str,
                     es_encargado: bool = False, estado_filtro: str = "todos",
                     plazo_filtro: str = "todos") -> list:
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
    elif bandeja == "libres":
        items = [t for t in items if t.get("por_asignar") and not t.get("creada_por_mi")]
    else:
        items = [t for t in items if not t.get("creada_por_mi") and not t.get("por_asignar")]
    if tipo_filtro == "tarea":
        items = [t for t in items if t.get("tipo") != "ticket"]
    elif tipo_filtro == "ticket":
        items = [t for t in items if t.get("tipo") == "ticket"]
    if es_encargado and estado_filtro != "todos":
        items = [t for t in items if str(t.get("Tar_Estado") or "") == estado_filtro]
    if plazo_filtro != "todos":
        items = [t for t in items if t.get("tipo") != "ticket" and
                 plazo_tarea(t.get("Tar_Fecha_Inicio"), t.get("Tar_Fecha_Fin"),
                             t.get("Tar_Estado") or "") == plazo_filtro]
    return items


def trabajos_activos(tasks, *, es_mesa: bool = False) -> list:
    """Telemetría: una tarea del equipo no equivale a una asignación personal."""
    return [t for t in (tasks or []) if not t.get("por_asignar")
            and (not es_mesa or t.get("asignada_a_mi"))]
