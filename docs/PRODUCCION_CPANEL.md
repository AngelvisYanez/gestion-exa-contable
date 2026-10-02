# Producción y despliegue — panel EXA Tareas (cPanel)

> **Hosting anterior.** Esta guía describe el cPanel viejo (`exackbqq@66.29.132.199`, puerto SSH 21098, app en `/home/exackbqq/gestion-app`). El dominio `gestion.exacontable.com` se mantiene; el host web vigente es **Plesk** (`199.89.55.69`). Usa [PRODUCCION.md](PRODUCCION.md).

> **Otro producto:** el ERP PHP **exa-ofsercont** (`exa.ofsercont.com` / `199.89.54.243`) se documenta **aparte** en  
> `../exa-ofsercont/docs/PRODUCCION_OFSERCONT.md`. No uses esta guía para desplegar Ofsercont.

Guía operativa de **exa-tareas-app** (panel EXA Tareas + API ExaMonitor) en el servidor de producción.

Hay **dos hosts distintos** (no mezclarlos):

| Rol | Host | Uso |
|-----|------|-----|
| **cPanel (app web)** | `66.29.132.199` · `gestion.exacontable.com` | Next.js / Passenger · SSH usuario cPanel · puerto **21098** |
| **MySQL EXA (ERP)** | `199.89.54.243` | Bases `exa` / `servicios` · **no** es el cPanel del subdominio |

| Dato | Valor |
|------|--------|
| URL producción | https://gestion.exacontable.com/ |
| SSH cPanel | `exackbqq@66.29.132.199` **-p 21098** (clave en la máquina de deploy; no `root@199.89…`) |
| Application Root | `/home/exackbqq/gestion-app` |
| Stack | Next.js 15 + Prisma + MySQL (`exa`, `servicios`) |
| Arranque cPanel | `server.js` (Passenger / Setup Node.js App) |

> **Por qué fallaba el SSH “a producción” en chats recientes:** se intentó `root@199.89.54.243` (servidor MySQL/ERP). El despliegue real de `gestion.exacontable.com` es al **cPanel** (`66.29.132.199:21098`). Son máquinas distintas.

> **No inventar secretos.** Las contraseñas, tokens y `DATABASE_URL` con clave van solo en el `.env` del servidor o del desarrollador. Aquí se usan placeholders.

---

## 1. Conectar por SSH (cPanel)

```bash
ssh -i /ruta/a/clave_cpanel -p 21098 exackbqq@66.29.132.199
```

En esta cuenta el acceso ya se usó con éxito para el primer despliegue. **No usar** `ssh root@199.89.54.243` para subir código: ese host es MySQL/ERP, no el document root de `gestion.exacontable.com`.

### 1.1 Si no tienes la clave

1. cPanel → **SSH Access** → autorizar tu clave pública.
2. O pedir la clave/usuario de la cuenta al administrador.

### 1.2 Síntomas

| Síntoma | Qué hacer |
|---------|-----------|
| `Permission denied` con `root@199.89…` | Estás en el host equivocado. Usar cPanel `exackbqq@66.29… -p 21098`. |
| `Permission denied` en cPanel | Verificar clave autorizada / puerto 21098. |
| App OK pero tablas MySQL faltan | El código corre en cPanel; el schema se crea en la BD EXA (`199.89…`) vía Prisma/`ensure*` o SQL en ese MySQL. |

---

## 2. Túnel MySQL: desarrollo local contra la BD EXA (Ofsercont)

MySQL del ERP vive en **`199.89.54.243`** (mismo VPS que `exa.ofsercont.com`), no en el cPanel de `gestion`. Detalle completo: [`../exa-ofsercont/docs/PRODUCCION_OFSERCONT.md`](../../exa-ofsercont/docs/PRODUCCION_OFSERCONT.md).

```bash
ssh -N -L 127.0.0.1:3307:127.0.0.1:3306 root@199.89.54.243
# Si hace falta: -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa
```

- Usuario: el del **VPS Ofsercont** (a menudo `root` u otro usuario del proveedor), **no** `exackbqq` del cPanel.
- Puerto local: `3307` → MySQL remoto `127.0.0.1:3306`

