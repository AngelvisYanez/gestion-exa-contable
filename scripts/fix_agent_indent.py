from pathlib import Path

p = Path(r"C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-tareas-app\agente_monitoreo\exa_agent.py")
lines = p.read_text(encoding="utf-8").splitlines()
fixed = []
for line in lines:
    if line.startswith("                tk.Label(form_grid, text=\"Cedula EXA:\""):
        line = "        " + line.lstrip()
    fixed.append(line)
text = "\n".join(fixed) + "\n"
compile(text, "exa_agent.py", "exec")
p.write_text(text, encoding="utf-8")
print("fixed and syntax ok")
