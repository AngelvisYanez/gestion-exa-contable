# -*- coding: utf-8 -*-
"""ExaMonitor: login con cedula + contraseña EXA (sin auto-login)."""
from pathlib import Path

AGENT = Path(
    r"C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-tareas-app\agente_monitoreo\exa_agent.py"
)
CONFIG = AGENT.with_name("config.json")
text = AGENT.read_text(encoding="utf-8")

text = text.replace('AGENT_VERSION = "1.5"', 'AGENT_VERSION = "1.6"')
text = text.replace('AGENT_VERSION = "1.4"', 'AGENT_VERSION = "1.6"')

# Default config: no hardcoded Per_Cod
old_default = '''DEFAULT_CONFIG = {
    "server_url": "http://localhost:3000",
    "api_path": "/api/monitoreo",
    "db_dis": "exa",
    "identificador": "1409",
    "poll_interval_seconds": 10,
    "auto_minimize": True,
    "default_interval_minutes": 5
}
'''
new_default = '''DEFAULT_CONFIG = {
    "server_url": "http://localhost:3000",
    "api_path": "/api/monitoreo",
    "db_dis": "exa",
    "identificador": "",
    "cedula": "",
    "poll_interval_seconds": 10,
    "auto_minimize": True,
    "default_interval_minutes": 5
}
'''
if old_default in text:
    text = text.replace(old_default, new_default)
    print("default config: ok")
else:
    print("WARN: default config block not found")

# Don't auto-minimize / auto-login before credentials
old_boot = '''        self._build_ui()
        # Al ejecutarse: minimizar a la barra de tareas (predeterminado)
        if self.var_auto_minimize.get():
            self.root.after(80, self.action_minimize)
        self._check_initial_login()
'''
new_boot = '''        self._build_ui()
        # Esperar cédula + contraseña: no auto-login ni minimizar hasta autenticar.
'''
if old_boot in text:
    text = text.replace(old_boot, new_boot)
    print("boot: ok")
else:
    print("WARN: boot block not found")

# UI fields: cedula + password
old_fields = '''        tk.Label(form_grid, text="Cédula / Per_Cod:", font=("Segoe UI", 8), fg="#94A3B8", bg="#1E293B").grid(row=1, column=0, sticky="w", pady=2)
        self.entry_id = tk.Entry(form_grid, font=("Segoe UI", 9), bg="#0F172A", fg="#F8FAFC", insertbackground="#38BDF8", relief="flat")
        self.entry_id.insert(0, self.config.get("identificador", "1409"))
        self.entry_id.grid(row=1, column=1, sticky="ew", padx=(8, 0), pady=2)

        tk.Label(form_grid, text="MAC del equipo:", font=("Segoe UI", 8), fg="#94A3B8", bg="#1E293B").grid(row=2, column=0, sticky="w", pady=2)
        self.lbl_mac = tk.Label(form_grid, text=self.mac_address, font=("Segoe UI", 9, "bold"), fg="#38BDF8", bg="#1E293B")
        self.lbl_mac.grid(row=2, column=1, sticky="w", padx=(8, 0), pady=2)
'''

# Try both encoding variants of Cedula label
for old_label in ("Cédula / Per_Cod:", "Cédula / Per_Cod:", "C\u00e9dula / Per_Cod:"):
    pass

# More robust: find by entry_id insert pattern
import re
pat = re.compile(
    r'tk\.Label\(form_grid, text="[^"]*Per_Cod[^"]*", font=\("Segoe UI", 8\), fg="#94A3B8", bg="#1E293B"\)\.grid\(row=1, column=0, sticky="w", pady=2\)\n'
    r'\s*self\.entry_id = tk\.Entry\(form_grid, font=\("Segoe UI", 9\), bg="#0F172A", fg="#F8FAFC", insertbackground="#38BDF8", relief="flat"\)\n'
    r'\s*self\.entry_id\.insert\(0, self\.config\.get\("identificador", "[^"]*"\)\)\n'
    r'\s*self\.entry_id\.grid\(row=1, column=1, sticky="ew", padx=\(8, 0\), pady=2\)\n\n'
    r'\s*tk\.Label\(form_grid, text="MAC del equipo:", font=\("Segoe UI", 8\), fg="#94A3B8", bg="#1E293B"\)\.grid\(row=2, column=0, sticky="w", pady=2\)\n'
    r'\s*self\.lbl_mac = tk\.Label\(form_grid, text=self\.mac_address, font=\("Segoe UI", 9, "bold"\), fg="#38BDF8", bg="#1E293B"\)\n'
    r'\s*self\.lbl_mac\.grid\(row=2, column=1, sticky="w", padx=\(8, 0\), pady=2\)\n',
    re.M,
)