Si esta sesión termina (`Permission denied`, timeout, cierre de laptop), el puerto local `3307` deja de existir y Prisma/MySQL local fallarán hasta reabrir el túnel.

### 2.2 Variables en el `.env` local (con túnel activo)

```env
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3307
DATABASE_USER=<usuario_mysql>
DATABASE_PASSWORD=<password_mysql>
DATABASE_NAMES=exa,servicios
DATABASE_URL="mysql://<usuario_mysql>:<password_mysql>@127.0.0.1:3307/exa"
```

- `<usuario_mysql>` / `<password_mysql>`: credenciales MySQL de cPanel (*MySQL® Databases*), **no** confundir con el usuario SSH cPanel (pueden ser distintos).
- Plantilla base: [`.env.example`](../.env.example) (ajusta `DATABASE_PORT` a `3307` solo mientras el túnel esté activo).

### 2.3 Importante

| Entorno | Host / puerto MySQL |
|---------|---------------------|
| Local con túnel | `127.0.0.1:3307` |
| App en el servidor (prod) | `127.0.0.1:3306` (o el socket/host que use cPanel) **sin** túnel `3307` |

El túnel `3307` **solo existe en la PC de desarrollo**. En producción, `DATABASE_PORT` no debe apuntar a `3307`. Eso está anotado en [`server.js`](../server.js).

---

## 3. Variables de entorno en producción

En el servidor, el `.env` (o las variables de *Setup Node.js App* en cPanel) debe cubrir al menos:

```env
TZ=America/Guayaquil
NODE_ENV=production

# MySQL en el propio servidor (sin túnel)
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_USER=<usuario_mysql>
DATABASE_PASSWORD=<password_mysql>
DATABASE_NAMES=exa,servicios
DATABASE_URL="mysql://<usuario_mysql>:<password_mysql>@127.0.0.1:3306/exa"
DATABASE_CONNECTION_LIMIT=2
DATABASE_POOL_TIMEOUT=10
TELEMETRIA_MIRROR=0

TASKS_DB_DIS=exa
TASKS_EMP_COD=96

# Ruta ABSOLUTA en disco del servidor (no usar solo "capturas" relativo sin confirmar cwd)
CAPTURES_DIR=/ruta/absoluta/en/servidor/capturas

# Logs EXA si aplica en ese host
EXA_ERROR_LOG=/ruta/absoluta/a/logs

AUTH_SECRET=<secreto_largo_aleatorio>
EXA_MONITOR_API_KEY=<opcional>

# Briefs MD/PDF (proyecto gestion)
DOCS_DIR=/ruta/absoluta/en/servidor/docs
EXA_OFSERCONT_ROOT=/ruta/absoluta/a/exa-ofsercont
PUBLIC_APP_URL=https://gestion.exacontable.com

# Gemini 3 — brief con analisis del directorio (clave solo en .env del servidor)
BRIEF_LLM_ENABLED=1
GEMINI_API_KEY=<clave_google_ai>
GEMINI_MODEL=gemini-3.8-flash

# WhatsApp UltraMsg (off por defecto; misma API que relavera en ofsercont)
WHATSAPP_ENABLED=0
ULTRAMSG_INSTANCE_ID=
ULTRAMSG_TOKEN=
```

### Notas

- **`AUTH_SECRET`**: obligatorio para cookies de sesión (`exa_tareas_session`). Debe ser estable entre reinicios.
- **`CAPTURES_DIR`**: en local suele ser `capturas/` (relativo al cwd). En prod conviene una **ruta absoluta** con permisos de escritura para el usuario de la app Node (suele ser el mismo usuario cPanel).
- **`EXA_MONITOR_API_KEY`**: opcional; si se define, el agente debe enviarla.
- **`DOCS_DIR`**: salida de briefs (Markdown + PDF). Default relativo `docs/`.
- **`EXA_OFSERCONT_ROOT`**: código PHP para inventariar/leer archivos al generar el brief.
- **`GEMINI_API_KEY` / `GEMINI_MODEL`**: generación con Gemini 3 (`gemini-3.8-flash`). No commitear la clave.
- **PDF con diseño EXA**: el brief PDF se genera con ReportLab (mismo estilo que los PDF de `exa-ofsercont/docs`). En el servidor hace falta Python 3 + `pip install reportlab`. Opcional: `BRIEF_PDF_PYTHON=python3`.
- **`WHATSAPP_ENABLED`**: dejar en `0` hasta activar UltraMsg; teléfonos desde `persona.Prs_Cel` / `Prs_Tel` (usuarios EXA).
- No commitear `.env`. Usar `.env.example` como plantilla.

