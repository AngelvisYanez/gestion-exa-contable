# EXA Tareas App

Repositorio: https://github.com/AngelvisYanez/gestion-exa-contable.git

App **Next.js + TypeScript + Prisma** para gestión de tareas y monitoreo Hubstaff-like, conectada a las **bases MySQL distribuidas** del ERP EXA (`exa`, `servicios`).

Producción (`https://gestion.exacontable.com`): [docs/PRODUCCION.md](docs/PRODUCCION.md) (Plesk). El hosting cPanel anterior está en [docs/PRODUCCION_CPANEL.md](docs/PRODUCCION_CPANEL.md).

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

| Rol | Quién | Cómo entrar |
|-----|--------|-------------|
| Encargado | Francisco / Angelvis | Su cédula EXA + clave EXA |
| Desarrollador | Leonel (Wilson), Jose, Patricio (Patrick), Nathaly | Su cédula EXA + clave EXA |

Tras login, los desarrolladores van a `/mis-tareas` (tareas de `aud_tareas` + tickets con `Ase_Cod` = su `Usu_Cod`).

Si no conoces la cédula/clave de un programador, pídesela a él o consulta su ficha en EXA (no están hardcodeadas en la app).

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

El agente lista **Mis tareas** (tareas + tickets abiertos) con estado, avance % y fecha de vencimiento. El programa vive en `agente_monitoreo/` y el ejecutable en `agente_monitoreo/dist/ExaMonitor.exe`. Las capturas se guardan en `capturas/` (`CAPTURES_DIR`). Recompilar con:

```bash
cd agente_monitoreo
py -m PyInstaller --noconfirm --distpath dist --workpath build ExaMonitor.spec
```
## Variables `.env`

| Variable | Uso |
|----------|-----|
| `DATABASE_*` / `DATABASE_URL` | MySQL |
| `DATABASE_NAMES` | `exa,servicios` |
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
