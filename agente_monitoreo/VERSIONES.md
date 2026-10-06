# Versiones de ExaMonitor

El ejecutable no se sube a git (`agente_monitoreo/dist/` está ignorado). Esta lista es el registro de lo que se compiló en esta máquina.

La versión vigente del código es `AGENT_VERSION` en `exa_agent.py`.

| Versión | Ejecutable local | Qué cambió |
| --- | --- | --- |
| 2.8.3-flet | `dist/ExaMonitor-2.8.3.exe` | Abre el ticket y permite marcarlo como el trabajo en curso. Muestra el origen EXA, Servicios o Relavera. No reemplazó `dist/ExaMonitor.exe` porque ese archivo estaba en uso. |
| 2.7.1-flet | `dist/ExaMonitor.exe` | Bandeja alineada con los tickets de EXA y Servicios. Quedó en el commit `7a327f9`. |
| 2.6.0-flet | — | Primera publicación del agente junto al panel. Quedó en el commit `59f0062`. |

Recompilar:

```bash
cd agente_monitoreo
py -m PyInstaller --noconfirm --distpath dist --workpath build ExaMonitor.spec
```

Si `dist/ExaMonitor.exe` está abierto, el empaquetado no puede sobrescribirlo. Cierra el programa o genera el ejecutable con otro nombre.
