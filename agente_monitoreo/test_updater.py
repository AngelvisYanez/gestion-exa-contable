# -*- coding: utf-8 -*-
import tempfile
import unittest
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


if __name__ == "__main__":
    unittest.main()