---

## 4. Build y despliegue (cPanel / LiteSpeed + Node)

Este repo incluye [`server.js`](../server.js) pensado para **Passenger / Setup Node.js App**:

- Archivo de inicio (startup file): **`server.js`**
- Si existe `PhusionPassenger`, escucha en `"passenger"`
- Si no, escucha en `PORT` (default `3000`) en `127.0.0.1`

No hay script `deploy` en `package.json`. El flujo es manual (SSH + panel).

### 4.1 Confirmar en cPanel (obligatorio)

En **Software → Setup Node.js App** (o equivalente LiteSpeed):

| Campo | Qué poner / verificar |
|-------|------------------------|
| **Application Root** | `/home/exackbqq/gestion-app` |
| **Application URL** | `gestion.exacontable.com` (o el subdominio/path asignado) |
| **Application startup file** | `server.js` |
| **Node.js version** | Compatible con Next.js 15 (recomendado 20.x LTS o la que ya tenga el site) |
| **Environment variables** | Las de la sección 3 (o un `.env` en el Application Root) |

Si el hosting usa **PM2** en lugar de Passenger, el equivalente sería `node server.js` o `npm run start` tras el build; este proyecto prioriza Passenger vía `server.js`.

### 4.2 Actualizar código en el servidor

Desde SSH (usuario cPanel), en el **Application Root** confirmado:

```bash
cd /ruta/application-root   # confirmar en cPanel; suele estar bajo /home/<usuario_cpanel>/

# Si el despliegue es por git:
git pull

# Dependencias (preferible lockfile limpio)
npm ci
# Si npm ci falla por entorno, alternativa: npm install

npx prisma generate
# o: npm run db:generate

npm run build
```

Scripts relevantes en `package.json`:

| Script | Comando |
|--------|---------|
| `build` | `next build` |
| `start` | `next start` (uso local/PM2; en cPanel Passenger usar `server.js`) |
| `db:generate` | `prisma generate` |

### 4.3 Reiniciar la app Node

En cPanel → Setup Node.js App → **Restart** / **Stop + Start** de la aplicación.

Alternativa por SSH (según cómo esté registrado el site): reinicio desde el mismo panel o el comando que el hosting documente para Passenger. Evitar asumir un `passenger-config` concreto sin verificarlo en el servidor.

### 4.4 Permisos de capturas

```bash
mkdir -p "$CAPTURES_DIR"   # o la ruta absoluta configurada
# Asegurar que el usuario de la app Node (cuenta cPanel) puede escribir ahí
```

---

## 5. Verificar tras el despliegue

### 5.1 API ExaMonitor

```text
https://gestion.exacontable.com/api/monitoreo
```

Ruta pública (sin sesión del panel). Debe responder de forma coherente (no 502/Passenger error). Probar también desde el agente con la URL de producción.

### 5.2 Panel

```text
https://gestion.exacontable.com/login
```

Login: **cédula + contraseña EXA** (tabla `usuarios`). Tras login, encargados → dashboard; desarrolladores → `/mis-tareas`.

Otras rutas útiles:

| URL | Qué comprueba |
|-----|----------------|
| `/` | Dashboard (rol encargado) |
| `/api/capturas/...` | Servir capturas si `CAPTURES_DIR` está bien |
| `/configuracion/examonitor` | Políticas del agente |

### 5.3 ExaMonitor.exe — URL en producción

En el `config.json` del agente (o la UI de configuración del .exe), apuntar al servidor de producción:

```json
{
  "server_url": "https://gestion.exacontable.com",
  "api_path": "/api/monitoreo",
  "db_dis": "exa",
  "cedula": ""
}
```

