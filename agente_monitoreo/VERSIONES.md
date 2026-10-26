# Versiones de ExaMonitor

El ejecutable no se sube a git (`agente_monitoreo/dist/` está ignorado). Esta lista es el registro de lo que se compiló en esta máquina.

La versión vigente del código es `AGENT_VERSION` en `exa_agent.py`.

| Versión | Ejecutable local | Qué cambió |
| --- | --- | --- |
| 2.14.0-flet | `dist/ExaMonitor.exe` | Nueva tarea rediseñada con formato de texto, selector de plazo (Diaria, Semanal, Mensual, Standby), calendario de fecha fin y gestión de adjuntos; layout ampliado. |
| 2.13.0-flet | `dist/ExaMonitor.exe` | Avances con apoyo opcional; tareas identificadas y filtradas por plazo (diaria, semanal, mensual, standby); selección simultánea de tarea y ticket para telemetría. |
| 2.12.2-flet | `dist/ExaMonitor.exe` | Replicados cambios de gestión: apoyo en avance, vínculo ticket-tarea, mejoras en dashboard y tickets. |
| 2.12.1-flet | `dist/ExaMonitor.exe` | Barra de progreso al subir evidencias en la creación de tareas. |
| 2.12.0-flet | `dist/ExaMonitor.exe` | Auto-actualización: detecta nuevas versiones en GitHub y permite actualizar desde la app. |
| 2.11.2-flet | `dist/ExaMonitor-2.11.2.exe` | Muestra la versión en la ventana y la incluye en el nombre del ejecutable. |
| 2.11.1-flet | `dist/ExaMonitor.exe` | El encargado consulta todas las tareas del equipo y puede filtrar por estado; solo sus asignaciones reales aparecen como trabajo activo. |
| 2.11.0-flet | `dist/ExaMonitor.exe` | Creación de tareas con asignación y adjuntos según permisos; tareas propias sin asignar visibles; pegado de imágenes y documentos en avances. |
| 2.10.0-flet | `dist/ExaMonitor-2.10.0.exe` | Tickets: fecha de asignación, avance con nota y evidencia, quien lo registró, y resuelto solo al 100%. Atención al cliente asigna sin el error de Tic_Cod y ve las tareas del equipo. |
| 2.9.0-flet | `dist/ExaMonitor-2.9.0.exe` | Encargado y atención: pestañas Asignar y Asignados, con tareas y tickets. Asignación a varias personas. El desarrollador sigue en Asignados con el filtro Todos / Tareas / Tickets. No reemplazó `dist/ExaMonitor.exe`. |
| 2.8.3-flet | `dist/ExaMonitor-2.8.3.exe` | Abre el ticket y permite marcarlo como el trabajo en curso. Muestra el origen EXA, Servicios o Relavera. No reemplazó `dist/ExaMonitor.exe` porque ese archivo estaba en uso. |
| 2.7.1-flet | `dist/ExaMonitor.exe` | Bandeja alineada con los tickets de EXA y Servicios. Quedó en el commit `7a327f9`. |
| 2.6.0-flet | — | Primera publicación del agente junto al panel. Quedó en el commit `59f0062`. |

Recompilar:

```bash
cd agente_monitoreo
py -m PyInstaller --noconfirm --distpath dist --workpath build ExaMonitor.spec
```

Si `dist/ExaMonitor.exe` está abierto, el empaquetado no puede sobrescribirlo. Cierra el programa o genera el ejecutable con otro nombre.
