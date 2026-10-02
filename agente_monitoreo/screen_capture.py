# -*- coding: utf-8 -*-
"""Captura de pantalla para telemetria ExaMonitor (PIL ImageGrab)."""
from __future__ import annotations

from io import BytesIO
from typing import Optional


def grab_screenshot_jpeg(quality: int = 70, max_width: int = 1600) -> Optional[bytes]:
    """Captura pantalla primaria → JPEG bytes. None si falla."""
    try:
        from PIL import Image, ImageGrab
    except Exception:
        return None

    try:
        img = ImageGrab.grab(all_screens=False)
    except Exception:
        try:
            img = ImageGrab.grab()
        except Exception:
            return None

    if img is None:
        return None

    try:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        if max_width and w > max_width:
            nh = max(1, int(h * (max_width / float(w))))
            img = img.resize((max_width, nh), Image.Resampling.LANCZOS)
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=max(40, min(95, int(quality))), optimize=True)
        data = buf.getvalue()
        return data if data else None
    except Exception:
        return None


def screenshot_multipart(field_name: str = "screenshot") -> Optional[tuple]:
    data = grab_screenshot_jpeg()
    if not data:
        return None
    return (field_name, ("captura.jpg", data, "image/jpeg"))
