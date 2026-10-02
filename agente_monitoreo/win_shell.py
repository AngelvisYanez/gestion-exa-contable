# -*- coding: utf-8 -*-
"""Inicio con Windows, actividad real y ventana en primer plano (Windows)."""
from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes
from pathlib import Path


def ensure_windows_autostart(app_name: str = "ExaMonitor") -> None:
    """Registra el ejecutable actual en HKCU\\...\\Run para arrancar con la sesion."""
    if sys.platform != "win32":
        return
    try:
        import winreg
    except Exception:
        return

    if getattr(sys, "frozen", False):
        cmd = f'"{Path(sys.executable).resolve()}"'
    else:
        script = Path(__file__).resolve().parent / "exa_agent.py"
        py = Path(sys.executable)
        # pythonw evita la consola negra al iniciar sesion
        pyw = py.with_name("pythonw.exe")
        launcher = pyw if pyw.exists() else py
        cmd = f'"{launcher}" "{script}"'

    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE,
        )
        try:
            winreg.SetValueEx(key, app_name, 0, winreg.REG_SZ, cmd)
        finally:
            winreg.CloseKey(key)
    except Exception as e:
        print("autostart:", e)


_input_lock = __import__("threading").Lock()
_clicks = 0
_keys = 0
_hook_started = False
_hook_refs: tuple = ()


def consume_input_counts() -> tuple[int, int]:
    """Clics y teclas acumulados desde la última lectura."""
    global _clicks, _keys
    with _input_lock:
        c, k = _clicks, _keys
        _clicks = 0
        _keys = 0
    return c, k


def start_input_counter() -> None:
    """Cuenta clics y teclas con hooks de bajo nivel (solo Windows)."""
    global _hook_started
    if sys.platform != "win32" or _hook_started:
        return
    _hook_started = True

    import threading

    threading.Thread(target=_input_pump, name="exa-input", daemon=True).start()


def _input_pump() -> None:
    """WH_*_LL se llama en este hilo. hMod debe ser NULL: el .exe no es una DLL."""
    global _clicks, _keys, _hook_refs
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    LRESULT = ctypes.c_ssize_t
    HOOKPROC = ctypes.WINFUNCTYPE(LRESULT, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
    user32.SetWindowsHookExW.argtypes = [
        ctypes.c_int,
        HOOKPROC,
        wintypes.HINSTANCE,
        wintypes.DWORD,
    ]
    user32.SetWindowsHookExW.restype = wintypes.HHOOK
    user32.CallNextHookEx.argtypes = [
        wintypes.HHOOK,
        ctypes.c_int,
        wintypes.WPARAM,
        wintypes.LPARAM,
    ]
    user32.CallNextHookEx.restype = LRESULT
    user32.GetMessageW.argtypes = [
        ctypes.POINTER(wintypes.MSG),
        wintypes.HWND,
        wintypes.UINT,
        wintypes.UINT,
    ]
    user32.GetMessageW.restype = ctypes.c_int
    user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.TranslateMessage.restype = wintypes.BOOL
    user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
    user32.DispatchMessageW.restype = LRESULT

    def on_mouse(nCode, wParam, lParam):
        global _clicks
        if nCode >= 0 and int(wParam) in (0x0201, 0x0204, 0x0207):
            with _input_lock:
                _clicks += 1
        return user32.CallNextHookEx(None, nCode, wParam, lParam)

    def on_key(nCode, wParam, lParam):
        global _keys
        if nCode >= 0 and int(wParam) in (0x0100, 0x0104):
            with _input_lock:
                _keys += 1
        return user32.CallNextHookEx(None, nCode, wParam, lParam)

    mouse_cb = HOOKPROC(on_mouse)
    key_cb = HOOKPROC(on_key)
    mouse_hook = user32.SetWindowsHookExW(14, mouse_cb, None, 0)
    key_hook = user32.SetWindowsHookExW(13, key_cb, None, 0)
    _hook_refs = (mouse_cb, key_cb, mouse_hook, key_hook)
    if not mouse_hook or not key_hook:
        err = ctypes.get_last_error()
        print("input hook:", err)
        return
    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))


def idle_seconds() -> float:
    """Segundos desde el ultimo teclado/mouse (GetLastInputInfo)."""
    if sys.platform != "win32":
        return 0.0
    try:
        class LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

        info = LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(info)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(info)):
            return 999.0
        now = ctypes.windll.kernel32.GetTickCount()
        elapsed = int(now) - int(info.dwTime)
        if elapsed < 0:
            elapsed += 2**32
        return elapsed / 1000.0
    except Exception:
        return 999.0


def foreground_window() -> tuple[str, str]:
    """(titulo, proceso) de la ventana en primer plano."""
    if sys.platform != "win32":
        return ("", "")
    try:
        user32 = ctypes.windll.user32
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return ("", "")
        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        title = (buf.value or "").strip()[:250]

        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        proceso = ""
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value
        )
        if handle:
            try:
                size = wintypes.DWORD(260)
                name = ctypes.create_unicode_buffer(260)
                if ctypes.windll.kernel32.QueryFullProcessImageNameW(
                    handle, 0, name, ctypes.byref(size)
                ):
                    proceso = Path(name.value).name[:95]
            finally:
                ctypes.windll.kernel32.CloseHandle(handle)
        return (title, proceso)
    except Exception:
        return ("", "")
