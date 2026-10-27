# -*- coding: utf-8 -*-
"""Prepara el reemplazo del ejecutable una vez que ExaMonitor haya terminado."""
from __future__ import annotations

import hashlib
from pathlib import Path


def download_executable(response, destination: Path, on_progress=None) -> str:
    """Guarda y valida un asset de Windows; devuelve su SHA-256."""
    total = int(response.headers.get("content-length", 0))
    downloaded = 0
    digest = hashlib.sha256()
    try:
        with destination.open("wb") as output:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if not chunk:
                    continue
                output.write(chunk)
                digest.update(chunk)
                downloaded += len(chunk)
                if total and on_progress:
                    on_progress(min(1.0, downloaded / total))
        if downloaded < 68 or (total and downloaded != total):
            raise ValueError("La descarga está incompleta.")
        with destination.open("rb") as source:
            if source.read(2) != b"MZ":
                raise ValueError("El archivo descargado no es un ejecutable de Windows.")
            source.seek(0x3C)
            pe_offset = int.from_bytes(source.read(4), "little")
            if pe_offset < 64 or pe_offset > downloaded - 4:
                raise ValueError("El archivo descargado no es un ejecutable de Windows.")
            source.seek(pe_offset)
            if source.read(4) != b"PE\0\0":
                raise ValueError("El archivo descargado no es un ejecutable de Windows.")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return digest.hexdigest()


def _ps_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def write_update_script(directory: Path, executable: Path, downloaded: Path,
                        expected_sha256: str, old_pid: int) -> Path:
    """Genera un helper externo que espera, verifica, reemplaza y reinicia."""
    if not expected_sha256 or len(expected_sha256) != 64 or any(
        c not in "0123456789abcdef" for c in expected_sha256.lower()
    ):
        raise ValueError("SHA-256 inválido")
    if old_pid <= 0:
        raise ValueError("PID inválido")
    script = directory / "install_update.ps1"
    body = f"""$ErrorActionPreference = 'Stop'
$oldPid = {old_pid}
$source = {_ps_literal(str(downloaded))}
$target = {_ps_literal(str(executable))}
$expected = {_ps_literal(expected_sha256.lower())}
$log = {_ps_literal(str(directory / 'update-error.log'))}
try {{
    for ($i = 0; $i -lt 120; $i++) {{
        if (-not (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {{ break }}
        Start-Sleep -Seconds 1
    }}
    if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {{
        throw 'ExaMonitor no terminó en 120 segundos.'
    }}
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {{
        throw 'La descarga no pasó la verificación SHA-256.'
    }}
    $installed = $false
    for ($i = 0; $i -lt 30; $i++) {{
        try {{
            Copy-Item -LiteralPath $source -Destination $target -Force -ErrorAction Stop
            if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {{
                throw 'El ejecutable instalado no coincide con la descarga.'
            }}
            $installed = $true
            break
        }} catch {{
            if ($i -eq 29) {{ throw }}
            Start-Sleep -Seconds 1
        }}
    }}
    if (-not $installed) {{ throw 'No se pudo instalar la actualización.' }}
    Start-Process -FilePath $target -WorkingDirectory (Split-Path -Parent $target)
    Remove-Item -LiteralPath $source -Force -ErrorAction SilentlyContinue
}} catch {{
    $message = "No se pudo actualizar ExaMonitor: $($_.Exception.Message)"
    Set-Content -LiteralPath $log -Value $message -Encoding UTF8
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message + "`nDetalles: " + $log, 'ExaMonitor') | Out-Null
    exit 1
}}
"""
    script.write_text(body, encoding="utf-8-sig")
    return script
