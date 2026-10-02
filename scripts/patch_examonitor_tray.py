# -*- coding: utf-8 -*-
"""
Parche ExaMonitor: bandeja del sistema + directivas admin
(Mon_Forzar_Bandeja / Mon_Permitir_Salir).
"""
from pathlib import Path

AGENT = Path(
    r"C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-tareas-app\agente_monitoreo\exa_agent.py"
)
text = AGENT.read_text(encoding="utf-8")

# Version bump
text = text.replace('AGENT_VERSION = "1.4"', 'AGENT_VERSION = "1.5"')
text = text.replace('AGENT_VERSION = "1.3"', 'AGENT_VERSION = "1.5"')

# Import pystray after PIL
if "import pystray" not in text:
    text = text.replace(
        "from PIL import Image, ImageGrab\n",
        "from PIL import Image, ImageGrab\n"
        "try:\n"
        "    import pystray\n"
        "    from pystray import MenuItem as TrayMenuItem\n"
        "    PYSTRAY_AVAILABLE = True\n"
        "except Exception:\n"
        "    PYSTRAY_AVAILABLE = False\n"
        "    pystray = None\n"
        "    TrayMenuItem = None\n",
    )

# Replace init state for tray directives
old_state = """        self.admin_mon_active = 0
        self.interval_minutes = max(1, int(self.config.get("default_interval_minutes", 5)))
        self.captura_permitida = 1
        self.last_sync_time = "Nunca"
"""
new_state = """        self.admin_mon_active = 0
        self.interval_minutes = max(1, int(self.config.get("default_interval_minutes", 5)))
        self.captura_permitida = 1
        # Directivas de bandeja (solo dashboard encargados). Defaults seguros anti-manipulación.
        self.forzar_bandeja = 1
        self.permitir_salir = 0
        self.tray_icon = None
        self._tray_thread = None
        self._in_tray = False
        self.last_sync_time = "Nunca"
"""
if old_state in text:
    text = text.replace(old_state, new_state)
else:
    print("WARN: state block not found")

# Replace action_minimize / toggle / add tray methods before _set_window_icon
old_min = '''    def action_minimize(self):
        """Minimiza la ventana a segundo plano (barra de tareas)"""
        try:
            self.root.iconify()
        except Exception as e:
            print("Error al minimizar:", e)

    def _on_toggle_auto_minimize(self):
        self.config["auto_minimize"] = self.var_auto_minimize.get()
        self.save_config()
'''

new_min = '''    def action_minimize(self):
        """Minimiza a bandeja del sistema (si admin lo fuerza) o a la barra de tareas."""
        if int(self.forzar_bandeja) == 1:
            self.hide_to_tray()
        else:
            try:
                self.root.iconify()
            except Exception as e:
                print("Error al minimizar:", e)

    def _on_toggle_auto_minimize(self):
        # Bloqueado: solo el dashboard de encargados puede cambiar la política de bandeja.
        self.var_auto_minimize.set(True)
        try:
            from tkinter import messagebox
            messagebox.showinfo(
                "Controlado por el administrador",
                "Minimizar/cerrar a la bandeja del sistema lo configura el encargado "
                "desde el Dashboard EXA. No se puede cambiar en este equipo.",
            )
        except Exception:
            pass

    def hide_to_tray(self):
        """Oculta la ventana y deja el icono en la bandeja (área de notificación)."""
        try:
            self._ensure_tray()
            self.root.withdraw()
            self._in_tray = True
        except Exception as e:
            print("Error al ocultar a bandeja:", e)
            try:
                self.root.iconify()
            except Exception:
                pass

    def show_from_tray(self, icon=None, item=None):
        self.root.after(0, self._show_window_ui)

    def _show_window_ui(self):
        try:
            self.root.deiconify()
            self.root.lift()
            self.root.focus_force()
            self._in_tray = False
        except Exception as e:
            print("Error al mostrar ventana:", e)

    def _tray_image(self):
        for name in ("exa-logo-header.png", "exa-logo.png", "exa-logo.ico"):
            p = resource_path(name)
            if os.path.exists(p):
                try:
                    img = Image.open(p).convert("RGBA")
                    img = img.resize((64, 64), Image.Resampling.LANCZOS)
                    return img
                except Exception:
                    continue
        # Fallback simple
        return Image.new("RGBA", (64, 64), (56, 189, 248, 255))

    def _tray_menu(self):
        items = [
            TrayMenuItem("Abrir EXA Monitor", self.show_from_tray, default=True),
        ]
        if int(self.permitir_salir) == 1:
            items.append(TrayMenuItem("Salir", self._quit_from_tray))
        else:
            items.append(
                TrayMenuItem(
                    "Salir (bloqueado por admin)",
                    None,
                    enabled=False,
                )
            )
        return pystray.Menu(*items)

    def _ensure_tray(self):
        if not PYSTRAY_AVAILABLE:
            print("pystray no disponible: se usará minimizar normal.")
            return
        if self.tray_icon is not None:
            try:
                self.tray_icon.update_menu()
            except Exception:
                pass
            return

        def run_icon():
            try:
                self.tray_icon = pystray.Icon(
                    "ExaMonitor",
                    self._tray_image(),
                    "EXA Monitor",
                    self._tray_menu(),
                )
                self.tray_icon.run()
            except Exception as e:
                print("Error bandeja del sistema:", e)
                self.tray_icon = None

        self._tray_thread = threading.Thread(target=run_icon, daemon=True)
        self._tray_thread.start()

    def _refresh_tray_menu(self):
        if self.tray_icon is None or not PYSTRAY_AVAILABLE:
            return
        try:
            self.tray_icon.menu = self._tray_menu()
            self.tray_icon.update_menu()
        except Exception:
            pass

    def _quit_from_tray(self, icon=None, item=None):
        if int(self.permitir_salir) != 1:
            return
        self.root.after(0, self._quit_app)

    def _quit_app(self):
        self.running = False
        try:
            if self.tray_icon is not None:
                self.tray_icon.stop()
        except Exception:
            pass
        try:
            self.root.destroy()
        except Exception:
            pass
        sys.exit(0)

    def _on_unmap(self, event):
        # Botón minimizar de Windows → bandeja si el admin lo fuerza
        if event.widget is not self.root:
            return
        if int(self.forzar_bandeja) != 1:
            return
        try:
            if self.root.state() == "iconic":
                self.root.after(10, self.hide_to_tray)
        except Exception:
            pass
'''

