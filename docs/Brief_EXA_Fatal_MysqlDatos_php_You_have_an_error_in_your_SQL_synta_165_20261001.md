> **Nota:** No se pudo completar con Gemini (This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.). Brief plantilla + inventario.

# EXA OFSERCONT

# BRIEF DE MEJORA DE MÓDULOS

## [EXA Fatal] MysqlDatos.php: You have an error in your SQL syntax; check the manual that corresponds to your MariaDB serv

**Tarea:** #165  
**Proceso:** Gestion  
**Módulo:** Panel tareas  
**Directorio:** gestion  
**Audiencia:** Yanez Angelvis  
**Fecha:** 01 de octubre de 2026 | Uso interno

---

## 1. Qué tiene que quedar resuelto

Prueba E2E local del boton Generar brief con Gemini 3. Validar MD/PDF y metadatos.

### Mensaje para el equipo

Este brief define el alcance de **mejora de modulos** a partir de la tarea #165.
Las correcciones deben caber en las pantallas, la lógica y el SQL que ya existen. No se abre un módulo paralelo salvo que el alcance lo exija explícitamente.

### Tres hechos que el equipo debe tener claros

1. El alcance parte del **proceso** `Gestion` y del **módulo** `Panel tareas`.
2. El código a revisar vive bajo **directorio** `gestion` en el sistema EXA OFSERCONT.
3. Primero se corta el alta/edición incorrecta (o se entrega el alta del módulo); el histórico se trata en un pase aparte si aplica.

### Orden de trabajo

| Orden | Entrega | Para qué |
|------:|---------|----------|
| 1 | Confirmar pantallas y casos SQL del directorio | Anclar el cambio al código real |
| 2 | Diagnosticar causa raíz y huecos de validación | Evitar trabajo paralelo o inventado |
| 3 | Implementar en cliente y servidor | Paridad UI + persistencia |
| 4 | Prueba operativa / corte | Verificar el criterio de hecho de la tarea |
| 5 | Documentar fuera de alcance | Separar histórico y deuda |

### Fuera de este cambio

No rehacer el histórico en el mismo cambio salvo que la tarea lo pida. Los casos ya grabados se listan y corrigen en un pase aparte, documento por documento.

---

## 2. Esquema y módulo actual

| Campo | Valor |
|-------|-------|
| Proceso | Gestion |
| Módulo | Panel tareas |
| Directorio | gestion |
| Raíz OFSERCONT | `C:\Users\ismaa\OneDrive\Documentos\GitHub\exa-ofsercont` |
| Subruta resuelta | `gestion` |

Inventario bajo gestion (max 80).

### Archivos relevantes detectados

- `gestion/agente_monitoreo/build_new/ExaMonitor/xref-ExaMonitor.html`
- `gestion/agente_monitoreo/build/ExaMonitor/xref-ExaMonitor.html`
- `gestion/exa_monitor_reflex/AGENTS.md`
- `gestion/exa_monitor_reflex/build/ExaMonitorReflex/xref-ExaMonitorReflex.html`
- `gestion/exa_monitor_reflex/CLAUDE.md`
- `gestion/exa_monitor_reflex/README.md`
- `gestion/FRONT/ges_dashboard_modern.css`
- `gestion/FRONT/ges_mod_avances_1.0.php`
- `gestion/FRONT/ges_mod_dashboard_tareas_1.0.php`
- `gestion/FRONT/ges_zoom.css`
- `gestion/LOGICA/ges_log_dashboard_tareas_1.0.php`
- `gestion/LOGICA/ges_migrar_per_cod.php`
- `gestion/LOGICA/ges_pdf_reporte_tareas.php`
- `gestion/LOGICA/ges_sql_dashboard_tareas_1.0.php`
- `gestion/RECURSOS/ges_dashboard_modern.css`
- `gestion/RECURSOS/ges_zoom.css`
- `gestion/TEST/ges_register_menu.php`
- `gestion/VALIDACIONES/ges_par_dashboard_tareas_1.0.js`
- `gestion/VALIDACIONES/ges_val_dashboard_tareas_1.0.js`

### Qué valida hoy y qué no valida

| Sí entra hoy (a confirmar en código) | No entra hoy (hueco a cerrar) |
|--------------------------------------|-------------------------------|
| Flujos FRONT/LOGICA listados arriba | Reglas de negocio de la descripción de la tarea |
| Persistencia existente del módulo | Revalidación servidor si solo hay JS |
| Consultas/reportes del proceso | Paridad en pantallas de modificación |



---

## 3. Causa raíz / alcance funcional

Partir de la descripción de la tarea y del inventario de archivos. Completar en implementación:

1. ¿Qué pantalla o caso SQL reproduce el problema (o el alta del módulo)?
2. ¿Qué campo/tabla guarda el estado incorrecto o el nuevo dato?
3. ¿Hay validación solo en cliente, solo en servidor, o en ninguno?

---

## 4. Impacto

- Operativo: proceso **Gestion**, módulo **Panel tareas**.
- Técnico: directorio `gestion` en EXA OFSERCONT.
- Riesgo si no se cierra: la tarea #165 queda sin criterio de hecho documentado.

---

## 5. Alcance de la corrección / entrega

1. Actualizar o crear pantallas y lógica bajo `gestion`.
2. Validar en cliente y servidor según el tipo de brief.
3. Probar el caso descrito en la tarea #165.
4. Dejar evidencia (avance + brief en `docs/`).

---

## 6. Criterio de hecho

- [ ] Brief revisado por encargado
- [ ] Cambios en el directorio indicado
- [ ] Prueba del caso de la descripción
- [ ] Avance registrado en el panel de gestión

---

*Generado desde EXA Tareas (gestion) · Tar_Cod 165*
