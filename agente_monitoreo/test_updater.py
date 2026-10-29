# -*- coding: utf-8 -*-
import tempfile
import unittest
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from updater import download_executable, write_update_script


class FakeResponse:
    def __init__(self, chunks, content_length):
        self.chunks = chunks
        self.headers = {"content-length": str(content_length)}

    def iter_content(self, chunk_size):
        return iter(self.chunks)


def fake_executable():
    data = bytearray(132)
    data[:2] = b"MZ"
    data[0x3C:0x40] = (128).to_bytes(4, "little")
    data[128:132] = b"PE\0\0"
    return bytes(data)


class TestUpdater(unittest.TestCase):
    def test_descarga_executable_completo(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ExaMonitor.new.exe"
            progress = []
            data = fake_executable()
            digest = download_executable(FakeResponse([data[:2], data[2:]], len(data)), path, progress.append)
            self.assertEqual(path.read_bytes(), data)
            self.assertEqual(len(digest), 64)
            self.assertEqual(progress[-1], 1.0)

    def test_rechaza_descarga_incompleta_o_ajena(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "ExaMonitor.new.exe"
            for response in (FakeResponse([fake_executable()[:-1]], 132), FakeResponse([b"<html>"], 6)):
                with self.assertRaises(ValueError):
                    download_executable(response, path)
                self.assertFalse(path.exists())

    def test_script_espera_y_verifica_antes_de_abrir(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            target = root / "O'Brien" / "ExaMonitor.exe"
            script = write_update_script(root, target, root / "new.exe", "a" * 64, 123)
            body = script.read_text(encoding="utf-8-sig")
            self.assertIn("Get-Process -Id $oldPid", body)
            self.assertIn("Get-FileHash -LiteralPath $target", body)
            self.assertLess(body.index("Get-Process -Id $oldPid"), body.index("Copy-Item"))
            self.assertLess(body.index("Get-FileHash -LiteralPath $target"), body.index("Start-Process"))
            self.assertIn("O''Brien", body)
            self.assertIn("PYINSTALLER_RESET_ENVIRONMENT", body)
            self.assertIn(".update-backup", body)

    @unittest.skipUnless(sys.platform == "win32", "Requiere PowerShell en Windows")
    def test_instala_y_prepara_reinicio_real(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / "downloaded.exe"
            shutil.copyfile(Path("C:/Windows/System32/where.exe"), source)
            target = root / "installed.exe"
            target.write_bytes(fake_executable())
            expected = hashlib.sha256(source.read_bytes()).hexdigest()
            script = write_update_script(root, target, source, expected, 2147483647)
            marker = root / "launched.txt"
            body = script.read_text(encoding="utf-8-sig")
            fake_launch = (
                "function Start-Process { param($FilePath, $WorkingDirectory) "
                f"Set-Content -LiteralPath '{marker}' -Value $FilePath }}\n"
            )
            script.write_text(fake_launch + body, encoding="utf-8-sig")
            result = subprocess.run(
                ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script)],
                capture_output=True, text=True, timeout=20,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), expected)
            self.assertEqual(marker.read_text().strip(), str(target))
            self.assertFalse((root / "installed.exe.update-backup").exists())


if __name__ == "__main__":
    unittest.main()
