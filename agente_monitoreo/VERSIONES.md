# Versiones de ExaMonitor

El ejecutable no se sube a git (`agente_monitoreo/dist/` está ignorado). Esta lista es el registro de lo que se compiló en esta máquina.

La versión vigente del código es `AGENT_VERSION` en `exa_agent.py`.

| Versión | Ejecutable local | Qué cambió |
| --- | --- | --- |
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
