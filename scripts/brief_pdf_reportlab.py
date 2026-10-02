#!/usr/bin/env python3
"""
Brief EXA OFSERCONT → PDF con diseño tipo docs de ejemplo (ReportLab).
Uso:
  python scripts/brief_pdf_reportlab.py --out docs/out.pdf --meta meta.json
meta.json:
  {
    "titulo", "tipoLabel", "subtitulo", "resumen", "audiencia",
    "fecha", "proceso", "modulo", "directorio", "tarCod",
    "chips": ["a","b"], "markdown": "..."
  }
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Paleta cercana a EXA (rojo corporativo del panel)
RED = colors.HexColor("#9B2525")
RED_DARK = colors.HexColor("#7A1C1C")
INK = colors.HexColor("#1A1A18")
MUTED = colors.HexColor("#5C5A56")
LINE = colors.HexColor("#E7E5E4")
CHIP_BG = colors.HexColor("#F5F2F0")
CHIP_BD = colors.HexColor("#E4DDD8")
PAGE_BG = colors.HexColor("#FAF8F6")
WHITE = colors.white


class AccentBar(Flowable):
    def __init__(self, width, height=3, color=RED):
        Flowable.__init__(self)
        self.width = width
        self.height = height
        self.color = color

    def draw(self):
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)


class ChipRow(Flowable):
    """Fila de chips / etiquetas tipo portada de los briefs EXA."""

    def __init__(self, chips: list[str], max_width: float):
        Flowable.__init__(self)
        self.chips = [c.strip() for c in chips if c and str(c).strip()]
        self.max_width = max_width
        self._rows: list[list[tuple[str, float, float]]] = []
        self._height = 0

    def wrap(self, availWidth, availHeight):
        width = min(self.max_width, availWidth)
        font = "Helvetica-Bold"
        size = 8
        pad_x, pad_y, gap = 8, 5, 6
        rows: list[list[tuple[str, float, float]]] = []
        row: list[tuple[str, float, float]] = []
        x = 0.0
        from reportlab.pdfbase.pdfmetrics import stringWidth

        for label in self.chips:
            tw = stringWidth(label, font, size) + pad_x * 2
            th = size + pad_y * 2
            if row and x + tw > width:
                rows.append(row)
                row = []
                x = 0.0
            row.append((label, tw, th))
            x += tw + gap
        if row:
            rows.append(row)
        self._rows = rows
        self._height = sum(max(h for _, _, h in r) + gap for r in rows) if rows else 0
        if self._height:
            self._height -= gap
        self.width = width
        self.height = max(self._height, 1)
        return self.width, self.height

    def draw(self):
        from reportlab.pdfbase.pdfmetrics import stringWidth

        font, size = "Helvetica-Bold", 8
        pad_x, pad_y, gap = 8, 5, 6
        y = self.height
        for row in self._rows:
            row_h = max(h for _, _, h in row)
            y -= row_h
            x = 0.0
            for label, tw, th in row:
                self.canv.setFillColor(CHIP_BG)
                self.canv.setStrokeColor(CHIP_BD)
                self.canv.roundRect(x, y, tw, th, 3, fill=1, stroke=1)
                self.canv.setFillColor(RED_DARK)
                self.canv.setFont(font, size)
                self.canv.drawString(x + pad_x, y + pad_y - 1, label)
                x += tw + gap
            y -= gap


def esc(s: str) -> str:
    return (
        str(s or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def plain(md: str) -> str:
    t = re.sub(r"`([^`]+)`", r"\1", md)
    t = re.sub(r"\*\*([^*]+)\*\*", r"\1", t)
    t = re.sub(r"\*([^*]+)\*", r"\1", t)
    t = re.sub(r"^#+\s*", "", t)
    return t.strip()


def md_inline(s: str) -> str:
    s = esc(s)
    s = re.sub(r"`([^`]+)`", r"<font face='Courier' size='8'>\1</font>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    return s


def parse_sections(markdown: str) -> list[tuple[str, list[str]]]:
    lines = markdown.replace("\r\n", "\n").split("\n")
    sections: list[tuple[str, list[str]]] = []
    current = "Contenido"
    buf: list[str] = []
    for line in lines:
        m = re.match(r"^#{1,3}\s+(.+)$", line.strip())
        if m:
            title = plain(m.group(1))
            if re.match(r"^(EXA|OFSERCONT|BRIEF DE)", title, re.I):
                continue
            if buf:
                sections.append((current, buf))
            current = title
            buf = []
            continue
        if line.strip() == "---":
            continue
        buf.append(line)
    if buf:
        sections.append((current, buf))
    return sections


def build_styles():
    base = getSampleStyleSheet()
    styles = {
        "brand": ParagraphStyle(
            "brand",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=11,
            textColor=RED,
            leading=14,
            alignment=TA_LEFT,
            spaceAfter=2,
        ),
        "eyebrow": ParagraphStyle(
            "eyebrow",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            textColor=MUTED,
            leading=13,
            spaceBefore=10,
            spaceAfter=8,
            tracking=1,
        ),
        "hero": ParagraphStyle(
            "hero",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=22,
            textColor=INK,
            leading=26,
            spaceAfter=8,
        ),
        "lead": ParagraphStyle(
            "lead",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            textColor=MUTED,
            leading=15,
            spaceAfter=4,
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            textColor=MUTED,
            leading=12,
            spaceBefore=10,
            spaceAfter=8,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=9,
            textColor=INK,
            leading=12,
            spaceBefore=14,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            textColor=RED_DARK,
            leading=17,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=INK,
            leading=13,
            alignment=TA_JUSTIFY,
            spaceAfter=5,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=INK,
            leading=13,
            leftIndent=2,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "th": ParagraphStyle(
            "th",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            textColor=WHITE,
            leading=11,
        ),
        "td": ParagraphStyle(
            "td",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            textColor=INK,
            leading=11,
        ),
    }
    return styles


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 14 * mm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 6 * mm, "EXA-OFSERCONT  |  Uso interno")
    canvas.drawRightString(A4[0] - 18 * mm, 6 * mm, f"{doc.page}")
    canvas.restoreState()


def cover_footer(canvas, doc):
    footer(canvas, doc)


def parse_table(block_lines: list[str]) -> Table | None:
    rows = []
    for line in block_lines:
        if not line.strip().startswith("|"):
            continue
        if re.match(r"^\|\s*-+", line.strip()):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        rows.append(cells)
    if len(rows) < 2:
        return None
    styles = build_styles()
    data = []
    for i, row in enumerate(rows):
        style = styles["th"] if i == 0 else styles["td"]
        data.append([Paragraph(md_inline(c), style) for c in row])
    col_n = max(len(r) for r in data)
    for r in data:
        while len(r) < col_n:
            r.append(Paragraph("", styles["td"]))
    usable = A4[0] - 36 * mm
    col_w = usable / col_n
    t = Table(data, colWidths=[col_w] * col_n)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), RED),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("BACKGROUND", (0, 1), (-1, -1), WHITE),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, CHIP_BG]),
            ]
        )
    )
    return t


def section_flowables(title: str, lines: list[str], styles) -> list:
    out = []
    out.append(Paragraph(esc(title), styles["h1"]))
    out.append(AccentBar(40 * mm, 2, RED))
    out.append(Spacer(1, 4 * mm))

    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.strip().startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i])
                i += 1
            tbl = parse_table(block)
            if tbl:
                out.append(tbl)
                out.append(Spacer(1, 3 * mm))
            continue
        if re.match(r"^\s*([-*+]|\d+\.)\s+", line):
            items = []
            while i < len(lines) and re.match(r"^\s*([-*+]|\d+\.)\s+", lines[i]):
                txt = re.sub(r"^\s*([-*+]|\d+\.)\s+", "", lines[i])
                items.append(ListItem(Paragraph(md_inline(txt), styles["bullet"]), leftIndent=8))
                i += 1
            out.append(
                ListFlowable(
                    items,
                    bulletType="bullet",
                    start="•",
                    leftIndent=12,
                    bulletFontName="Helvetica",
                    bulletFontSize=9,
                )
            )
            out.append(Spacer(1, 2 * mm))
            continue
        if line.strip().startswith("```"):
            i += 1
            code = []
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(esc(lines[i]))
                i += 1
            i += 1
            code_p = Paragraph(
                "<font face='Courier' size='7'>%s</font>" % "<br/>".join(code[:40]),
                styles["body"],
            )
            box = Table([[code_p]], colWidths=[A4[0] - 36 * mm])
            box.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), CHIP_BG),
                        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ]
                )
            )
            out.append(box)
            out.append(Spacer(1, 3 * mm))
            continue
        out.append(Paragraph(md_inline(line.strip()), styles["body"]))
        i += 1
    return out


def build_pdf(meta: dict, out_path: Path):
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=meta.get("titulo") or "Brief EXA",
        author="EXA OFSERCONT",
    )

    tipo = meta.get("tipoLabel") or "BRIEF DE MEJORA DE MÓDULOS"
    titulo = meta.get("titulo") or "Brief"
    subtitulo = meta.get("subtitulo") or meta.get("resumen") or ""
    resumen = meta.get("resumen") or "Diagnóstico, causa raíz, impacto y plan de corrección."
    audiencia = meta.get("audiencia") or "Para el equipo de desarrollo."
    fecha = meta.get("fecha") or ""
    chips = meta.get("chips") or []
    if not chips:
        chips = [c for c in [meta.get("proceso"), meta.get("modulo"), meta.get("directorio")] if c]

    story: list = []

    # —— Portada ——
    story.append(Paragraph("EXA", styles["brand"]))
    story.append(Paragraph("OFSERCONT", styles["brand"]))
    story.append(Spacer(1, 4 * mm))
    story.append(AccentBar(A4[0] - 36 * mm, 3.5, RED))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(esc(tipo.upper()), styles["eyebrow"]))
    story.append(Paragraph(esc(titulo), styles["hero"]))
    if subtitulo:
        story.append(Paragraph(esc(subtitulo), styles["lead"]))
    story.append(Paragraph(esc(resumen), styles["lead"]))
    story.append(Paragraph(esc(audiencia), styles["meta"]))
    story.append(Paragraph(esc(f"{fecha}  |  Uso interno"), styles["meta"]))
    story.append(Spacer(1, 4 * mm))
    story.append(ChipRow([str(c) for c in chips], A4[0] - 36 * mm))
    story.append(Spacer(1, 8 * mm))
    note = meta.get("notaPortada") or (
        "Las correcciones caben en las pantallas, la lógica y el SQL que ya existen. "
        "No se abre un módulo paralelo."
        if "CREACI" not in tipo.upper()
        else "Se define el módulo/flujo nuevo anclado a las convenciones EXA (FRONT / LOGICA / VALIDACIONES)."
    )
    story.append(Paragraph(esc(note), styles["note"]))
    story.append(PageBreak())

    # —— Contenido ——
    md = meta.get("markdown") or ""
    sections = parse_sections(md)
    # Saltar portada duplicada / metadatos iniciales cortos
    for title, lines in sections:
        if re.match(r"^(EXA|OFSERCONT|BRIEF DE)", title, re.I):
            continue
        # omitir bloque solo de metadatos tipo "- **Título:**"
        nonempty = [ln for ln in lines if ln.strip()]
        if nonempty and all(re.match(r"^\s*[-*]\s+\*\*", ln) for ln in nonempty[:6]):
            # still include if long
            if len(nonempty) < 8 and not any(re.match(r"^#{1,3}\s+", ln) for ln in lines):
                if title.lower() in {"contenido", "metadatos de la tarea"}:
                    continue
        story.extend(section_flowables(title, lines, styles))

    doc.build(story, onFirstPage=cover_footer, onLaterPages=footer)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--meta", required=True)
    args = ap.parse_args()
    meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    build_pdf(meta, out)
    print(json.dumps({"ok": True, "out": str(out), "bytes": out.stat().st_size}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)