new_fields = '''        tk.Label(form_grid, text="Cedula EXA:", font=("Segoe UI", 8), fg="#94A3B8", bg="#1E293B").grid(row=1, column=0, sticky="w", pady=2)
        self.entry_id = tk.Entry(form_grid, font=("Segoe UI", 9), bg="#0F172A", fg="#F8FAFC", insertbackground="#38BDF8", relief="flat")
        self.entry_id.insert(0, self.config.get("cedula") or self.config.get("identificador", ""))
        self.entry_id.grid(row=1, column=1, sticky="ew", padx=(8, 0), pady=2)

        tk.Label(form_grid, text="Contrasena EXA:", font=("Segoe UI", 8), fg="#94A3B8", bg="#1E293B").grid(row=2, column=0, sticky="w", pady=2)
        self.entry_pass = tk.Entry(form_grid, font=("Segoe UI", 9), bg="#0F172A", fg="#F8FAFC", insertbackground="#38BDF8", relief="flat", show="*")
        self.entry_pass.grid(row=2, column=1, sticky="ew", padx=(8, 0), pady=2)

        tk.Label(form_grid, text="MAC del equipo:", font=("Segoe UI", 8), fg="#94A3B8", bg="#1E293B").grid(row=3, column=0, sticky="w", pady=2)
        self.lbl_mac = tk.Label(form_grid, text=self.mac_address, font=("Segoe UI", 9, "bold"), fg="#38BDF8", bg="#1E293B")
        self.lbl_mac.grid(row=3, column=1, sticky="w", padx=(8, 0), pady=2)
'''

m = pat.search(text)
if m:
    text = text[: m.start()] + new_fields + text[m.end() :]
    print("fields: ok")
else:
    print("WARN: fields pattern not found")

# Move bandeja policy to row 4 if still row 3
text = text.replace(
    'self.lbl_bandeja_policy.grid(row=3, column=0, columnspan=2, sticky="w", pady=(6, 2))',
    'self.lbl_bandeja_policy.grid(row=4, column=0, columnspan=2, sticky="w", pady=(6, 2))',
)

# Replace login methods
old_login = '''    def _check_initial_login(self):
        # Intentar conectar automáticamente al inicio
        threading.Thread(target=self.action_login, daemon=True).start()

    def action_login(self):
        server = self.entry_server.get().strip().rstrip("/")
        ident = self.entry_id.get().strip()

        if not server or not ident:
            return

        self.config["server_url"] = server
        self.config["identificador"] = ident
        self.save_config()

        self.root.after(0, lambda: self.btn_conectar.config(text="Conectando...", state="disabled"))

        try:
            url = build_api_url(server, self.config.get("api_path"))
            resp = requests.post(url, data={
                "accion": "login",
                "identificador": ident,
                "Ses_Dat_Dis": self.config.get("db_dis", "exa"),
                "mac_address": self.mac_address,
                "version_agente": AGENT_VERSION
            }, timeout=8)

            data = resp.json()
            if data.get("status") == "ok":
                dev = data.get("data", {}).get("desarrollador", {})
                tasks = data.get("data", {}).get("tareas", [])

                self.dev_data = dev
                self.tasks_list = tasks
                self.is_authenticated = True
                self.admin_mon_active = int(dev.get("Mon_Activo", 0))
                self.interval_minutes = max(1, int(dev.get("Mon_Intervalo_Minutos", 5)))
                self.captura_permitida = int(dev.get("Mon_Captura_Pantalla", 1))

                self.root.after(0, self._update_ui_after_login)
                self._start_background_workers()
            else:
                msg = data.get("mensaje", "Error de autenticación.")
                self.root.after(0, lambda: self._on_login_fail(msg))

        except Exception as e:
            self.root.after(0, lambda: self._on_login_fail(str(e)))
'''

