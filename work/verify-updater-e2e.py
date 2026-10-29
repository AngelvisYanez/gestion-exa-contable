"""Verifica el reemplazo y reinicio de dos ejecutables PyInstaller aislados."""
import hashlib
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agente_monitoreo"))
from updater import write_update_script

folder = ROOT / "work" / "update-e2e"
folder.mkdir(exist_ok=True)
(folder / "old.py").write_text(
    "import os,subprocess,sys,time\nfrom pathlib import Path\n"
    "Path(sys.argv[1]).write_text(str(os.getpid()))\n"
    "while not Path(sys.argv[2]).exists(): time.sleep(0.1)\n"
    "subprocess.Popen(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass',"
    "'-File',Path(sys.argv[2]).read_text()],creationflags=subprocess.CREATE_NO_WINDOW)\n"
    "os._exit(0)\n",
    encoding="utf-8",
)
(folder / "new.py").write_text(
    "import os\nfrom pathlib import Path\n"
    "Path(os.environ['EXAMONITOR_E2E_MARKER']).write_text('new version started')\n",
    encoding="utf-8",
)
for name in ("old", "new"):
    subprocess.run(
        [sys.executable, "-m", "PyInstaller", "--onefile", "--noconfirm",
         "--name", name, "--distpath", str(folder / "dist"),
         "--workpath", str(folder / "build"), "--specpath", str(folder),
         str(folder / f"{name}.py")],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
installed = folder / "dist" / "old.exe"
downloaded = folder / "dist" / "new.exe"
pid_file = folder / "old.pid"
trigger_file = folder / "install-trigger.txt"
marker = folder / "new-started.txt"
for path in (pid_file, trigger_file, marker):
    path.unlink(missing_ok=True)
env = os.environ.copy()
env["EXAMONITOR_E2E_MARKER"] = str(marker)
old = subprocess.Popen([str(installed), str(pid_file), str(trigger_file)], env=env)
try:
    deadline = time.monotonic() + 20
    while not pid_file.exists() and time.monotonic() < deadline:
        time.sleep(0.1)
    if not pid_file.exists():
        raise RuntimeError("Old executable did not start")
    expected = hashlib.sha256(downloaded.read_bytes()).hexdigest()
    script = write_update_script(folder, installed, downloaded, expected, int(pid_file.read_text()))
    trigger_file.write_text(str(script))
    old.wait(timeout=20)
    deadline = time.monotonic() + 20
    while not marker.exists() and time.monotonic() < deadline:
        time.sleep(0.1)
    if not marker.exists():
        log = folder / "update-error.log"
        raise RuntimeError(log.read_text() if log.exists() else "New executable did not start")
    if hashlib.sha256(installed.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Installed executable does not match download")
    print("PASS: downloaded executable replaced old one and new version started")
finally:
    if old.poll() is None:
        old.terminate()
