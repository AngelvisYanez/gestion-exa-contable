# EXA Tareas App

Repositorio: https://github.com/AngelvisYanez/gestion-exa-contable.git

App **Next.js + TypeScript + Prisma** para gestión de tareas y monitoreo Hubstaff-like, conectada a las **bases MySQL distribuidas** del ERP EXA (`exa`, `servicios`).

UI alineada al dashboard modern del módulo PHP (`ges_dashboard_modern.css` / `ges_mod_dashboard_tareas_1.0.php`).

## Arranque

```bash
cd exa-tareas-app
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

Abrir http://localhost:3000 → redirige a `/login`.

## Credenciales de acceso

El login usa **cédula + contraseña EXA** (tabla `usuarios` de la BD), no usuarios ficticios.

Tras login, los desarrolladores van a `/mis-tareas` (tareas de `aud_tareas` + tickets con `Ase_Cod` = su `Usu_Cod`).

Proyectos: **EXA** (`exa`) y **Servicios** (`servicios`).

Los desarrolladores solo ven tareas asignadas a su ficha en `personal` (match por nombre). Si no hay match, el panel avisa para vincular `Per_Cod`. Los tickets asignados sí aparecen si el `Usu_Cod` de sesión coincide con `tickets.Ase_Cod`.

## Auth

- Cookie firmada `exa_tareas_session` (`AUTH_SECRET`)
- Middleware protege `/`, `/tareas`, `/tickets`, `/mis-tareas`, `/api/tareas`, `/api/devs`, `/api/tickets`, `/api/dashboard`
- Público: `/login`, `/api/auth/login`, `/api/monitoreo` (ExaMonitor), `/api/capturas`

### Modulos

| Ruta | Rol | Contenido |
|------|-----|-----------|
| `/` | Encargado | Dashboard: KPIs, metricas y graficos |
| `/tareas` | Encargado | Lista + Kanban, crear/asignar/avance |
| `/tickets` | Encargado | Bandeja de tickets y asignacion al equipo |
| `/configuracion` | Encargado | Hub de administracion |
| `/configuracion/general` | Encargado | Proyecto, equipo, notificaciones y dominio |
| `/configuracion/incidencias` | Encargado | Monitor de errores EXA → generar/asignar tareas |
| `/configuracion/examonitor` | Encargado | Politicas ExaMonitor (capturas, horario, retencion) |
| `/mis-tareas` | Todos | Tareas asignadas al usuario |

En **Configuracion > Usuarios**, el encargado puede filtrar usuarios por rol y restringir
permisos de Tareas y Tickets (ver, crear, editar, asignar, eliminar y registrar avances).
Los permisos iniciales conservan el comportamiento actual; un rol no puede recibir
acciones que antes no tenia. El acceso a Monitoreo y Configuracion sigue reservado al
encargado. Los cambios de permisos del panel se aplican cuando el usuario vuelve a
iniciar sesion.

## Exportar rendimiento

El dashboard del encargado incluye **Exportar PDF** y **Exportar CSV** junto a los filtros.
Las descargas usan el proyecto, el período y la persona de los datos cargados; se bloquean
mientras se actualizan las métricas o cuando la consulta falla.

El PDF contiene KPIs, desglose por persona y tendencia diaria. El CSV usa UTF-8 con BOM,
separador `;` y una fila por persona, listo para abrir en una hoja de cálculo.
El reporte también incluye monitoreo por desarrollador: primera conexión, última señal,
tiempo activo reportado, actividad, clics, teclas, líneas estimadas y capturas. El PDF
añade detalle diario y los cinco procesos con más registros. Las fechas corresponden
a America/Guayaquil. El agente no registra un cierre de sesión confirmado: se indica
`No registrado`, sin sustituirlo por la última señal. Los datos ausentes se muestran
como `Sin datos`; las consultas fallidas se identifican como información parcial.
Si el período seleccionado no contiene telemetría, el dashboard muestra las fechas
disponibles y permite consultarlas con **Ver período con telemetría**. El PDF también
indica el período consultado y las fechas con registros, sin mezclar ambos rangos.
Las tareas compartidas cuentan para cada persona asignada: la suma por persona puede
superar el total de tareas del resumen.

## ExaMonitor.exe

Login con **cédula + contraseña EXA** (mismo usuario del panel). Ya no usa Per_Cod fijo.

```json
{
  "server_url": "http://localhost:3000",
  "api_path": "/api/monitoreo",
  "db_dis": "exa",
  "cedula": ""
}
```

La contraseña no se guarda en `config.json`.

El agente lista **Mis tareas** (tareas + tickets abiertos) con estado, avance % y fecha de vencimiento. El programa vive en `agente_monitoreo/`. Las versiones compiladas están en `agente_monitoreo/VERSIONES.md` (la vigente es `dist/ExaMonitor.exe`). Las capturas se guardan en `capturas/` (`CAPTURES_DIR`). Recompilar con:

```bash
cd agente_monitoreo
py -m PyInstaller --noconfirm --distpath dist --workpath build ExaMonitor.spec
```
## Variables `.env`

| Variable | Uso |
|----------|-----|
| `DATABASE_*` / `DATABASE_URL` | MySQL |
| `DATABASE_NAMES` | `exa,servicios,relavera` |
| `CAPTURES_DIR` | Carpeta de capturas del agente (`capturas/`) |
| `EXA_ERROR_LOG` | Carpeta/archivo de logs EXA (`exa-ofsercont/logs`) |
| `AUTH_SECRET` | Firma de sesión |
| `EXA_MONITOR_API_KEY` | Opcional para el agente |

## Base de datos

El schema Prisma (`prisma/schema.prisma`) documenta relaciones, índices y el modelo auxiliar `aud_tickets`. La app de tickets en producción sigue usando la tabla legacy `tickets`.

Para aplicar índices y diagnóstico de huérfanos (sin FKs agresivas):

```bash
# En cada BD de DATABASE_NAMES (exa, servicios), ejecutar:
#   prisma/sql/improve_schema.sql
npx prisma generate
```

FKs a nivel MySQL van comentadas en ese SQL: descomentar solo cuando los `SELECT` de huérfanos den `n=0`. Retención de telemetría sugerida: 90 días (`TELEMETRIA_RETENCION_DIAS` en `src/lib/domain-constants.ts`).

Retención de **screenshots** (disco): configurable en `/configuracion/examonitor` (1 día / 1 semana / 1 mes / 3 meses / personalizado). Tabla `aud_dev_monitoreo_global` — SQL `prisma/sql/add_monitoreo_retencion.sql` (también se crea sola al usar la API).

**Horario laboral + almuerzo:** en la misma pantalla se puede activar horario automático (Guayaquil) y una pausa de almuerzo (p. ej. 13:00–14:00) que deja `Mon_Activo=0` durante esa hora. SQL `prisma/sql/add_monitoreo_almuerzo.sql` (también se crea sola al usar la API).
