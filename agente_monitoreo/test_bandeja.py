# -*- coding: utf-8 -*-
import unittest

from bandeja import trabajos_activos, visible_trabajos


ITEMS = [
    {"Tar_Cod": 1, "tipo": "tarea", "por_asignar": True},
    {"Tar_Cod": 2, "tipo": "ticket", "por_asignar": True},
    {"Tar_Cod": 3, "tipo": "tarea", "por_asignar": False},
    {"Tar_Cod": 4, "tipo": "ticket", "por_asignar": False},
]


class TestBandeja(unittest.TestCase):
    def test_asignar_solo_la_cola(self):
        out = visible_trabajos(ITEMS, es_mesa=True, bandeja="asignar", tipo_filtro="todos")
        self.assertEqual([t["Tar_Cod"] for t in out], [1, 2])

    def test_asignados_solo_lo_propio(self):
        out = visible_trabajos(ITEMS, es_mesa=True, bandeja="asignados", tipo_filtro="todos")
        self.assertEqual([t["Tar_Cod"] for t in out], [3, 4])

    def test_filtro_de_tipo_se_mantiene(self):
        tareas = visible_trabajos(ITEMS, es_mesa=True, bandeja="asignados", tipo_filtro="tarea")
        tickets = visible_trabajos(ITEMS, es_mesa=False, bandeja="asignados", tipo_filtro="ticket")
        self.assertEqual([t["Tar_Cod"] for t in tareas], [3])
        self.assertEqual([t["Tar_Cod"] for t in tickets], [2, 4])

    def test_desarrollador_ignora_la_pestana(self):
        asignar = visible_trabajos(ITEMS, es_mesa=False, bandeja="asignar", tipo_filtro="todos")
        asignados = visible_trabajos(ITEMS, es_mesa=False, bandeja="asignados", tipo_filtro="todos")
        self.assertEqual([t["Tar_Cod"] for t in asignar], [1, 2, 3, 4])
        self.assertEqual([t["Tar_Cod"] for t in asignados], [1, 2, 3, 4])

    def test_telemetria_no_ofrece_la_cola(self):
        out = trabajos_activos(ITEMS)
        self.assertEqual([t["Tar_Cod"] for t in out], [3, 4])


if __name__ == "__main__":
    unittest.main()