if old_min in text:
    text = text.replace(old_min, new_min)
    print("minimize/tray methods: ok")
else:
    print("WARN: minimize block not found")

# Replace checkbox UI text and disable local control messaging
old_chk = '''        # Checkbox Auto-minimizar
        chk_min = tk.Checkbutton(form_grid, text="Minimizar a la barra de tareas al iniciar / conectar",
                                 variable=self.var_auto_minimize, font=("Segoe UI", 8),
                                 fg="#94A3B8", bg="#1E293B", selectcolor="#0F172A", activebackground="#1E293B", activeforeground="#F8FAFC",
                                 command=self._on_toggle_auto_minimize)
        chk_min.grid(row=3, column=0, columnspan=2, sticky="w", pady=(6, 2))
'''

new_chk = '''        # Política de bandeja: solo lectura local (controlada por encargados en Dashboard)
        self.var_auto_minimize.set(True)
        self.lbl_bandeja_policy = tk.Label(
            form_grid,
            text="Bandeja del sistema: controlada por el Dashboard de encargados",
            font=("Segoe UI", 8),
            fg="#64748B",
            bg="#1E293B",
            wraplength=360,
            justify="left",
            cursor="hand2",
        )
        self.lbl_bandeja_policy.grid(row=3, column=0, columnspan=2, sticky="w", pady=(6, 2))
        self.lbl_bandeja_policy.bind("<Button-1>", lambda _e: self._on_toggle_auto_minimize())
'''

if old_chk in text:
    text = text.replace(old_chk, new_chk)
    print("checkbox: ok")
else:
    print("WARN: checkbox not found")

# After _build_ui starts workers schedule, bind unmap - find end of _build_ui
needle = "        # Iniciar timer de actualización de UI\n        self._schedule_ui_tick()\n"
bind = (
    "        # Iniciar timer de actualización de UI\n"
    "        self._schedule_ui_tick()\n"
    "        # Minimizar nativo de Windows → bandeja si admin lo fuerza\n"
    "        self.root.bind(\"<Unmap>\", self._on_unmap)\n"
    "        # Arrancar icono de bandeja listo (aunque la ventana esté visible)\n"
    "        self.root.after(200, self._ensure_tray)\n"
)
if needle in text and 'self.root.bind("<Unmap>"' not in text:
    text = text.replace(needle, bind)
    print("unmap bind: ok")

# Refresh admin UI to show tray policy
old_refresh = '''    def _refresh_admin_status_ui(self):
        if self.admin_mon_active == 1:
            self.lbl_admin_badge.config(text="🟢 MONITOREO ACTIVO (SUPERVISIÓN EN VIVO)", fg="#10B981")
            self.lbl_admin_detail.config(
                text=f"Monitoreo habilitado por el Administrador. Captura cada {self.interval_minutes} min. Captura de pantalla: {'SÍ' if self.captura_permitida else 'NO'}. MAC: {self.mac_address}."
            )
        else:
            self.lbl_admin_badge.config(text="⏸️ MONITOREO EN PAUSA (POR ADMINISTRADOR)", fg="#F59E0B")
            self.lbl_admin_detail.config(
                text="El administrador tiene el monitoreo pausado. El agente no enviará capturas hasta que el Administrador lo active."
            )
'''

