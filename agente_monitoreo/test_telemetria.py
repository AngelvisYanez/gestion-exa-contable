# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch

from exa_agent import ExaMonitorApp


class TestTelemetria(unittest.TestCase):
    def test_envia_tarea_y_ticket_con_el_mismo_codigo(self):
        app = object.__new__(ExaMonitorApp)
        app.dev_data = {"Per_Cod": 7}
        app.config = {"server_url": "https://example.test", "api_path": "/api/monitoreo"}
        app.selected_tar_cod = 42
        app.selected_tic_cod = 42
        app.selected_tic_db = "servicios"
        app.interval_minutes = 5
        app.captura_permitida = 0
        app.mac_address = "AA:BB:CC:DD:EE:FF"
        app._consume_activity = lambda: (75, "Editor", "Code.exe", 4, 9)

        class Response:
            def json(self):
                return {"status": "ok", "data": {}}

        with patch("exa_agent.requests.post", return_value=Response()) as post:
            app._subir_telemetria()

        sent = post.call_args.kwargs["data"]
        self.assertEqual(sent["Tar_Cod"], "42")
        self.assertEqual(sent["Tic_Cod"], "42")
        self.assertEqual(sent["Db_Origen"], "servicios")


if __name__ == "__main__":
    unittest.main()