# The file may have encoding differences in comments - use regex for the whole block
login_pat = re.compile(
    r"    def _check_initial_login\(self\):.*?    def _update_ui_after_login\(self\):",
    re.S,
)

new_login = '''    def _check_initial_login(self):
        # Ya no hay auto-login: el desarrollador debe ingresar cedula + contraseña.
        return

    def action_login(self):
        server = self.entry_server.get().strip().rstrip("/")
        cedula = self.entry_id.get().strip()
        password = self.entry_pass.get() if hasattr(self, "entry_pass") else ""

        if not server or not cedula or not password:
            self.root.after(0, lambda: self._on_login_fail("Ingresa cedula y contraseña EXA."))
            return

        self.config["server_url"] = server
        self.config["cedula"] = cedula
        self.config["identificador"] = cedula
        # Nunca persistir la contraseña en disco
        self.config.pop("password", None)
        self.save_config()

        self.root.after(0, lambda: self.btn_conectar.config(text="Autenticando...", state="disabled"))

        try:
            url = build_api_url(server, self.config.get("api_path"))
            resp = requests.post(url, data={
                "accion": "login",
                "cedula": cedula,
                "password": password,
                "identificador": cedula,
                "Ses_Dat_Dis": self.config.get("db_dis", "exa"),
                "mac_address": self.mac_address,
                "version_agente": AGENT_VERSION
            }, timeout=12)

            data = resp.json()
            if data.get("status") == "ok":
                payload = data.get("data", {}) or {}
                dev = payload.get("desarrollador", {}) or {}
                tasks = payload.get("tareas", []) or []

                self.dev_data = dev
                self.tasks_list = tasks
                self.is_authenticated = True
                if dev.get("Db_Dis"):
                    self.config["db_dis"] = str(dev.get("Db_Dis"))
                    self.save_config()
                self.admin_mon_active = int(dev.get("Mon_Activo", 0))
                self.interval_minutes = max(1, int(dev.get("Mon_Intervalo_Minutos", 5)))
                self.captura_permitida = int(dev.get("Mon_Captura_Pantalla", 1))
                self.forzar_bandeja = int(dev.get("Mon_Forzar_Bandeja", 1))
                self.permitir_salir = int(dev.get("Mon_Permitir_Salir", 0))

                # Limpiar contraseña de la UI tras login OK
                try:
                    self.root.after(0, lambda: self.entry_pass.delete(0, "end"))
                except Exception:
                    pass

                self.root.after(0, self._update_ui_after_login)
                self._start_background_workers()
            else:
                msg = data.get("mensaje", "Error de autenticacion.")
                self.root.after(0, lambda m=msg: self._on_login_fail(m))

        except Exception as e:
            self.root.after(0, lambda err=str(e): self._on_login_fail(err))

    def _update_ui_after_login(self):
'''

m2 = login_pat.search(text)
if m2:
    text = text[: m2.start()] + new_login + text[m2.end() :]
    print("login: ok")
else:
    print("WARN: login block not found")

# Button text
text = text.replace(
    'self.btn_conectar = tk.Button(c1, text="Conectar y Sincronizar"',
    'self.btn_conectar = tk.Button(c1, text="Iniciar sesion EXA"',
)

AGENT.write_text(text, encoding="utf-8")
print("agent written")

# Fix local config.json: clear random identificador
import json
if CONFIG.exists():
    try:
        cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
        if str(cfg.get("identificador", "")) == "1409":
            cfg["identificador"] = ""
        cfg["cedula"] = cfg.get("cedula") or ""
        cfg.pop("password", None)
        CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("config.json cleaned")
    except Exception as e:
        print("config clean fail:", e)
