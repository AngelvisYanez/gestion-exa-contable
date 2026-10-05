# -*- coding: utf-8 -*-
"""
ExaMonitor - Flet UI alineada al panel EXA Tareas.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

import flet as ft
import requests
import screen_capture  # noqa: F401  (PyInstaller debe empaquetar la captura)

from win_shell import (
    consume_input_counts,
    ensure_windows_autostart,
    foreground_window,
    idle_seconds,
    start_input_counter,
)

AGENT_VERSION = "2.7.1-flet"

# Tokens alineados a globals.css / Badge del dashboard EXA
C = {
    "bg": "#f5f5f3",
    "card": "#ffffff",
    "border": "#dbdbd7",
    "border_soft": "#e8e8e4",
    "text": "#1a1a18",
    "text_muted": "#666663",
    "text_soft": "#5c5c5a",
    "primary": "#9e2525",
    "primary_hover": "#b83030",
    "header_dark": "#000000",
    "muted_bg": "#eeeee9",
    "success_bg": "#d1fae5",
    "success_fg": "#065f46",
    "info_bg": "#e0f2fe",
    "info_fg": "#075985",
    "warn_bg": "#fef3c7",
    "warn_fg": "#92400e",
    "danger_bg": "#fee2e2",
    "danger_fg": "#991b1b",
    "muted_badge_bg": "#f1f5f9",
    "muted_badge_fg": "#334155",
    "ticket_bg": "#fef3c7",
    "ticket_fg": "#92400e",
    "tarea_bg": "#e0f2fe",
    "tarea_fg": "#075985",
    "sky_hover": "#f0f9ff",
}

SERVIDOR_FIJO = "https://gestion.exacontable.com"

DEFAULT_CONFIG = {
    "server_url": SERVIDOR_FIJO,
    "api_path": "/api/monitoreo",
    "db_dis": "exa",
    "identificador": "",
    "cedula": "",
    "poll_interval_seconds": 10,
    "auto_minimize": True,
    "default_interval_minutes": 5,
}


def config_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent / "config.json"
    return Path(__file__).resolve().parent / "config.json"


def build_api_url(server: str, api_path: str | None) -> str:
    server = (server or "").rstrip("/")
    path = api_path or "/api/monitoreo"
    if not path.startswith("/"):
        path = "/" + path
    return server + path


def get_mac() -> str:
    try:
        node = uuid.getnode()
        return ":".join(f"{(node >> ele) & 0xFF:02X}" for ele in range(40, -1, -8))
    except Exception:
        return ""


def estado_style(estado: str) -> tuple[str, str]:
    # Igual que estadoVariant() del dashboard
    m = {
        "Finalizada": (C["success_bg"], C["success_fg"]),
        "En Proceso": (C["info_bg"], C["info_fg"]),
        "Asignado": (C["muted_bg"], C["text"]),
        "Pendiente": (C["muted_badge_bg"], C["muted_badge_fg"]),
        "Por asignar": (C["warn_bg"], C["warn_fg"]),
        "Pausada": (C["warn_bg"], C["warn_fg"]),
        "Resuelto": (C["success_bg"], C["success_fg"]),
    }
    return m.get(estado or "", (C["muted_badge_bg"], C["muted_badge_fg"]))


def prioridad_style(prioridad: str) -> tuple[str, str]:
    # Igual que prioridadVariant()
    if prioridad == "Alta":
        return C["danger_bg"], C["danger_fg"]
    if prioridad == "Baja":
        return C["muted_badge_bg"], C["muted_badge_fg"]
    return C["warn_bg"], C["warn_fg"]


def complejidad_style(complejidad: str) -> tuple[str, str]:
    c = (complejidad or "").strip()
    if c in ("Muy alta", "Alta"):
        return C["danger_bg"], C["danger_fg"]
    if c == "Baja":
        return C["muted_badge_bg"], C["muted_badge_fg"]
    return C["info_bg"], C["info_fg"]


def plain_text(html: str | None) -> str:
    if not html:
        return ""
    t = re.sub(r"(?is)<br\s*/?>", "\n", str(html))
    t = re.sub(r"(?is)<[^>]+>", " ", t)
    t = (
        t.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
    )
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", t)).strip()


def badge(text: str, bg: str, fg: str) -> ft.Container:
    return ft.Container(
        content=ft.Text(text, size=10, weight=ft.FontWeight.W_700, color=fg),
        bgcolor=bg,
        padding=ft.Padding.symmetric(horizontal=7, vertical=3),
        border_radius=6,
    )


def section_label(text: str) -> ft.Text:
    return ft.Text(
        text.upper(),
        size=11,
        weight=ft.FontWeight.W_700,
        color=C["text_muted"],
    )


def meta_row(icon, label: str, value: str | None) -> ft.Control | None:
    v = (value or "").strip()
    if not v or v == "-":
        return None
    return ft.Row(
        [
            ft.Icon(icon, size=16, color=C["text_muted"]),
            ft.Text(f"{label}:", size=12, color=C["text_muted"]),
            ft.Text(v, size=12, weight=ft.FontWeight.W_700, color=C["text"], selectable=True, expand=True),
        ],
        spacing=8,
        vertical_alignment=ft.CrossAxisAlignment.START,
    )


def info_card(*rows: ft.Control) -> ft.Container:
    return ft.Container(
        content=ft.Column(list(rows), spacing=8, tight=True),
        bgcolor=C["card"],
        border=ft.Border.all(1, C["border"]),
        border_radius=12,
        padding=14,
    )


def evidencia_tipo(nombre: str) -> str:
    ext = nombre.rsplit(".", 1)[-1].lower() if "." in (nombre or "") else ""
    return {
        "pdf": "PDF",
        "md": "Markdown",
        "txt": "Texto",
        "csv": "CSV",
        "doc": "Word",
        "docx": "Word",
        "xls": "Excel",
        "xlsx": "Excel",
        "png": "Imagen",
        "jpg": "Imagen",
        "jpeg": "Imagen",
        "webp": "Imagen",
        "gif": "Imagen",
    }.get(ext, ext.upper() or "Archivo")


EVIDENCIA_EXTS = {
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "csv",
    "txt",
    "md",
}


def safe_filename(nombre: str) -> str:
    base = Path(nombre or "evidencia").name
    base = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", base).strip(" .") or "evidencia"
    return base[:140]


def desc_box(text: str) -> ft.Container:
    return ft.Container(
        content=ft.Text(
            text or "Sin descripción.",
            size=13,
            color=C["text"],
            selectable=True,
        ),
        bgcolor=C["muted_bg"],
        border_radius=12,
        padding=14,
    )


class ExaMonitorApp:
    def __init__(self, page: ft.Page):
        self.page = page
        self.config = dict(DEFAULT_CONFIG)
        self.load_config()
        self.mac_address = get_mac()
        self.dev_data: dict = {}
        self.tasks_list: list = []
        self.is_authenticated = False
        self.running = True
        self.admin_mon_active = 0
        self.interval_minutes = max(1, int(self.config.get("default_interval_minutes", 5)))
        self.captura_permitida = 1
        self.forzar_bandeja = 1
        self.permitir_salir = 0
        self.selected_tar_cod = 0
        self._workers_started = False
        self._hb_lock = threading.Lock()
        self._act_lock = threading.Lock()
        self._act_samples = 0
        self._act_active = 0
        self._fg_title = "EXA Monitor"
        self._fg_process = "ExaMonitor.exe"
        self.tipo_filtro = "todos"
        self.asignables: list = []
        self._pending_files: list[str] = []
        self.file_picker = ft.FilePicker()
        self.tray_icon = None
        self._tray_thread = None
        self._in_tray = False

        ensure_windows_autostart("ExaMonitor")
        start_input_counter()
        self._setup_page()
        self._build()
        self._render()

    # --- config ---
    def load_config(self):
        path = config_path()
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    self.config.update(data)
            except Exception:
                pass
        self.config.pop("password", None)
        self.config["server_url"] = SERVIDOR_FIJO

    def save_config(self):
        try:
            clean = {k: v for k, v in self.config.items() if k != "password"}
            config_path().write_text(
                json.dumps(clean, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
            )
        except Exception as e:
            print("save_config:", e)

    def _setup_page(self):
        p = self.page
        p.title = "EXA Monitor"
        p.theme_mode = ft.ThemeMode.LIGHT
        p.bgcolor = C["bg"]
        p.padding = 0
        p.window.width = 760
        p.window.height = 820
        p.window.min_width = 640
        p.window.min_height = 700
        p.theme = ft.Theme(
            color_scheme_seed=C["primary"],
            font_family="Segoe UI",
        )
        try:
            p.locale = ft.Locale("es", "EC")
        except Exception:
            pass
        try:
            p.window.icon = "favicon.png"
        except Exception:
            pass
        p.window.prevent_close = True
        p.window.on_event = self._on_window_event
        try:
            if self.file_picker not in (p.services or []):
                p.services.append(self.file_picker)
        except Exception:
            pass

    def _on_window_event(self, e: ft.WindowEvent):
        et = getattr(e, "type", None)
        if et == ft.WindowEventType.MINIMIZE:
            self._hide_to_tray()
            return
        if et == ft.WindowEventType.CLOSE:
            if int(self.permitir_salir) != 1 and self.is_authenticated:
                self._hide_to_tray()
                return
            self._quit_app()

    def _hide_to_tray(self):
        """Oculta la ventana y deja el icono en la bandeja (area de notificacion)."""
        try:
            self._ensure_tray()
            self.page.window.skip_task_bar = True
            self.page.window.minimized = False
            self.page.window.visible = False
            self._in_tray = True
            self.page.update()
        except Exception as e:
            print("bandeja:", e)
            try:
                self.page.window.minimized = True
                self.page.update()
            except Exception:
                pass

    def _show_from_tray(self, _icon=None, _item=None):
        def _show():
            try:
                self.page.window.skip_task_bar = False
                self.page.window.visible = True
                self.page.window.minimized = False
                self.page.window.to_front()
                self._in_tray = False
                self.page.update()
            except Exception as e:
                print("restaurar:", e)

        try:
            self.page.run_thread(_show)
        except Exception:
            _show()

    def _tray_image(self):
        from PIL import Image

        for candidate in (
            Path(_assets_dir()) / "favicon.png",
            Path(__file__).resolve().parent / "favicon.png",
        ):
            if candidate.exists():
                try:
                    return Image.open(candidate).convert("RGBA").resize((64, 64))
                except Exception:
                    pass
        return Image.new("RGBA", (64, 64), (158, 37, 37, 255))

    def _ensure_tray(self):
        if self.tray_icon is not None:
            return
        try:
            import pystray
            from pystray import MenuItem as TrayItem
        except Exception as e:
            print("pystray no disponible:", e)
            return

        def run_icon():
            try:
                menu = pystray.Menu(
                    TrayItem("Abrir EXA Monitor", self._show_from_tray, default=True),
                    TrayItem("Salir", lambda i, it: self._quit_app()),
                )
                self.tray_icon = pystray.Icon("ExaMonitor", self._tray_image(), "EXA Monitor", menu)
                self.tray_icon.run()
            except Exception as err:
                print("tray:", err)
                self.tray_icon = None

        self._tray_thread = threading.Thread(target=run_icon, daemon=True)
        self._tray_thread.start()

    def _quit_app(self):
        self.running = False
        try:
            if self.tray_icon is not None:
                self.tray_icon.stop()
        except Exception:
            pass
        try:
            self.page.window.prevent_close = False
            self.page.window.destroy()
        except Exception:
            pass

    def _sample_activity(self):
        idle = idle_seconds()
        title, proceso = foreground_window()
        with self._act_lock:
            self._act_samples += 1
            if idle < 90:
                self._act_active += 1
            if title:
                self._fg_title = title
            if proceso:
                self._fg_process = proceso

    def _consume_activity(self) -> tuple[int, str, str, int, int]:
        with self._act_lock:
            samples = self._act_samples
            active = self._act_active
            title = self._fg_title or "EXA Monitor"
            proceso = self._fg_process or "ExaMonitor.exe"
            self._act_samples = 0
            self._act_active = 0
        clicks, teclas = consume_input_counts()
        if samples <= 0:
            porc = 0 if idle_seconds() > 120 else 40
        else:
            porc = int(round(100.0 * active / samples))
        if clicks + teclas > 0:
            porc = max(porc, min(100, 20 + clicks + teclas))
        return max(0, min(100, porc)), title[:250], proceso[:95], clicks, teclas

    # --- UI builders ---
    def _card(self, *controls, padding=14) -> ft.Container:
        return ft.Container(
            content=ft.Column(list(controls), spacing=10, tight=True),
            bgcolor=C["card"],
            border=ft.Border.all(1, C["border"]),
            border_radius=12,
            padding=padding,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=2,
                color="#1a1a180A",
                offset=ft.Offset(0, 1),
            ),
        )

    def _build(self):
        # Topbar
        self.status_chip = ft.Container(
            content=ft.Text("Desconectado", size=11, weight=ft.FontWeight.W_700, color=C["text_muted"]),
            bgcolor=C["border_soft"],
            padding=ft.Padding.symmetric(horizontal=10, vertical=4),
            border_radius=8,
        )
        self.subtitle = ft.Text("Monitoreo · sin sesión", size=11, color=C["text_muted"])
        self.title_main = ft.Text("EXA Monitor", size=15, weight=ft.FontWeight.BOLD, color=C["text"])

        self.topbar = ft.Container(
            content=ft.Row(
                [
                    ft.Row(
                        [
                            ft.Image(
                                src="exa-icon.png",
                                width=32,
                                height=32,
                                fit=ft.BoxFit.CONTAIN,
                                border_radius=16,
                            ),
                            ft.Column(
                                [
                                    self.title_main,
                                    self.subtitle,
                                ],
                                spacing=0,
                                tight=True,
                            ),
                        ],
                        spacing=12,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    self.status_chip,
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            bgcolor=C["card"],
            padding=ft.Padding.symmetric(horizontal=16, vertical=10),
            border=ft.Border.only(bottom=ft.BorderSide(1, C["border"])),
            visible=False,
        )

        # Login
        self.tf_cedula = ft.TextField(
            label="Cédula",
            value=self.config.get("cedula") or self.config.get("identificador", ""),
            border_color=C["border"],
            focused_border_color=C["primary"],
            keyboard_type=ft.KeyboardType.NUMBER,
            text_size=13,
        )
        self.tf_pass = ft.TextField(
            label="Contraseña",
            password=True,
            can_reveal_password=True,
            keyboard_type=ft.KeyboardType.VISIBLE_PASSWORD,
            capitalization=ft.TextCapitalization.NONE,
            autocorrect=False,
            enable_suggestions=False,
            border_color=C["border"],
            focused_border_color=C["primary"],
            text_size=13,
            text_style=ft.TextStyle(font_family="Segoe UI", size=13),
            on_submit=lambda _e: self._start_login(),
        )
        self.btn_login = ft.FilledButton(
            "Iniciar sesión",
            icon=ft.Icons.LOGIN,
            style=ft.ButtonStyle(
                bgcolor=C["primary"],
                color="#ffffff",
                padding=18,
                shape=ft.RoundedRectangleBorder(radius=10),
            ),
            height=48,
            on_click=lambda _e: self._start_login(),
        )
        self.login_error = ft.Text("", size=12, color="#991b1b", visible=False)

        self.login_card = ft.Container(
            content=ft.Column(
                [
                    ft.Container(
                        content=ft.Column(
                            [
                                ft.Text(
                                    "EXA",
                                    size=34,
                                    weight=ft.FontWeight.W_900,
                                    color="#ffffff",
                                    font_family="Segoe UI Black",
                                ),
                                ft.Text("Tareas y monitoreo", size=12, color="#f3c6c6"),
                                ft.Text("Iniciar sesión", size=24, weight=ft.FontWeight.BOLD, color="#ffffff"),
                                ft.Text(
                                    "Usa tu cédula y contraseña de EXA.",
                                    size=12,
                                    color="#f5d0d0",
                                ),
                            ],
                            spacing=8,
                            horizontal_alignment=ft.CrossAxisAlignment.START,
                        ),
                        bgcolor=C["primary"],
                        padding=ft.Padding.symmetric(horizontal=24, vertical=22),
                        border_radius=ft.BorderRadius.only(top_left=14, top_right=14),
                    ),
                    ft.Container(
                        content=ft.Column(
                            [
                                self.tf_cedula,
                                self.tf_pass,
                                self.login_error,
                                ft.Container(content=self.btn_login, expand=True),
                            ],
                            spacing=12,
                            horizontal_alignment=ft.CrossAxisAlignment.STRETCH,
                        ),
                        padding=22,
                    ),
                ],
                spacing=0,
                tight=True,
                horizontal_alignment=ft.CrossAxisAlignment.STRETCH,
            ),
            width=440,
            bgcolor=C["card"],
            border=ft.Border.all(1, C["border"]),
            border_radius=14,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=24,
                color="#1a1a1820",
                offset=ft.Offset(0, 8),
            ),
        )

        # Tools
        self.btn_refresh = ft.OutlinedButton(
            "Actualizar",
            icon=ft.Icons.REFRESH,
            disabled=True,
            style=ft.ButtonStyle(
                color=C["text"],
                side=ft.BorderSide(1, C["border"]),
                shape=ft.RoundedRectangleBorder(radius=10),
                padding=14,
            ),
            on_click=lambda _e: self.page.run_thread(self._manual_refresh),
        )
        self.lbl_kpis = ft.Text("", size=12, color=C["text_muted"])

        # Active task dropdown
        self.dd_active = ft.Dropdown(
            label="Tarea / ticket activo",
            hint_text="Selecciona para telemetría",
            options=[],
            border_color=C["border"],
            focused_border_color=C["primary"],
            on_select=self._on_active_select,
            dense=True,
        )

        # Filter chips via SegmentedButton
        self.seg_tipo = ft.SegmentedButton(
            selected=["todos"],
            allow_multiple_selection=False,
            segments=[
                ft.Segment(value="todos", label=ft.Text("Todos"), icon=ft.Icon(ft.Icons.LIST_ALT)),
                ft.Segment(value="tarea", label=ft.Text("Tareas"), icon=ft.Icon(ft.Icons.TASK_ALT)),
                ft.Segment(value="ticket", label=ft.Text("Tickets"), icon=ft.Icon(ft.Icons.CONFIRMATION_NUMBER_OUTLINED)),
            ],
            on_change=self._on_tipo_change,
            style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=8)),
        )

        self.tasks_list_view = ft.ListView(expand=True, spacing=8, padding=0)

        self.card_activa = self._card(
            ft.Text("Tarea / ticket activo", size=13, weight=ft.FontWeight.W_700, color=C["text"]),
            ft.Text(
                "Se usa para telemetría y seguimiento en vivo.",
                size=11,
                color=C["text_muted"],
            ),
            self.dd_active,
        )
        self.lbl_lista_titulo = ft.Text("Mis tareas", size=15, weight=ft.FontWeight.BOLD, color=C["text"])
        self.lbl_lista_hint = ft.Text("Clic para marcar activa", size=11, color=C["text_muted"])

        self.workspace = ft.Column(
            [
                ft.Row([self.btn_refresh, self.lbl_kpis], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                self.card_activa,
                self._card(
                    ft.Row(
                        [
                            self.lbl_lista_titulo,
                            self.lbl_lista_hint,
                        ],
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                    ),
                    self.seg_tipo,
                    ft.Container(content=self.tasks_list_view, height=340),
                    padding=14,
                ),
            ],
            spacing=12,
            visible=False,
        )

        self.login_panel = ft.Container(
            content=self.login_card,
            alignment=ft.Alignment.CENTER,
            expand=True,
        )

        self.body = ft.Container(
            content=ft.Column(
                [
                    self.login_panel,
                    self.workspace,
                ],
                spacing=0,
                expand=True,
            ),
            padding=24,
            expand=True,
            bgcolor=C["bg"],
        )
    def _render(self):
        self.page.controls.clear()
        self.page.add(
            ft.Column(
                [self.topbar, self.body],
                spacing=0,
                expand=True,
            )
        )
        self.page.update()

    def _set_status(self, text: str, *, ok: bool = False):
        self.status_chip.content = ft.Text(
            text[:40],
            size=11,
            weight=ft.FontWeight.W_700,
            color=C["success_fg"] if ok else C["text_muted"],
        )
        self.status_chip.bgcolor = C["success_bg"] if ok else C["border_soft"]
        self.page.update()

    def _show_info(self, title: str, message: str):
        dlg = ft.AlertDialog(
            modal=True,
            title=ft.Text(title),
            content=ft.Text(message),
            actions=[ft.TextButton("OK", on_click=lambda _e: self.page.pop_dialog())],
        )
        self.page.show_dialog(dlg)

    def _start_login(self):
        self.btn_login.disabled = True
        self.btn_login.text = "Autenticando..."
        self.login_error.visible = False
        self.page.update()
        self.page.run_thread(self.action_login)

    def _visible_tasks(self) -> list:
        if self.tipo_filtro == "tarea":
            return [t for t in self.tasks_list if t.get("tipo") != "ticket"]
        if self.tipo_filtro == "ticket":
            return [t for t in self.tasks_list if t.get("tipo") == "ticket"]
        return list(self.tasks_list)

    def _on_tipo_change(self, e: ft.ControlEvent):
        selected = list(e.control.selected or [])
        if selected:
            self.tipo_filtro = str(selected[0])
            self._refresh_tasks_ui()

    def _on_active_select(self, e: ft.ControlEvent):
        val = e.control.value
        try:
            self.selected_tar_cod = int(val) if val else 0
        except Exception:
            self.selected_tar_cod = 0

    def _task_row(self, t: dict) -> ft.Control:
        is_ticket = t.get("tipo") == "ticket"
        estado = t.get("Tar_Estado") or ""
        ebg, efg = estado_style(estado)
        plain = t.get("Tar_Titulo_Plain") or t.get("Tar_Titulo") or ""
        cod = int(t.get("Tar_Cod") or t.get("Tic_Cod") or 0)
        pct = int(t.get("Ava_Porcentaje") if t.get("Ava_Porcentaje") is not None else 0)
        fin = t.get("Tar_Fecha_Fin") or ""
        prio = t.get("Tar_Prioridad") or "Media"
        pbg, pfg = prioridad_style(prio)
        tipo = "ticket" if is_ticket else "tarea"

        top = ft.Row(
            [
                badge(
                    f"Ticket #{cod}" if is_ticket else f"Tarea #{cod}",
                    C["ticket_bg"] if is_ticket else C["tarea_bg"],
                    C["ticket_fg"] if is_ticket else C["tarea_fg"],
                ),
                badge(prio, pbg, pfg),
            ],
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
        )

        mid: list[ft.Control] = [
            ft.Text(plain, size=13, weight=ft.FontWeight.BOLD, color=C["text"]),
            ft.Row(
                [
                    badge(estado, ebg, efg),
                    ft.Text(
                        " · ".join(
                            p
                            for p in [
                                (t.get("Empresa") or "").strip(),
                                (t.get("Llegada") or "").strip(),
                                f"Fin {fin}" if (fin and not is_ticket) else "",
                            ]
                            if p
                        ),
                        size=11,
                        color=C["text_muted"],
                    ),
                ],
                spacing=8,
                wrap=True,
            ),
        ]

        if not is_ticket:
            mid.append(
                ft.Row(
                    [
                        ft.ProgressBar(
                            value=max(0, min(1, pct / 100.0)),
                            color=C["primary"],
                            bgcolor=C["border_soft"],
                            bar_height=6,
                            border_radius=4,
                            expand=True,
                        ),
                        ft.Text(f"{pct}%", size=11, weight=ft.FontWeight.BOLD, color=C["text"], width=36),
                    ],
                    spacing=8,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
                )
            )

        return ft.Container(
            content=ft.Column([top, *mid], spacing=8, tight=True),
            bgcolor=C["card"],
            border=ft.Border.all(1, C["border"]),
            border_radius=12,
            padding=14,
            ink=True,
            on_click=lambda _e, c=cod, tp=tipo: self._open_item(c, tp),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=2,
                color="#1a1a180A",
                offset=ft.Offset(0, 1),
            ),
        )

    def _activate_task(self, cod: int):
        self.selected_tar_cod = cod
        self.dd_active.value = str(cod)
        self._set_status(f"Activa #{cod}", ok=True)
        self.page.update()

    def _open_item(self, cod: int, tipo: str):
        self._activate_task(cod)
        self._set_status("Cargando detalle...")
        self.page.run_thread(lambda: self._load_detalle(cod, tipo))

    def _media_url(self, path: str) -> str:
        if not path:
            return ""
        if path.startswith("http://") or path.startswith("https://"):
            return path
        base = (self.config.get("server_url") or "").rstrip("/")
        if not path.startswith("/"):
            path = "/" + path
        return base + path

    def _api_post(self, data: dict, timeout: int = 20) -> dict:
        url = build_api_url(self.config.get("server_url"), self.config.get("api_path"))
        resp = requests.post(url, data=data, timeout=timeout)
        return resp.json()

    def _load_detalle(self, cod: int, tipo: str):
        try:
            per = int((self.dev_data or {}).get("Per_Cod") or 0)
            data = self._api_post(
                {
                    "accion": "detalle_trabajo",
                    "Per_Cod": str(per),
                    "Tar_Cod": str(cod),
                    "Tic_Cod": str(cod),
                    "tipo": tipo,
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                }
            )
            if data.get("status") != "ok":
                self._show_info("Detalle", data.get("mensaje") or "No se pudo cargar.")
                self._set_status("Error al cargar")
                return
            payload = data.get("data") or {}
            self._show_detalle_dialog(payload)
            self._set_status(f"Detalle #{cod}", ok=True)
        except Exception as e:
            self._show_info("Detalle", str(e))
            self._set_status("Error al cargar")

    def _fetch_media(self, url: str, dest: Path) -> Path:
        dest.parent.mkdir(parents=True, exist_ok=True)
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        return dest

    def _descargar_evidencia(self, url: str, nombre: str):
        try:
            dest_dir = Path.home() / "Downloads"
            dest = dest_dir / safe_filename(nombre)
            if dest.exists():
                dest = dest_dir / f"{dest.stem}_{int(time.time())}{dest.suffix}"
            self._fetch_media(url, dest)
            self._set_status(f"Descargado: {dest.name}", ok=True)
        except Exception as e:
            self._show_info("Descarga", str(e))

    def _ver_documento(self, url: str, nombre: str):
        try:
            dest = Path(tempfile.gettempdir()) / "examontor" / safe_filename(nombre)
            self._fetch_media(url, dest)
            os.startfile(str(dest))
            self._set_status(f"Abierto: {dest.name}", ok=True)
        except Exception as e:
            self._show_info("Evidencia", str(e))

    def _preview_imagen(self, url: str, nombre: str):
        def close_preview(_e=None):
            self.page.pop_dialog()

        def do_download(_e=None):
            self.page.run_thread(lambda: self._descargar_evidencia(url, nombre))

        dlg = ft.AlertDialog(
            modal=True,
            bgcolor=C["card"],
            shape=ft.RoundedRectangleBorder(radius=12),
            title=ft.Row(
                [
                    ft.Text(nombre, size=14, weight=ft.FontWeight.W_600, color=C["text"], expand=True),
                    ft.IconButton(
                        icon=ft.Icons.CLOSE,
                        icon_color=C["text_muted"],
                        tooltip="Cerrar",
                        on_click=close_preview,
                    ),
                ],
                vertical_alignment=ft.CrossAxisAlignment.CENTER,
            ),
            content=ft.Container(
                content=ft.Image(src=url, fit=ft.BoxFit.CONTAIN),
                width=640,
                height=420,
                bgcolor=C["muted_bg"],
                border_radius=10,
                alignment=ft.Alignment.CENTER,
                clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            ),
            actions=[
                ft.OutlinedButton(
                    "Descargar",
                    icon=ft.Icons.DOWNLOAD,
                    on_click=do_download,
                    style=ft.ButtonStyle(
                        color=C["text"],
                        side=ft.BorderSide(1, C["border"]),
                        shape=ft.RoundedRectangleBorder(radius=8),
                    ),
                ),
                ft.TextButton("Cerrar", on_click=close_preview, style=ft.ButtonStyle(color=C["text_muted"])),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )
        self.page.show_dialog(dlg)

    def _evidencia_tile(self, ev: dict) -> ft.Control:
        url = self._media_url(ev.get("url") or "")
        nombre = ev.get("nombre") or "evidencia"
        es_imagen = bool(ev.get("esImagen"))
        tipo = evidencia_tipo(nombre)

        def ver(_e=None):
            if not url:
                return
            if es_imagen:
                self._preview_imagen(url, nombre)
            else:
                self.page.run_thread(lambda: self._ver_documento(url, nombre))

        def descargar(_e=None):
            if not url:
                return
            self.page.run_thread(lambda: self._descargar_evidencia(url, nombre))

        acciones = ft.Row(
            [
                ft.TextButton(
                    "Ver",
                    icon=ft.Icons.VISIBILITY_OUTLINED,
                    on_click=ver,
                    style=ft.ButtonStyle(color=C["primary"], padding=ft.Padding.symmetric(horizontal=4, vertical=0)),
                ),
                ft.TextButton(
                    "Descargar",
                    icon=ft.Icons.DOWNLOAD,
                    on_click=descargar,
                    style=ft.ButtonStyle(color=C["text"], padding=ft.Padding.symmetric(horizontal=4, vertical=0)),
                ),
            ],
            spacing=0,
        )

        if es_imagen and url:
            return ft.Container(
                width=200,
                border=ft.Border.all(1, C["border"]),
                border_radius=10,
                clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
                bgcolor=C["card"],
                content=ft.Column(
                    [
                        ft.Container(
                            content=ft.Image(src=url, height=110, width=200, fit=ft.BoxFit.COVER),
                            on_click=ver,
                            height=110,
                        ),
                        ft.Container(content=acciones, padding=ft.Padding.symmetric(horizontal=4, vertical=2)),
                    ],
                    spacing=0,
                    tight=True,
                ),
            )

        return ft.Container(
            width=220,
            padding=10,
            bgcolor=C["muted_bg"],
            border=ft.Border.all(1, C["border"]),
            border_radius=10,
            content=ft.Column(
                [
                    ft.Row(
                        [
                            ft.Icon(ft.Icons.INSERT_DRIVE_FILE_OUTLINED, size=22, color=C["text_muted"]),
                            ft.Column(
                                [
                                    ft.Text(tipo, size=9, weight=ft.FontWeight.W_700, color=C["text_muted"]),
                                    ft.Text(nombre, size=11, color=C["text"], max_lines=2, overflow=ft.TextOverflow.ELLIPSIS),
                                ],
                                spacing=0,
                                expand=True,
                            ),
                        ],
                        spacing=8,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    acciones,
                ],
                spacing=4,
                tight=True,
            ),
        )

    def _show_detalle_dialog(self, payload: dict):
        trabajo = payload.get("trabajo") or {}
        evidencias = payload.get("evidencias") or []
        avances = payload.get("avances") or []
        tipo = payload.get("tipo") or "tarea"
        cod = int(trabajo.get("Cod") or 0)
        puede_avance = bool(trabajo.get("puede_registrar_avance"))
        puede_estado = bool(trabajo.get("puede_cambiar_estado"))
        puede_asignar = bool(trabajo.get("puede_asignar"))
        pct_actual = int(trabajo.get("Ava_Porcentaje") or 0)
        estado = trabajo.get("Estado") or ""

        ebg, efg = estado_style(estado)
        prio = trabajo.get("Prioridad") or "Media"
        pbg, pfg = prioridad_style(prio)
        badges = [
            badge(
                "Ticket" if tipo == "ticket" else "Tarea",
                C["ticket_bg"] if tipo == "ticket" else C["tarea_bg"],
                C["ticket_fg"] if tipo == "ticket" else C["tarea_fg"],
            ),
            ft.Text(f"#{cod}", size=12, color=C["text_muted"], font_family="Consolas"),
            badge(estado or "-", ebg, efg),
            badge(prio, pbg, pfg),
        ]
        if trabajo.get("Complejidad"):
            cbg, cfg = complejidad_style(str(trabajo.get("Complejidad")))
            badges.append(badge(f"Complejidad: {trabajo.get('Complejidad')}", cbg, cfg))

        close_btn = ft.IconButton(
            icon=ft.Icons.CLOSE,
            icon_color=C["text_muted"],
            tooltip="Cerrar",
            icon_size=20,
        )
        header_bits: list[ft.Control] = [
            ft.Row(
                [
                    ft.Row(badges, spacing=6, wrap=True, expand=True),
                    close_btn,
                ],
                vertical_alignment=ft.CrossAxisAlignment.START,
            ),
            ft.Text(
                trabajo.get("Titulo") or f"#{cod}",
                size=20,
                weight=ft.FontWeight.BOLD,
                color=C["text"],
            ),
        ]
        if tipo != "ticket":
            header_bits.append(
                ft.Row(
                    [
                        ft.ProgressBar(
                            value=max(0, min(1, pct_actual / 100.0)),
                            color=C["primary"],
                            bgcolor=C["border_soft"],
                            bar_height=10,
                            border_radius=6,
                            expand=True,
                        ),
                        ft.Text(
                            f"{pct_actual}%",
                            size=18,
                            weight=ft.FontWeight.BOLD,
                            color=C["text"],
                            width=48,
                            text_align=ft.TextAlign.RIGHT,
                        ),
                    ],
                    spacing=12,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER,
                )
            )
        header = ft.Container(
            content=ft.Column(header_bits, spacing=8, tight=True),
            width=620,
            padding=ft.Padding.only(bottom=4),
            border=ft.Border.only(bottom=ft.BorderSide(1, C["border_soft"])),
        )

        evid_controls = [self._evidencia_tile(ev) for ev in evidencias[:12] if ev.get("url")]

        body_cols: list[ft.Control] = []

        if tipo == "ticket":
            rows = [
                x
                for x in [
                    meta_row(ft.Icons.PERSON_OUTLINE, "Enviado por", trabajo.get("Enviado_Por")),
                    meta_row(ft.Icons.BUSINESS, "Empresa", trabajo.get("Empresa")),
                    meta_row(ft.Icons.PHONE_OUTLINED, "Teléfono", trabajo.get("Telefono")),
                    meta_row(ft.Icons.HANDYMAN_OUTLINED, "Proceso", trabajo.get("Proceso")),
                    meta_row(ft.Icons.PERSON_OUTLINE, "Asignado", trabajo.get("Asignado_Nombre")),
                ]
                if x is not None
            ]
            if rows:
                body_cols.append(info_card(*rows))

        body_cols.extend(
            [
                section_label("Descripcion"),
                desc_box(plain_text(trabajo.get("Descripcion"))),
            ]
        )

        if evid_controls:
            body_cols.append(section_label("Evidencias"))
            body_cols.append(ft.Row(evid_controls, wrap=True, spacing=8, run_spacing=8))

        if avances:
            body_cols.append(section_label("Avances"))
            for a in avances[:5]:
                body_cols.append(
                    ft.Container(
                        content=ft.Column(
                            [
                                ft.Row(
                                    [
                                        badge(f"{a.get('Ava_Porcentaje', 0)}%", C["success_bg"], C["success_fg"]),
                                        ft.Text(
                                            (a.get("Autor") or "")[:40],
                                            size=11,
                                            color=C["text_muted"],
                                        ),
                                    ],
                                    spacing=8,
                                ),
                                ft.Text(
                                    (plain_text(a.get("realizado"))[:220]) or "Sin nota",
                                    size=12,
                                    color=C["text"],
                                ),
                            ],
                            spacing=6,
                            tight=True,
                        ),
                        border=ft.Border.only(left=ft.BorderSide(2, C["primary"])),
                        padding=ft.Padding.only(left=12, top=4, bottom=4, right=4),
                    )
                )

        lbl_pct = ft.Text(
            f"{pct_actual}%",
            size=22,
            weight=ft.FontWeight.W_700,
            color=C["text"],
        )
        lbl_delta = ft.Text(f"igual que {pct_actual}%", size=11, color=C["text_muted"])
        slider_pct = ft.Slider(
            min=0,
            max=100,
            divisions=100,
            round=0,
            value=float(max(0, min(100, pct_actual))),
            label="{value}%",
            active_color="#059669",
            inactive_color=C["border"],
            thumb_color="#059669",
            expand=True,
        )

        def pct_actual_slider() -> int:
            try:
                return int(round(float(slider_pct.value if slider_pct.value is not None else 0)))
            except Exception:
                return 0

        def pintar_pct(_e=None):
            v = pct_actual_slider()
            d = v - pct_actual
            lbl_pct.value = f"{v}%"
            if d > 0:
                lbl_delta.value = f"+{d} vs {pct_actual}%"
                lbl_delta.color = C["success_fg"]
            elif d < 0:
                lbl_delta.value = f"{d} vs {pct_actual}%"
                lbl_delta.color = C["danger_fg"]
            else:
                lbl_delta.value = f"igual que {pct_actual}%"
                lbl_delta.color = C["text_muted"]
            self.page.update()

        def fijar_pct(nuevo: int):
            slider_pct.value = float(max(0, min(100, nuevo)))
            pintar_pct()

        slider_pct.on_change = pintar_pct

        def chip_pct(texto: str, nuevo: int) -> ft.Control:
            return ft.OutlinedButton(
                texto,
                style=ft.ButtonStyle(
                    color=C["text"],
                    padding=ft.Padding.symmetric(horizontal=10, vertical=0),
                    side=ft.BorderSide(1, C["border"]),
                    shape=ft.RoundedRectangleBorder(radius=8),
                    text_style=ft.TextStyle(size=12, weight=ft.FontWeight.W_600),
                ),
                on_click=lambda _e, n=nuevo: fijar_pct(pct_actual_slider() + n if n < 100 else 100),
            )

        barra_avance = ft.Container(
            content=ft.Column(
                [
                    ft.Row(
                        [
                            ft.Text("Porcentaje de avance", size=12, weight=ft.FontWeight.W_700, color=C["text"]),
                            ft.Column(
                                [lbl_pct, lbl_delta],
                                spacing=0,
                                horizontal_alignment=ft.CrossAxisAlignment.END,
                                tight=True,
                            ),
                        ],
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER,
                    ),
                    slider_pct,
                    ft.Row(
                        [
                            chip_pct("+5%", 5),
                            chip_pct("+10%", 10),
                            chip_pct("+25%", 25),
                            chip_pct("100%", 100),
                        ],
                        spacing=6,
                        wrap=True,
                    ),
                ],
                spacing=4,
                tight=True,
            ),
            bgcolor=C["muted_bg"],
            border=ft.Border.all(1, C["border"]),
            border_radius=10,
            padding=ft.Padding.only(left=12, right=12, top=10, bottom=8),
        )

        sel_editor = {"start": 0, "end": 0}

        def on_sel(e):
            s = getattr(e, "selection", None)
            if s is None:
                return
            sel_editor["start"] = int(getattr(s, "start", 0) or 0)
            sel_editor["end"] = int(getattr(s, "end", 0) or 0)

        tf_realizado = ft.TextField(
            multiline=True,
            min_lines=4,
            max_lines=7,
            hint_text="Describe lo que avanzaste. Selecciona texto y usa la barra de formato.",
            border=ft.InputBorder.NONE,
            content_padding=ft.Padding.symmetric(horizontal=12, vertical=10),
            text_size=13,
            on_selection_change=on_sel,
        )

        def envolver(abre: str, cierra: str):
            def _(_e):
                text = tf_realizado.value or ""
                a = max(0, min(sel_editor["start"], len(text)))
                b = max(0, min(sel_editor["end"], len(text)))
                if a > b:
                    a, b = b, a
                medio = text[a:b] if a != b else ""
                tf_realizado.value = text[:a] + abre + medio + cierra + text[b:]
                self.page.update()

            return _

        def btn_fmt(icon, tip: str, abre: str, cierra: str) -> ft.Control:
            return ft.IconButton(
                icon=icon,
                tooltip=tip,
                icon_size=16,
                icon_color=C["text"],
                style=ft.ButtonStyle(
                    padding=4,
                    shape=ft.RoundedRectangleBorder(radius=6),
                ),
                on_click=envolver(abre, cierra),
            )

        editor = ft.Container(
            content=ft.Column(
                [
                    ft.Container(
                        content=ft.Row(
                            [
                                btn_fmt(ft.Icons.FORMAT_BOLD, "Negrita", "<strong>", "</strong>"),
                                btn_fmt(ft.Icons.FORMAT_ITALIC, "Cursiva", "<em>", "</em>"),
                                btn_fmt(ft.Icons.FORMAT_UNDERLINED, "Subrayado", "<u>", "</u>"),
                                btn_fmt(ft.Icons.FORMAT_LIST_BULLETED, "Lista", "<ul><li>", "</li></ul>"),
                            ],
                            spacing=0,
                        ),
                        bgcolor=C["muted_bg"],
                        border=ft.Border.only(bottom=ft.BorderSide(1, C["border"])),
                        padding=ft.Padding.symmetric(horizontal=4, vertical=0),
                    ),
                    tf_realizado,
                ],
                spacing=0,
                tight=True,
            ),
            border=ft.Border.all(1, C["border"]),
            border_radius=10,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            bgcolor=C["card"],
        )
        lbl_avance_err = ft.Text("", size=12, color=C["danger_fg"], visible=False)
        lbl_files = ft.Text("Ningún archivo seleccionado", size=11, color=C["text_muted"])
        btn_pick = ft.OutlinedButton(
            "Adjuntar evidencias",
            icon=ft.Icons.ATTACH_FILE,
            style=ft.ButtonStyle(
                color=C["text"],
                side=ft.BorderSide(1, C["border"]),
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )
        btn_guardar = ft.FilledButton(
            "Registrar avance",
            icon=ft.Icons.TRENDING_UP,
            style=ft.ButtonStyle(
                bgcolor="#059669",
                color="#ffffff",
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )
        btn_en_proceso = ft.OutlinedButton(
            "En proceso",
            icon=ft.Icons.PLAY_ARROW,
            visible=puede_estado and estado != "En Proceso" and estado != "Finalizada",
            style=ft.ButtonStyle(
                color=C["info_fg"],
                side=ft.BorderSide(1, C["border"]),
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )
        btn_resuelto = ft.FilledButton(
            "Marcar resuelto",
            icon=ft.Icons.CHECK,
            visible=puede_estado and estado != "Finalizada",
            style=ft.ButtonStyle(
                bgcolor="#059669",
                color="#ffffff",
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )
        btn_solo_ev = ft.OutlinedButton(
            "Subir evidencias",
            icon=ft.Icons.CLOUD_UPLOAD,
            visible=bool(trabajo.get("puede_subir_evidencia")),
            style=ft.ButtonStyle(
                color=C["text"],
                side=ft.BorderSide(1, C["border"]),
                shape=ft.RoundedRectangleBorder(radius=8),
            ),
        )

        self._pending_files = []

        def refresh_files_label():
            if self._pending_files:
                names = [Path(p).name for p in self._pending_files]
                lbl_files.value = f"{len(names)} archivo(s): " + ", ".join(names[:3])
                if len(names) > 3:
                    lbl_files.value += "..."
            else:
                lbl_files.value = "Ningún archivo seleccionado"
            self.page.update()

        dlg_ref: dict = {}

        async def _ocultar_dialogo():
            dlg = dlg_ref.get("dlg")
            if dlg is None or not dlg.open:
                return
            self.page.pop_dialog()
            for _ in range(50):
                if dlg not in self.page._dialogs.controls:
                    return
                await asyncio.sleep(0.05)

        def _mostrar_dialogo():
            dlg = dlg_ref.get("dlg")
            if dlg is None:
                return
            if dlg in self.page._dialogs.controls:
                if not dlg.open:
                    dlg.open = True
                    self.page.update()
                return
            self.page.show_dialog(dlg)

        async def pick_files(_e=None):
            reabrir = bool(dlg_ref.get("dlg") and dlg_ref["dlg"].open)
            btn_pick.disabled = True
            self.page.update()
            try:
                # El dialogo modal tapa el selector nativo de Windows.
                if reabrir:
                    await _ocultar_dialogo()
                try:
                    files = await self.file_picker.pick_files(
                        dialog_title="Evidencias",
                        allow_multiple=True,
                        file_type=ft.FilePickerFileType.ANY,
                    )
                except TypeError:
                    files = []
                paths = []
                rejected = []
                for f in files or []:
                    pth = getattr(f, "path", None)
                    if not pth:
                        continue
                    ext = Path(pth).suffix.lower().lstrip(".")
                    if ext not in EVIDENCIA_EXTS:
                        rejected.append(Path(pth).name)
                        continue
                    paths.append(pth)
                self._pending_files = paths[:10]
                refresh_files_label()
                if rejected and not paths:
                    lbl_avance_err.value = (
                        "Ese tipo de archivo no se puede adjuntar. "
                        "Usa imagen, PDF, Word, Excel o texto."
                    )
                    lbl_avance_err.visible = True
                elif rejected:
                    lbl_avance_err.value = (
                        "Se omitieron archivos no permitidos: " + ", ".join(rejected[:3])
                    )
                    lbl_avance_err.visible = True
                else:
                    lbl_avance_err.visible = False
                self.page.update()
            except Exception as err:
                print("pick_files:", err)
                lbl_avance_err.value = "No se pudo abrir el selector de archivos."
                lbl_avance_err.visible = True
                self.page.update()
            finally:
                btn_pick.disabled = False
                if reabrir:
                    _mostrar_dialogo()
                self.page.update()

        btn_pick.on_click = pick_files

        dd_ase = None
        btn_asignar = None
        if puede_asignar:
            opciones = payload.get("asignables") or self.asignables or []
            dd_ase = ft.Dropdown(
                label="Desarrollador",
                hint_text="Elige a quién asignar",
                options=[
                    ft.DropdownOption(
                        key=str(a.get("Usu_Cod")),
                        text=(a.get("Nombre") or f"Usuario {a.get('Usu_Cod')}")[:80],
                    )
                    for a in opciones
                    if a.get("Usu_Cod")
                ],
                border_color=C["border"],
                focused_border_color=C["primary"],
                dense=True,
            )
            btn_asignar = ft.FilledButton(
                "Asignar ticket",
                icon=ft.Icons.PERSON_ADD_ALT,
                style=ft.ButtonStyle(
                    bgcolor=C["primary"],
                    color="#ffffff",
                    shape=ft.RoundedRectangleBorder(radius=8),
                ),
            )

        fila_adjuntar = ft.Row(
            [btn_pick, lbl_files],
            spacing=10,
            wrap=True,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
        )

        if puede_avance:
            body_cols.append(
                ft.Container(
                    content=ft.Column(
                        [
                            section_label("Registrar avance"),
                            barra_avance,
                            editor,
                            fila_adjuntar,
                            lbl_avance_err,
                            ft.Row([btn_guardar], alignment=ft.MainAxisAlignment.END),
                        ],
                        spacing=8,
                        tight=True,
                        horizontal_alignment=ft.CrossAxisAlignment.STRETCH,
                    ),
                    bgcolor=C["card"],
                    border=ft.Border.all(1, C["border"]),
                    border_radius=12,
                    padding=14,
                )
            )
        elif puede_asignar and dd_ase is not None and btn_asignar is not None:
            body_cols.append(
                info_card(
                    section_label("Asignar"),
                    dd_ase if dd_ase.options else ft.Text(
                        "No hay desarrolladores en el equipo.", size=12, color=C["text_muted"]
                    ),
                    lbl_avance_err,
                    ft.Row([btn_asignar], alignment=ft.MainAxisAlignment.END),
                )
            )
        elif trabajo.get("puede_subir_evidencia"):
            body_cols.append(
                info_card(
                    section_label("Adjuntar"),
                    fila_adjuntar,
                    lbl_avance_err,
                )
            )

        body_cols.insert(0, header)

        alto = 560
        try:
            alto = max(420, min(640, int(self.page.window.height or 820) - 200))
        except Exception:
            pass

        content = ft.Column(
            body_cols,
            spacing=14,
            scroll=ft.ScrollMode.AUTO,
            width=620,
            height=alto,
        )

        def close_dlg(_e=None):
            self._pending_files = []
            self.page.pop_dialog()

        close_btn.on_click = close_dlg

        def do_save(_e):
            pct = pct_actual_slider()
            realizado = (tf_realizado.value or "").strip()
            if not plain_text(realizado):
                lbl_avance_err.value = "Describe lo que avanzaste."
                lbl_avance_err.visible = True
                self.page.update()
                return
            btn_guardar.disabled = True
            btn_guardar.text = "Guardando..."
            lbl_avance_err.visible = False
            self.page.update()
            files = list(self._pending_files)
            self.page.run_thread(lambda: self._registrar_avance(cod, pct, realizado, files, close_dlg))

        def do_ticket_estado(nuevo: str):
            btn_en_proceso.disabled = True
            btn_resuelto.disabled = True
            lbl_avance_err.visible = False
            self.page.update()
            files = list(self._pending_files)
            self.page.run_thread(lambda: self._actualizar_ticket(cod, nuevo, files, close_dlg))

        async def do_solo_evidencias(_e):
            if not self._pending_files:
                await pick_files()
            if not self._pending_files:
                if not lbl_avance_err.visible:
                    lbl_avance_err.value = "Selecciona al menos un archivo."
                    lbl_avance_err.visible = True
                    self.page.update()
                return
            btn_solo_ev.disabled = True
            self.page.update()
            files = list(self._pending_files)
            self.page.run_thread(lambda: self._solo_subir_evidencias(cod, tipo, files, close_dlg))

        btn_guardar.on_click = do_save
        btn_en_proceso.on_click = lambda _e: do_ticket_estado("En Proceso")
        btn_resuelto.on_click = lambda _e: do_ticket_estado("Resuelto")
        btn_solo_ev.on_click = do_solo_evidencias

        def do_asignar(_e):
            if dd_ase is None or btn_asignar is None:
                return
            usu = str(dd_ase.value or "").strip()
            if not usu:
                lbl_avance_err.value = "Elige un desarrollador."
                lbl_avance_err.visible = True
                self.page.update()
                return
            btn_asignar.disabled = True
            btn_asignar.text = "Asignando..."
            lbl_avance_err.visible = False
            self.page.update()
            self.page.run_thread(lambda: self._asignar_ticket(cod, int(usu), close_dlg, btn_asignar))

        if btn_asignar is not None:
            btn_asignar.on_click = do_asignar

        footer = [
            ft.TextButton(
                "Cerrar",
                on_click=close_dlg,
                style=ft.ButtonStyle(color=C["text_muted"]),
            ),
        ]
        if puede_estado:
            footer.extend([btn_en_proceso, btn_resuelto])
        if trabajo.get("puede_subir_evidencia") and not puede_avance:
            footer.append(btn_solo_ev)

        dlg = ft.AlertDialog(
            modal=True,
            bgcolor=C["card"],
            shape=ft.RoundedRectangleBorder(radius=12),
            title=None,
            content=content,
            actions=footer,
            actions_alignment=ft.MainAxisAlignment.END,
            action_button_padding=8,
        )
        dlg_ref["dlg"] = dlg
        self.page.show_dialog(dlg)

    def _upload_evidencias(self, cod: int, tipo: str, file_paths: list[str]) -> list[str]:
        if not file_paths:
            return []
        per = int((self.dev_data or {}).get("Per_Cod") or 0)
        url = build_api_url(self.config.get("server_url"), self.config.get("api_path"))
        data = {
            "accion": "subir_evidencia",
            "Per_Cod": str(per),
            "mac_address": self.mac_address,
            "version_agente": AGENT_VERSION,
        }
        if tipo == "ticket":
            data["Tic_Cod"] = str(cod)
        else:
            data["Tar_Cod"] = str(cod)
        files_payload = []
        opened = []
        try:
            for path in file_paths[:10]:
                fh = open(path, "rb")
                opened.append(fh)
                files_payload.append(("files", (Path(path).name, fh)))
            resp = requests.post(url, data=data, files=files_payload, timeout=60)
            payload = resp.json()
        finally:
            for fh in opened:
                try:
                    fh.close()
                except Exception:
                    pass
        if payload.get("status") != "ok":
            raise RuntimeError(payload.get("mensaje") or "No se pudieron subir evidencias.")
        return [a.get("ruta") for a in (payload.get("data") or {}).get("adjuntos") or [] if a.get("ruta")]

    def _apply_task_list(self, payload: dict):
        if payload.get("mis_tareas") is not None or payload.get("tareas") is not None:
            self.tasks_list = payload.get("mis_tareas") or payload.get("tareas") or []
            self._refresh_tasks_ui()

    def _asignar_ticket(self, tic_cod: int, usu_cod: int, on_ok, btn=None):
        def fallo(msg: str):
            if btn is not None:
                btn.disabled = False
                btn.text = "Asignar ticket"
            self._show_info("Asignar", msg)

        try:
            per = int((self.dev_data or {}).get("Per_Cod") or 0)
            data = self._api_post(
                {
                    "accion": "asignar_ticket",
                    "Per_Cod": str(per),
                    "Tic_Cod": str(tic_cod),
                    "Usu_Cod": str(usu_cod),
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                }
            )
            if data.get("status") != "ok":
                fallo(data.get("mensaje") or "No se pudo asignar.")
                return
            payload = data.get("data") or {}
            if payload.get("asignables") is not None:
                self.asignables = payload.get("asignables") or []
            self._apply_task_list(payload)
            try:
                on_ok()
            except Exception:
                pass
            nombre = payload.get("Asignado_Nombre") or "el desarrollador"
            self._show_info("Ticket asignado", f"Ticket #{tic_cod} → {nombre}.")
            self._set_status(f"Asignado #{tic_cod}", ok=True)
        except Exception as e:
            fallo(str(e))

    def _registrar_avance(self, tar_cod: int, porcentaje: int, realizado: str, file_paths: list[str], on_ok):
        try:
            rutas = self._upload_evidencias(tar_cod, "tarea", file_paths) if file_paths else []
            per = int((self.dev_data or {}).get("Per_Cod") or 0)
            data = self._api_post(
                {
                    "accion": "registrar_avance",
                    "Per_Cod": str(per),
                    "Tar_Cod": str(tar_cod),
                    "porcentaje": str(max(0, min(100, porcentaje))),
                    "realizado": realizado,
                    "adjuntos": json.dumps(rutas),
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                }
            )
            if data.get("status") != "ok":
                self._show_info("Avance", data.get("mensaje") or "No se pudo registrar.")
                return
            payload = data.get("data") or {}
            self._apply_task_list(payload)
            try:
                on_ok()
            except Exception:
                pass
            self._show_info("Avance", f"Registrado al {payload.get('porcentaje', porcentaje)}%.")
            self._set_status(f"Avance #{tar_cod}", ok=True)
        except Exception as e:
            self._show_info("Avance", str(e))

    def _solo_subir_evidencias(self, cod: int, tipo: str, file_paths: list[str], on_ok):
        try:
            rutas = self._upload_evidencias(cod, tipo, file_paths)
            try:
                on_ok()
            except Exception:
                pass
            self._show_info("Evidencias", f"Se subieron {len(rutas)} archivo(s).")
            self._set_status(f"Evidencias #{cod}", ok=True)
            # Refrescar lista/detalle
            self.page.run_thread(lambda: self._load_detalle(cod, tipo))
        except Exception as e:
            self._show_info("Evidencias", str(e))

    def _actualizar_ticket(self, tic_cod: int, estado: str, file_paths: list[str], on_ok):
        try:
            if file_paths:
                self._upload_evidencias(tic_cod, "ticket", file_paths)
            per = int((self.dev_data or {}).get("Per_Cod") or 0)
            data = self._api_post(
                {
                    "accion": "cambiar_estado_ticket",
                    "Per_Cod": str(per),
                    "Tic_Cod": str(tic_cod),
                    "estado": estado,
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                }
            )
            if data.get("status") != "ok":
                self._show_info("Ticket", data.get("mensaje") or "No se pudo actualizar.")
                return
            payload = data.get("data") or {}
            self._apply_task_list(payload)
            try:
                on_ok()
            except Exception:
                pass
            self._show_info("Ticket", f"Ticket #{tic_cod} → {payload.get('estado') or estado}.")
            self._set_status(f"Ticket #{tic_cod}", ok=True)
        except Exception as e:
            self._show_info("Ticket", str(e))

    def _refresh_tasks_ui(self):
        visible = self._visible_tasks()
        self.dd_active.options = [
            ft.DropdownOption(
                key=str(t.get("Tar_Cod")),
                text=(t.get("label") or t.get("Tar_Titulo") or f"#{t.get('Tar_Cod')}")[:100],
            )
            for t in self.tasks_list
        ]
        if self.tasks_list:
            if not self.dd_active.value or self.dd_active.value not in {
                str(t.get("Tar_Cod")) for t in self.tasks_list
            }:
                self.dd_active.value = str(self.tasks_list[0].get("Tar_Cod"))
                self.selected_tar_cod = int(self.tasks_list[0].get("Tar_Cod") or 0)
        else:
            self.dd_active.value = None
            self.selected_tar_cod = 0

        n_tar = sum(1 for t in self.tasks_list if t.get("tipo") != "ticket")
        n_tic = sum(1 for t in self.tasks_list if t.get("tipo") == "ticket")
        if self._es_mesa():
            self.lbl_kpis.value = f"{n_tic} tickets por asignar"
            vacio = "No hay tickets nuevos."
        else:
            self.lbl_kpis.value = f"{len(self.tasks_list)} Asignaciones | {n_tar} tareas | {n_tic} tickets"
            vacio = "No hay tareas en este filtro."

        self.tasks_list_view.controls = [self._task_row(t) for t in visible] or [
            ft.Container(
                content=ft.Text(vacio, color=C["text_muted"], size=12),
                padding=20,
                alignment=ft.Alignment.CENTER,
            )
        ]
        self.page.update()

    def _apply_notificaciones(self, payload: dict):
        for n in payload.get("notificaciones") or []:
            titulo = (n.get("titulo") or n.get("title") or "Nueva asignacion").strip()
            msg = (n.get("mensaje") or n.get("message") or "").strip()
            if msg:
                self._show_info(titulo, msg)
                self._set_status(titulo[:36], ok=True)

    def _es_mesa(self) -> bool:
        return str((self.dev_data or {}).get("Rol") or "") in ("atencion", "manager")

    def _apply_rol_ui(self):
        if self._es_mesa():
            self.title_main.value = "Tickets por asignar"
            self.lbl_lista_titulo.value = "Tickets que llegan"
            self.lbl_lista_hint.value = "Clic para asignar"
            self.card_activa.visible = False
            self.seg_tipo.visible = False
            self.tipo_filtro = "ticket"
        else:
            self.title_main.value = "Mis tareas"
            self.lbl_lista_titulo.value = "Mis tareas"
            self.lbl_lista_hint.value = "Clic para marcar activa"
            self.card_activa.visible = True
            self.seg_tipo.visible = True

    def _update_ui_after_login(self):
        name = (self.dev_data or {}).get("Nombre") or "Desarrollador"
        self.subtitle.value = name
        self._apply_rol_ui()
        self._set_status("Conectado", ok=True)
        self.btn_login.text = "Sesión activa"
        self.btn_login.disabled = True
        self.btn_refresh.disabled = False
        self.tf_cedula.disabled = True
        self.tf_pass.disabled = True
        self.login_panel.visible = False
        self.topbar.visible = True
        self.workspace.visible = True
        self._refresh_tasks_ui()
        self.page.update()

    # --- API ---
    def action_login(self):
        server = SERVIDOR_FIJO.rstrip("/")
        cedula = (self.tf_cedula.value or "").strip()
        password = self.tf_pass.value or ""
        if not cedula or not password:
            self.login_error.value = "Ingresa cédula y contraseña de EXA."
            self.login_error.visible = True
            self.btn_login.disabled = False
            self.btn_login.text = "Iniciar sesión"
            self.page.update()
            return

        self.config["server_url"] = server
        self.config["cedula"] = cedula
        self.config["identificador"] = cedula
        self.config.pop("password", None)
        self.save_config()

        try:
            url = build_api_url(server, self.config.get("api_path"))
            resp = requests.post(
                url,
                data={
                    "accion": "login",
                    "cedula": cedula,
                    "password": password,
                    "identificador": cedula,
                    "Ses_Dat_Dis": self.config.get("db_dis", "exa"),
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                },
                timeout=12,
            )
            try:
                data = resp.json()
            except ValueError:
                body = (resp.text or "").strip().replace("\n", " ")[:180]
                raise RuntimeError(
                    f"HTTP {resp.status_code}: {body or 'respuesta vacia del servidor'}"
                )
            if data.get("status") == "ok":
                payload = data.get("data", {}) or {}
                dev = payload.get("desarrollador", {}) or {}
                tasks = payload.get("mis_tareas") or payload.get("tareas") or []
                self.dev_data = dev
                self.tasks_list = tasks
                self.asignables = payload.get("asignables") or []
                self.is_authenticated = True
                if dev.get("Db_Dis"):
                    self.config["db_dis"] = str(dev.get("Db_Dis"))
                    self.save_config()
                self.admin_mon_active = int(dev.get("Mon_Activo", 0))
                self.interval_minutes = max(1, int(dev.get("Mon_Intervalo_Minutos", 5)))
                self.captura_permitida = int(dev.get("Mon_Captura_Pantalla", 1))
                self.forzar_bandeja = int(dev.get("Mon_Forzar_Bandeja", 1))
                self.permitir_salir = int(dev.get("Mon_Permitir_Salir", 0))
                self.tf_pass.value = ""
                self._update_ui_after_login()
                self._apply_notificaciones(payload)
                self._start_background_workers()
            else:
                msg = data.get("mensaje", "Error de autenticación.")
                self.login_error.value = msg
                self.login_error.visible = True
                self.btn_login.disabled = False
                self.btn_login.text = "Iniciar sesión"
                self._set_status("Error de sesión")
                self.page.update()
        except Exception as e:
            self.login_error.value = str(e)
            self.login_error.visible = True
            self.btn_login.disabled = False
            self.btn_login.text = "Iniciar sesión"
            self._set_status("Error de sesión")
            self.page.update()

    def _manual_refresh(self):
        if self.is_authenticated:
            self._heartbeat_once(force_ui=True)

    def _start_background_workers(self):
        if self._workers_started:
            return
        self._workers_started = True
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()
        threading.Thread(target=self._telemetria_loop, daemon=True).start()
        threading.Thread(target=self._activity_loop, daemon=True).start()

    def _activity_loop(self):
        while self.running and self.is_authenticated:
            try:
                self._sample_activity()
            except Exception as e:
                print("actividad:", e)
            time.sleep(20)

    def _heartbeat_loop(self):
        while self.running and self.is_authenticated:
            try:
                self._heartbeat_once(force_ui=False)
            except Exception as e:
                print("heartbeat:", e)
            time.sleep(max(5, int(self.config.get("poll_interval_seconds", 10))))

    def _heartbeat_once(self, force_ui: bool):
        with self._hb_lock:
            per = int((self.dev_data or {}).get("Per_Cod") or 0)
            if per <= 0:
                return
            url = build_api_url(self.config.get("server_url"), self.config.get("api_path"))
            resp = requests.post(
                url,
                data={
                    "accion": "heartbeat",
                    "Per_Cod": str(per),
                    "ventana_activa": (self._fg_title or "EXA Monitor")[:250],
                    "proceso_activo": (self._fg_process or "ExaMonitor.exe")[:95],
                    "es_ide": "0",
                    "mac_address": self.mac_address,
                    "version_agente": AGENT_VERSION,
                },
                timeout=12,
            )
            data = resp.json()
            if data.get("status") != "ok":
                return
            payload = data.get("data", {}) or {}
            self.admin_mon_active = int(payload.get("Mon_Activo", self.admin_mon_active))
            self.interval_minutes = max(1, int(payload.get("Mon_Intervalo_Minutos", self.interval_minutes)))
            self.captura_permitida = int(payload.get("Mon_Captura_Pantalla", self.captura_permitida))
            self.forzar_bandeja = int(payload.get("Mon_Forzar_Bandeja", self.forzar_bandeja))
            self.permitir_salir = int(payload.get("Mon_Permitir_Salir", self.permitir_salir))
            self.tasks_list = payload.get("mis_tareas") or payload.get("tareas") or []
            if payload.get("Rol") and isinstance(self.dev_data, dict):
                self.dev_data["Rol"] = payload.get("Rol")
            if payload.get("asignables") is not None:
                self.asignables = payload.get("asignables") or []
            notes = list(payload.get("notificaciones") or [])
            try:
                self._apply_rol_ui()
                self._refresh_tasks_ui()
                if force_ui:
                    self._set_status(f"{len(self.tasks_list)} Asignaciones", ok=True)
                for n in notes:
                    titulo = (n.get("titulo") or "Nueva asignacion").strip()
                    msg = (n.get("mensaje") or "").strip()
                    if msg:
                        self._show_info(titulo, msg)
            except Exception as err:
                print("ui refresh:", err)

    def _telemetria_loop(self):
        while self.running and self.is_authenticated:
            try:
                if int(self.admin_mon_active) == 1:
                    self._subir_telemetria()
            except Exception as e:
                print("telemetria:", e)
            time.sleep(max(60, int(self.interval_minutes) * 60))

    def _subir_telemetria(self):
        per = int((self.dev_data or {}).get("Per_Cod") or 0)
        if per <= 0:
            return
        url = build_api_url(self.config.get("server_url"), self.config.get("api_path"))
        porc, ventana, proceso, clicks, teclas = self._consume_activity()
        data = {
            "accion": "subir_telemetria",
            "Per_Cod": str(per),
            "Tar_Cod": str(self.selected_tar_cod or ""),
            "clicks": str(clicks),
            "teclas": str(teclas),
            "segundos_activos": str(max(30, int(self.interval_minutes) * 30)),
            "porc_actividad": str(porc),
            "ventana_activa": ventana,
            "proceso_activo": proceso,
            "es_ide": "1" if any(x in proceso.lower() for x in ("code", "cursor", "devenv", "idea", "pycharm")) else "0",
            "lineas_estimadas": "0",
            "mac_address": self.mac_address,
            "version_agente": AGENT_VERSION,
        }
        files = None
        if int(self.captura_permitida) == 1:
            try:
                from screen_capture import screenshot_multipart

                shot = screenshot_multipart("screenshot")
                if shot:
                    files = {"screenshot": shot[1]}
            except Exception as e:
                print("captura pantalla:", e)
        try:
            resp = requests.post(url, data=data, files=files, timeout=45)
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            if payload.get("status") == "ok":
                info = payload.get("data") or {}
                if files and not info.get("captura_guardada"):
                    print("telemetria ok pero captura_guardada=false")
            elif payload.get("mensaje"):
                print("telemetria:", payload.get("mensaje"))
        except Exception as e:
            print("telemetria post:", e)


def main(page: ft.Page):
    ExaMonitorApp(page)


def _assets_dir() -> str:
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS", Path(sys.executable).resolve().parent))
        candidate = base / "assets"
        if candidate.exists():
            return str(candidate)
        beside = Path(sys.executable).resolve().parent / "assets"
        if beside.exists():
            return str(beside)
    return str(Path(__file__).resolve().parent / "assets")


if __name__ == "__main__":
    ft.run(main, assets_dir=_assets_dir())

