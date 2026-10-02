from pathlib import Path

bad = []
for f in Path("src").rglob("*"):
    if f.suffix.lower() not in {".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".md"}:
        continue
    b = f.read_bytes()
    try:
        b.decode("utf-8")
    except UnicodeDecodeError:
        for enc in ("cp1252", "latin-1"):
            try:
                text = b.decode(enc)
                f.write_text(text, encoding="utf-8", newline="\n")
                bad.append(f"{f} fixed from {enc}")
                break
            except Exception as e:
                bad.append(f"{f} fail {enc}: {e}")

print("\n".join(bad) if bad else "all utf8 ok")