new_refresh = '''    def _refresh_admin_status_ui(self):
        bandeja = "bandeja FORZADA" if int(self.forzar_bandeja) == 1 else "bandeja opcional"
        salir = "salida PERMITIDA" if int(self.permitir_salir) == 1 else "salida BLOQUEADA"
        if hasattr(self, "lbl_bandeja_policy"):
            self.lbl_bandeja_policy.config(
                text=f"Política admin: {bandeja} · {salir} (solo Dashboard encargados)"
            )
        if self.admin_mon_active == 1:
            self.lbl_admin_badge.config(text="🟢 MONITOREO ACTIVO (SUPERVISIÓN EN VIVO)", fg="#10B981")
            self.lbl_admin_detail.config(
                text=(
                    f"Monitoreo habilitado por el Administrador. Captura cada {self.interval_minutes} min. "
                    f"Captura de pantalla: {'SÍ' if self.captura_permitida else 'NO'}. "
                    f"{bandeja.capitalize()} · {salir}. MAC: {self.mac_address}."
                )
            )
        else:
            self.lbl_admin_badge.config(text="⏸️ MONITOREO EN PAUSA (POR ADMINISTRADOR)", fg="#F59E0B")
            self.lbl_admin_detail.config(
                text=(
                    "El administrador tiene el monitoreo pausado. El agente no enviará capturas hasta que lo active. "
                    f"{bandeja.capitalize()} · {salir}."
                )
            )
        self._refresh_tray_menu()
'''

if old_refresh in text:
    text = text.replace(old_refresh, new_refresh)
    print("refresh ui: ok")
else:
    print("WARN: refresh ui not found")

# Apply directives from heartbeat
old_hb = '''                        self.admin_mon_active = int(st.get("Mon_Activo", 0))
                        self.interval_minutes = max(1, int(st.get("Mon_Intervalo_Minutos", 5)))
                        self.captura_permitida = int(st.get("Mon_Captura_Pantalla", 1))
'''
new_hb = '''                        self.admin_mon_active = int(st.get("Mon_Activo", 0))
                        self.interval_minutes = max(1, int(st.get("Mon_Intervalo_Minutos", 5)))
                        self.captura_permitida = int(st.get("Mon_Captura_Pantalla", 1))
                        self.forzar_bandeja = int(st.get("Mon_Forzar_Bandeja", self.forzar_bandeja if hasattr(self, "forzar_bandeja") else 1))
                        self.permitir_salir = int(st.get("Mon_Permitir_Salir", self.permitir_salir if hasattr(self, "permitir_salir") else 0))
'''
if old_hb in text:
    text = text.replace(old_hb, new_hb)
    print("heartbeat: ok")
else:
    print("WARN: heartbeat not found")

# Also apply on login success - find where admin_mon_active is set from login
# Search for Mon_Activo in login success path
if "self.admin_mon_active = int(self.dev_data.get" in text or 'self.admin_mon_active = int(dev.get' in text:
    pass

# Patch on_close
old_close = '''    def on_close(self):
        self.running = False
        self.root.destroy()
        sys.exit(0)
'''
new_close = '''    def on_close(self):
        # Cerrar (X): a bandeja si el admin fuerza; salir solo si admin lo permite.
        if int(self.forzar_bandeja) == 1 and int(self.permitir_salir) != 1:
            self.hide_to_tray()
            return
        if int(self.permitir_salir) != 1 and int(self.forzar_bandeja) == 1:
            self.hide_to_tray()
            return
        if int(self.permitir_salir) != 1:
            # Sin permiso de salir: siempre a bandeja
            self.hide_to_tray()
            return
        self._quit_app()
'''
if old_close in text:
    text = text.replace(old_close, new_close)
    print("on_close: ok")
else:
    print("WARN: on_close not found")

# Apply login directives from desarrollador payload
# Look for typical assignment after login
marker = "self._refresh_admin_status_ui()"
# Find first occurrence in login success - add directives before refresh
login_apply = '''
        self.forzar_bandeja = int(self.dev_data.get("Mon_Forzar_Bandeja", 1))
        self.permitir_salir = int(self.dev_data.get("Mon_Permitir_Salir", 0))
'''
# Insert before self._refresh_admin_status_ui() that follows login - only once near tasks
idx = text.find("self._refresh_admin_status_ui()")
if idx > 0 and "Mon_Forzar_Bandeja" not in text[idx - 200 : idx]:
    # Find the one after combo_tasks in login success
    needle2 = "            self.combo_tasks.current(0)\n\n        self._refresh_admin_status_ui()"
    if needle2 in text:
        text = text.replace(
            needle2,
            "            self.combo_tasks.current(0)\n\n"
            "        self.forzar_bandeja = int(self.dev_data.get(\"Mon_Forzar_Bandeja\", 1))\n"
            "        self.permitir_salir = int(self.dev_data.get(\"Mon_Permitir_Salir\", 0))\n"
            "        self._refresh_admin_status_ui()",
        )
        print("login apply: ok")
    else:
        print("WARN: login apply target not found")

AGENT.write_text(text, encoding="utf-8")
print("Wrote", AGENT)
