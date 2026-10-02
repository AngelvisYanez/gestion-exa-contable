# -*- coding: utf-8 -*-
"""Parchea ExaMonitor para usar el logo EXA Contable."""
from pathlib import Path

AGENT = Path(
    r"C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-tareas-app\agente_monitoreo\exa_agent.py"
)
SPEC = AGENT.with_name("ExaMonitor.spec")
BAT = AGENT.with_name("build_exe.bat")

text = AGENT.read_text(encoding="utf-8")

helper = '''
def resource_path(relative_path):
    """Ruta de recursos (dev y PyInstaller --onefile)."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), relative_path)


'''

if "def resource_path(" not in text:
    if 'AGENT_VERSION = "1.3"' in text:
        text = text.replace('AGENT_VERSION = "1.3"\n', 'AGENT_VERSION = "1.4"\n' + helper)
    elif 'AGENT_VERSION = "1.4"' in text:
        text = text.replace('AGENT_VERSION = "1.4"\n', 'AGENT_VERSION = "1.4"\n' + helper)
else:
    text = text.replace('AGENT_VERSION = "1.3"', 'AGENT_VERSION = "1.4"')

old_init = """        self.root.title(\"EXA Monitor - Control de Rendimiento\")
        self.root.geometry(\"480x640\")
        self.root.minsize(440, 560)
        self.root.configure(bg=\"#0F172A\")
"""

new_init = """        self.root.title(\"EXA Monitor - Control de Rendimiento\")
        self.root.geometry(\"480x640\")
        self.root.minsize(440, 560)
        self.root.configure(bg=\"#0F172A\")
        self._logo_photo = None
        self._set_window_icon()
"""

if old_init in text and "self._set_window_icon()" not in text:
    text = text.replace(old_init, new_init)

method = '''
    def _set_window_icon(self):
        """Icono de ventana / barra de tareas con logo EXA Contable."""
        try:
            ico = resource_path("exa-logo.ico")
            if os.path.exists(ico):
                self.root.iconbitmap(ico)
                return
        except Exception:
            pass
        try:
            from PIL import ImageTk
            png = resource_path("exa-logo-header.png")
            if os.path.exists(png):
                img = Image.open(png)
                self._logo_photo = ImageTk.PhotoImage(img)
                self.root.iconphoto(True, self._logo_photo)
        except Exception as e:
            print("No se pudo cargar icono EXA:", e)

'''

if "def _set_window_icon" not in text:
    text = text.replace("    def _build_ui(self):", method + "    def _build_ui(self):")

old_header = """        lbl_logo = tk.Label(header, text=\"🛡️ EXA MONITOR\", font=(\"Segoe UI\", 15, \"bold\"), fg=\"#38BDF8\", bg=\"#1E293B\")
        lbl_logo.pack(side=\"left\", padx=16, pady=12)
"""

new_header = """        brand = tk.Frame(header, bg=\"#1E293B\")
        brand.pack(side=\"left\", padx=16, pady=8)

        logo_path = resource_path(\"exa-logo-header.png\")
        try:
            from PIL import ImageTk
            if os.path.exists(logo_path):
                logo_img = Image.open(logo_path)
                self._logo_photo = ImageTk.PhotoImage(logo_img)
                tk.Label(brand, image=self._logo_photo, bg=\"#1E293B\").pack(side=\"left\")
            else:
                raise FileNotFoundError(logo_path)
        except Exception:
            tk.Label(brand, text=\"EXA\", font=(\"Segoe UI\", 16, \"bold\"), fg=\"#E2E8F0\", bg=\"#1E293B\").pack(side=\"left\")

        tk.Label(brand, text=\"MONITOR\", font=(\"Segoe UI\", 12, \"bold\"), fg=\"#38BDF8\", bg=\"#1E293B\").pack(side=\"left\", padx=(10, 0))
"""

if old_header in text:
    text = text.replace(old_header, new_header)
    print("header: ok")
else:
    print("header: NOT FOUND")

AGENT.write_text(text, encoding="utf-8")
print("agent: written")

SPEC.write_text(
    """# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['exa_agent.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('exa-logo-header.png', '.'),
        ('exa-logo.png', '.'),
        ('exa-logo.ico', '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='ExaMonitor',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    manifest='ExaMonitor.manifest',
    icon='exa-logo.ico',
)
""",
    encoding="utf-8",
)
print("spec: ok")

BAT.write_text(
    """@echo off
echo ===================================================
echo     COMPILANDO EXAMONITOR CON LOGO EXA CONTABLE
echo ===================================================
python -m PyInstaller --clean --noconsole --onefile --manifest ExaMonitor.manifest --name ExaMonitor --icon exa-logo.ico --add-data "exa-logo-header.png;." --add-data "exa-logo.png;." --add-data "exa-logo.ico;." exa_agent.py
if %ERRORLEVEL% EQU 0 (
    echo.
    echo [EXITO] Compilacion completada con exito.
    echo Copiando a carpeta de descargas del ERP...
    copy /Y dist\\ExaMonitor.exe ..\\RECURSOS\\descargas\\ExaMonitor.exe
    echo Listo para usar y descargar desde el ERP EXA.
) else (
    echo.
    echo [ERROR] Hubo un problema al compilar con PyInstaller.
)
pause
""",
    encoding="utf-8",
)
print("bat: ok")