Equivalente: base `https://gestion.exacontable.com` + path `/api/monitoreo` →  
`https://gestion.exacontable.com/api/monitoreo`

La contraseña **no** se guarda en `config.json`. Login del agente = misma cédula/clave EXA del panel.

---

## 6. Checklist post-deploy

- [ ] SSH OK con `<usuario_cpanel>@199.89.54.243` (no `root`); SSH Access y clave autorizada si aplica.
- [ ] Túnel MySQL local (si se usa) con el mismo usuario cPanel: `-L 127.0.0.1:3307:127.0.0.1:3306`.
- [ ] Application Root / URL / startup file (`server.js`) confirmados en cPanel.
- [ ] `.env` de producción con MySQL en `3306` (o host local del servidor), **sin** puerto de túnel `3307`.
- [ ] `AUTH_SECRET` definido y estable.
- [ ] `CAPTURES_DIR` es ruta del servidor con escritura para el usuario de la app.
- [ ] `npm ci` (o `npm install`) + `npx prisma generate` + `npm run build` sin error.
- [ ] App Node reiniciada en cPanel / Passenger.
- [ ] https://gestion.exacontable.com/login carga y permite login EXA.
- [ ] https://gestion.exacontable.com/api/monitoreo responde (sin 502).
- [ ] ExaMonitor en equipos de prod usa `server_url` = `https://gestion.exacontable.com`.
- [ ] Captura de prueba del agente aparece en disco bajo `CAPTURES_DIR` y se ve en el panel.
- [ ] No se ha subido `.env` ni secretos al repositorio git.

---

## 7. Desarrollo local (recordatorio breve)

```bash
cp .env.example .env
# Por defecto: MySQL local 127.0.0.1:3306 / schema `exa` (TASKS_DB_DIS=exa).
# Si usas BD de prod: abrir túnel SSH (sección 2) y DATABASE_PORT=3307.
npm install
npx prisma generate
npm run dev
```

Abrir http://localhost:3000 → `/login`.

### 7.1 Tablas ExaMonitor (`aud_dev_*`)

El panel `/monitoreo` y el historial usan `aud_dev_telemetria` (+ `aud_dev_monitoreo_config`, `aud_dev_monitoreo_global`) en el schema **`exa`** (no `servicios`, salvo mirror).

Si aparece `The table aud_dev_telemetria does not exist`:

1. Confirmar `DATABASE_URL` / `DATABASE_PORT` (local `3306` o túnel `3307`) y schema `exa`.
2. Aplicar DDL idempotente: [`prisma/sql/create_monitoreo_tables.sql`](../prisma/sql/create_monitoreo_tables.sql) en `exa` (y `servicios` si se usa mirror).
3. O ejecutar: `node scripts/ensure-monitoreo-tables.js` (respeta `.env`; `--local` fuerza `127.0.0.1:3306`).
4. En runtime, `ensureMonitoreoSchema()` también hace `CREATE TABLE IF NOT EXISTS` de esas tres tablas al tocar `/api/monitoreo` o listados de monitoreo (código desplegado).

Comprobación rápida:

```sql
SELECT Tel_Cod FROM aud_dev_telemetria LIMIT 1;
```

Para ExaMonitor en local:

```json
{
  "server_url": "http://localhost:3000",
  "api_path": "/api/monitoreo",
  "db_dis": "exa",
  "cedula": ""
}
```

---

## Referencias en el repo

| Archivo | Rol |
|---------|-----|
| [`server.js`](../server.js) | Entrypoint Passenger / cPanel |
| [`.env.example`](../.env.example) | Plantilla de variables |
| [`package.json`](../package.json) | `build`, `start`, `db:generate` |
| [`README.md`](../README.md) | Arranque local, auth, ExaMonitor |
| [`prisma/sql/create_monitoreo_tables.sql`](../prisma/sql/create_monitoreo_tables.sql) | DDL `aud_dev_*` (telemetría / config / global) |
| [`scripts/ensure-monitoreo-tables.js`](../scripts/ensure-monitoreo-tables.js) | Aplica ese DDL + columnas en `exa`/`servicios` |
