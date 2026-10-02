# -*- coding: utf-8 -*-
"""
Parche ExaMonitor: mostrar popups cuando el heartbeat trae `notificaciones`
(tarea_asignada / ticket_asignado).

Requiere exa_agent.py en:
  agente_monitoreo/exa_agent.py
Luego recompilar el .exe.
"""
from pathlib import Path
import re

AGENT = Path(
    r"C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-tareas-app\agente_monitoreo\exa_agent.py"
)
if not AGENT.exists():
    raise SystemExit(f"No se encontro {AGENT}. Restaura el .py y vuelve a ejecutar este parche.")

text = AGENT.read_text(encoding="utf-8")

HELPER = '''
    def _apply_server_notificaciones(self, payload):
        """Muestra avisos de tareas/tickets recien asignados (API notificaciones)."""
        notes = (payload or {}).get("notificaciones") or []
        if not notes:
            return
        try:
            from tkinter import messagebox
        except Exception:
            messagebox = None
        for n in notes:
            titulo = (n.get("titulo") or n.get("title") or "Nueva asignacion").strip()
            msg = (n.get("mensaje") or n.get("message") or "").strip()
            if not msg:
                continue
            def _show(t=titulo, m=msg):
                try:
                    if messagebox:
                        messagebox.showinfo(t, m)
                except Exception:
                    pass
                try:
                    self.lbl_status.config(text=f"{t}: {m}"[:120])
                except Exception:
                    pass
            try:
                self.root.after(0, _show)
            except Exception:
                _show()
'''

if "_apply_server_notificaciones" not in text:
    # Insert before _update_ui_after_login or at class end of methods
    m = re.search(r"\n    def _update_ui_after_login\(self\):", text)
    if m:
        text = text[: m.start()] + "\n" + HELPER + text[m.start() :]
        print("helper: ok")
    else:
        print("WARN: no se encontro _update_ui_after_login")

# Call after login success when tasks are applied
needle_login = "self.tasks_list = tasks"
if "self._apply_server_notificaciones(payload)" not in text:
    # Prefer the new auth payload pattern
    if "payload = data.get(\"data\", {}) or {}" in text and "self.tasks_list = tasks" in text:
        text = text.replace(
            "self.tasks_list = tasks",
            "self.tasks_list = tasks\n                self._apply_server_notificaciones(payload)",
            1,
        )
        print("login hook: ok")
    else:
        print("WARN: login hook pattern not found")

# Heartbeat: find where tareas are refreshed and add notificaciones
# Common pattern: tasks = data.get("data", {}).get("tareas"
hb_patterns = [
    (
        'tasks = data.get("data", {}).get("tareas", [])',
        'tasks = data.get("data", {}).get("tareas", [])\n'
        '                self._apply_server_notificaciones(data.get("data", {}) or {})',
    ),
    (
        'tasks = payload.get("tareas", []) or []',
        'tasks = payload.get("tareas", []) or []\n'
        '                # notificaciones handled elsewhere',
    ),
]

# More robust: after any assignment of tasks_list in heartbeat workers
if "self._apply_server_notificaciones(data.get(\"data\"" not in text and '_apply_server_notificaciones(payload)' in text:
    # Add to heartbeat if we find check_status / heartbeat response handling
    m2 = re.search(
        r'(self\.tasks_list\s*=\s*tasks\s*\n)',
        text,
    )
    # Count occurrences - patch ones that don't already have apply after
    parts = text.split("self.tasks_list = tasks")
    if len(parts) > 2:
        rebuilt = parts[0]
        for i, part in enumerate(parts[1:], 1):
            rebuilt += "self.tasks_list = tasks"
            if i == 1:
                # login already patched possibly
                if not part.lstrip().startswith("\n                self._apply_server_notificaciones"):
                    pass
            if "self._apply_server_notificaciones" not in part[:80]:
                # only add once more for heartbeat
                pass
            rebuilt += part
        # Simpler approach below

if 'self._apply_server_notificaciones(data.get("data"' not in text:
    # Look for heartbeat JSON handling
    hb = re.search(
        r'def _?(?:poll|heartbeat|check_status|sync_status).*?:\n(?:.*\n)*?.*?tasks_list\s*=\s*tasks',
        text,
    )
    # Fallback: replace second occurrence of tasks_list = tasks
    idxs = [m.start() for m in re.finditer(r"self\.tasks_list = tasks", text)]
    if len(idxs) >= 2:
        i = idxs[1]
        insert = 'self.tasks_list = tasks\n                self._apply_server_notificaciones(data.get("data", {}) or {})'
        # check context for payload vs data
        ctx = text[max(0, i - 200) : i + 80]
        if "payload.get" in ctx:
            insert = 'self.tasks_list = tasks\n                self._apply_server_notificaciones(payload)'
        end = i + len("self.tasks_list = tasks")
        if "_apply_server_notificaciones" not in text[end : end + 60]:
            text = text[:i] + insert + text[end:]
            print("heartbeat hook: ok")
    else:
        print("WARN: heartbeat tasks_list occurrence not found (agent may refresh differently)")

AGENT.write_text(text, encoding="utf-8")
print("Wrote", AGENT)
print("Recompila ExaMonitor.exe para que muestre los popups de asignacion.")
