# -*- coding: utf-8 -*-
import unittest

from bandeja import fecha_fin_para_plazo, plazo_tarea, trabajos_activos, visible_trabajos


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

    def test_encargado_lista_equipo_y_filtra_estado(self):
        items = [
            {"Tar_Cod": 1, "tipo": "tarea", "por_asignar": True, "Tar_Estado": "Pendiente"},
            {"Tar_Cod": 2, "tipo": "tarea", "por_asignar": False, "Tar_Estado": "En Proceso"},
            {"Tar_Cod": 3, "tipo": "tarea", "por_asignar": False, "Tar_Estado": "Finalizada"},
        ]
        visibles = visible_trabajos(items, es_mesa=True, es_encargado=True,
                                    bandeja="todos", tipo_filtro="todos")
        filtradas = visible_trabajos(items, es_mesa=True, es_encargado=True,
                                     bandeja="todos", tipo_filtro="todos",
                                     estado_filtro="Finalizada")
        self.assertEqual([t["Tar_Cod"] for t in visibles], [1, 2, 3])
        self.assertEqual([t["Tar_Cod"] for t in filtradas], [3])

    def test_trabajo_del_equipo_no_es_asignacion_personal(self):
        items = [
            {"Tar_Cod": 1, "por_asignar": False, "asignada_a_mi": False},
            {"Tar_Cod": 2, "por_asignar": False, "asignada_a_mi": True},
            {"Tar_Cod": 3, "por_asignar": True, "asignada_a_mi": False},
        ]
        self.assertEqual([t["Tar_Cod"] for t in trabajos_activos(items, es_mesa=True)], [2])

    def test_tareas_creadas_sin_asignar_solo_en_su_pestana(self):
        items = ITEMS + [{"Tar_Cod": 5, "tipo": "tarea", "por_asignar": True, "creada_por_mi": True}]
        asignados = visible_trabajos(items, es_mesa=False, bandeja="asignados", tipo_filtro="todos")
        creadas = visible_trabajos(items, es_mesa=False, bandeja="creadas", tipo_filtro="todos")
        self.assertEqual([t["Tar_Cod"] for t in asignados], [1, 2, 3, 4])
        self.assertEqual([t["Tar_Cod"] for t in creadas], [5])
        self.assertNotIn(5, [t["Tar_Cod"] for t in trabajos_activos(items)])

    def test_plazos_coinciden_con_gestion(self):
        self.assertEqual(plazo_tarea("2026-10-20", "2026-10-20"), "Diaria")
        self.assertEqual(plazo_tarea("2026-10-20", "2026-10-26"), "Semanal")
        self.assertEqual(plazo_tarea("2026-10-20", "2026-10-27"), "Mensual")
        self.assertEqual(plazo_tarea("2026-10-20", None, "Pausada"), "Standby")
        self.assertEqual(plazo_tarea(None, None), "Sin fechas")

    def test_filtro_de_plazo_solo_muestra_tareas_del_plazo(self):
        items = [
            {"Tar_Cod": 1, "tipo": "tarea", "Tar_Fecha_Inicio": "2026-10-20", "Tar_Fecha_Fin": "2026-10-20"},
            {"Tar_Cod": 2, "tipo": "tarea", "Tar_Fecha_Inicio": "2026-10-20", "Tar_Fecha_Fin": "2026-10-26"},
            {"Tar_Cod": 3, "tipo": "ticket"},
        ]
        out = visible_trabajos(items, es_mesa=False, bandeja="asignados",
                               tipo_filtro="todos", plazo_filtro="Semanal")
        self.assertEqual([t["Tar_Cod"] for t in out], [2])

    def test_fecha_fin_para_plazo(self):
        self.assertEqual(fecha_fin_para_plazo("2026-10-20", "Diaria"), "2026-10-20")
        self.assertEqual(fecha_fin_para_plazo("2026-10-20", "Semanal"), "2026-10-26")
        self.assertEqual(fecha_fin_para_plazo("2026-01-31", "Mensual"), "2026-02-28")
        self.assertEqual(fecha_fin_para_plazo("2026-12-15", "Mensual"), "2027-01-15")


if __name__ == "__main__":
    unittest.main()
