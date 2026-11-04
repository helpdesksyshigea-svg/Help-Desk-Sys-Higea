# Despliegue en servidor propio — Help Desk SYS HIGEA

Guía para desplegar esta app en un servidor propio del E.S.E. Hospital Orito (no
la infraestructura actual en Render + Supabase Cloud, un servidor modesto del
hospital). Escrita para que otra persona/IA de TI del hospital pueda ejecutar
el despliegue sin haber visto el proyecto antes.

## 0. Qué es esta app

Mesa de ayuda interna (tickets, aprobaciones, oficios firmados) para el
hospital. Dos proyectos Node **independientes** en el mismo repo, sin
`package.json` raíz ni monorepo:

- `api/` — backend Express (API REST)
- `web/` — frontend React (SPA, servida como archivos estáticos tras el build)

La base de datos, autenticación y almacenamiento de archivos **no viven en
este servidor**: todo pasa por **Supabase Cloud** (Postgres + Auth + Storage),
un servicio hospedado externo. El servidor propio solo aloja la API y los
archivos estáticos del frontend; Supabase sigue siendo el backend de datos.

> Migrar Supabase a una instancia self-hosted sería un cambio arquitectónico
> grande, no cubierto por este documento ni por el código actual. Lo más
> simple y lo recomendado es mantener el proyecto Supabase Cloud existente
> (o crear uno nuevo) y apuntar el servidor del hospital a él.

## 1. Requisitos del servidor

- **Node.js 20 LTS** (el repo no fija versión vía `engines`, pero el stack
  — Express 4, React 19, Vite 8 — es compatible con Node 20; usar esa versión
  por seguridad y soporte).
- `npm` (viene con Node).
- Acceso saliente a internet (HTTPS) hacia `*.supabase.co` — el backend y el
  frontend hablan con Supabase por HTTPS, no hay nada que instalar localmente
  para la base de datos.
- Un proxy reverso (nginx o Caddy) si se quiere servir todo bajo un solo
  dominio/puerto 443 con HTTPS — recomendado para un hospital (datos de
  pacientes en los adjuntos).
- **`sharp` (dependencia nativa)**: la API usa `sharp@0.35.5`, que trae un
  binario precompilado de `libvips` por plataforma/arquitectura. Al hacer
  `npm install` en el servidor, npm debe descargar el binario correcto para
  ese SO/arquitectura automáticamente; si falla, puede requerir
  `npm rebuild sharp` o revisar que la arquitectura (x64/arm64) tenga binario
  disponible para esa versión.
- `potrace` (dependencia npm) trae su binario empaquetado, no requiere
  instalar `potrace` aparte en el sistema operativo.

No se usa Docker en el repo actual (no hay `Dockerfile` ni
`docker-compose.yml`). Se puede dockerizar si TI del hospital lo prefiere,
pero esta guía asume instalación directa con Node + un gestor de procesos
(ej. `pm2` o un servicio `systemd`).

## 2. Clonar y preparar

```bash
git clone <url-del-repo> help-desk-sys-higea
cd help-desk-sys-higea
```

Instalar dependencias en cada proyecto por separado (no hay workspaces):

```bash
cd api && npm install
cd ../web && npm install
```

## 3. Supabase: qué se necesita

Esta app depende de un **proyecto Supabase** ya existente (o uno nuevo que
cree el hospital). De ese proyecto se necesitan, desde *Settings → API*:

- **Project URL** (ej. `https://xxxxxxxx.supabase.co`)
- **`anon` public key** (para el frontend)
- **`service_role` key** (SECRETA — para el backend; tiene acceso total a la
  base de datos saltándose las reglas de seguridad por fila, nunca debe
  exponerse al navegador ni subirse a git)

### 3.1 Si el hospital usa el proyecto Supabase ya existente del sistema actual

Pedir esas tres credenciales al administrador actual del proyecto. Es la
opción más simple: no hay que migrar datos ni recrear el esquema.

### 3.2 Si el hospital crea un proyecto Supabase nuevo (ambiente propio)

Hay que recrear el esquema desde cero, en este orden, usando el **SQL
Editor** del panel de Supabase (o `psql` contra la connection string del
proyecto):

1. `db/schema.sql` — esquema completo: roles, permisos, tabla `usuarios`
   (su `id` debe coincidir con `auth.users.id` de Supabase Auth), tickets,
   adjuntos, etc.
2. `db/seed.sql` — datos semilla: SLA, tipos de solicitud, motivos, festivos
   colombianos, catálogo de roles y permisos. **No crea usuarios ni datos de
   pacientes**, es seguro de correr en cualquier ambiente.
3. `db/storage_setup.sql` — crea el bucket de Storage `adjuntos` (privado).
4. Cada archivo de `db/migrations/`, **en orden numérico ascendente**
   (`0001_...sql`, `0002_...sql`, ... hasta `0023_...sql` al momento de
   escribir esto — revisar la carpeta por si hay migraciones más nuevas).

No hay herramienta de migraciones automatizada (no Prisma/Knex); se ejecutan
manualmente, un archivo a la vez, verificando que cada uno corra sin error
antes de seguir con el siguiente.

**Primer usuario administrador**: no existe un script de seed para esto.
Hay que:
1. Invitar al usuario desde el panel de Supabase Auth (o con la Admin API),
2. Insertar una fila correspondiente en la tabla `usuarios` con ese mismo
   `id` (igual al `id` de `auth.users`) y el `rol_id` de administrador.

## 4. Variables de entorno

### 4.1 Backend — `api/.env` (crear a partir de `api/.env.example`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `PORT` | No (default 4000) | Puerto donde escucha la API. |
| `SUPABASE_URL` | Sí | URL del proyecto Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sí | Clave secreta de Supabase (service role). **Nunca** commitear ni compartir fuera del servidor; da acceso total a la base de datos. |
| `WEB_ORIGIN` | Sí | Origen exacto (protocolo + dominio + puerto, sin `/` final) desde donde se sirve el frontend — se usa para CORS. Ej: `https://helpdesk.hospitalorito.gov.co`. **Ojo**: el código solo acepta un único origen (string, no lista) — si el frontend se sirve en más de un dominio/puerto habría que ajustar `api/src/server.js`. |
| `CRON_SECRET` | No, pero recomendada | Contraseña compartida que protege el endpoint `POST /cron/limpiar-tickets` (ver sección 6). Generar un valor aleatorio largo propio del hospital — no reutilizar ningún valor visto en capturas de pantalla o conversaciones previas. |
| `RESEND_API_KEY` | No | Si se configura, habilita el envío de correos (invitaciones, recuperación de contraseña) vía Resend. Si falta, la app sigue funcionando: solo se omite el envío de correo (se loguea un warning). |
| `RESEND_FROM` | No | Remitente de los correos si se usa Resend. Default: `Mesa de ayuda SYS HIGEA <onboarding@resend.dev>`. |

### 4.2 Frontend — `web/.env` (crear a partir de `web/.env.example`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | Sí | Misma URL del proyecto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Sí | Clave pública (`anon`) de Supabase — se usa solo para login/logout vía Supabase Auth; ninguna autorización de negocio depende de ella, eso lo resuelve siempre el backend. Es segura de exponer en el navegador. |
| `VITE_API_URL` | Sí | URL pública donde queda expuesta la API del backend (sección 6). Ej: `https://helpdesk.hospitalorito.gov.co/api` o `http://servidor-interno:4000`. |

**Importante**: las variables `VITE_*` se inyectan **en tiempo de build**, no
en tiempo de ejecución. Si se cambia alguna después, hay que volver a correr
`npm run build`.

## 5. Build del frontend

```bash
cd web
npm run build
```

Genera `web/dist/` — una SPA estática (HTML/JS/CSS). El backend Express
**no sirve estos archivos** (no tiene `express.static` configurado) — hay que
servirlos con otra herramienta:

- **Opción simple**: `npx serve -s dist -l 5173` (o cualquier servidor de
  archivos estáticos).
- **Opción recomendada para producción**: nginx o Caddy sirviendo
  `web/dist/` como raíz, con fallback de SPA (toda ruta que no sea un
  archivo real debe devolver `index.html` con status 200) — necesario porque
  usa React Router (`BrowserRouter`) y al refrescar en una ruta como
  `/tickets/123` el servidor debe devolver igual `index.html`. El repo ya
  trae `web/public/_redirects` con esa regla en sintaxis de Render/Netlify;
  en nginx el equivalente es:
  ```nginx
  location / {
    try_files $uri /index.html;
  }
  ```

## 6. Arranque del backend

```bash
cd api
npm start   # equivale a: node src/server.js
```

Escucha en `process.env.PORT` (default 4000). Para producción, usar un
gestor de procesos que lo reinicie si cae y lo levante al reiniciar el
servidor:

```bash
npm install -g pm2
pm2 start src/server.js --name helpdesk-api --cwd api
pm2 save
pm2 startup   # sigue las instrucciones que imprime para arranque automático
```

(O un unit de `systemd` equivalente, si el hospital lo prefiere.)

### Endpoints que monta la API (`api/src/server.js`)

Health check, `me` (perfil propio), tickets, adjuntos, admin, catálogos,
cron, dashboard, perfil. Todo bajo el mismo puerto/origen — no hay
microservicios separados.

## 7. Proxy reverso (recomendado)

Para exponer todo bajo un solo dominio con HTTPS, usar nginx/Caddy así:

- `/` → sirve `web/dist/` (con el fallback de SPA de la sección 5)
- `/api/*` (o el path que se elija, coincidiendo con `VITE_API_URL`) → proxy
  reverso hacia `http://localhost:4000` (el backend Express)

Dado que hay datos de pacientes en los adjuntos, **HTTPS no es opcional**:
usar un certificado real (Let's Encrypt si el servidor tiene dominio público,
o el certificado interno del hospital si es solo red interna).

## 8. Almacenamiento de archivos (adjuntos, firmas)

Todo el almacenamiento de archivos vive en **Supabase Storage**, no en disco
local del servidor del hospital. Un único bucket privado: `adjuntos`.

- Adjuntos de tickets (facturas, oficios escaneados, etc.)
- Firmas de usuario, bajo el prefijo `firmas/`
- Nunca se generan URLs públicas: todo acceso usa URLs firmadas de corta
  duración (60 segundos) generadas por el backend con la service role key.

El branding estático (logo del hospital, imágenes de la animación del
login, manual de usuario) **sí** vive dentro del repo, en
`web/public/branding/` y `web/public/manual/`, y se despliega como parte
del build del frontend — no requiere configuración aparte.

## 9. Tarea programada (limpieza de tickets antiguos)

Actualmente esto lo dispara un GitHub Action (`.github/workflows/limpieza-tickets.yml`),
cron diario a las 10:00 UTC (5:00 a.m. Colombia), que hace:

```
POST {URL_PUBLICA_DEL_BACKEND}/cron/limpiar-tickets
Header: X-Cron-Secret: <valor de CRON_SECRET>
```

Si el hospital no usa GitHub Actions, hay que replicar esa llamada HTTP con
lo que tengan disponible: un cron del sistema operativo + `curl`, o el
Task Scheduler de Windows si el servidor es Windows. Ejemplo con cron de
Linux:

```cron
0 5 * * * curl -s -X POST https://helpdesk.hospitalorito.gov.co/api/cron/limpiar-tickets -H "X-Cron-Secret: <valor-secreto>"
```

Si `CRON_SECRET` no se configura, el endpoint simplemente rechaza todas las
llamadas con 401 — el resto de la app sigue funcionando normal, solo no se
ejecuta la limpieza automática.

## 10. Checklist de verificación post-despliegue

1. `curl https://<dominio>/api/health` (o el path de health check) responde OK.
2. Abrir el frontend en el navegador, la página de login carga sin errores
   de consola (revisar que `VITE_SUPABASE_URL`/`VITE_API_URL` quedaron bien
   embebidos en el build).
3. Iniciar sesión con el usuario administrador creado en la sección 3.2 (o
   uno existente si se reutiliza el proyecto Supabase actual).
4. Crear un ticket de prueba, adjuntar un archivo, verificar que se puede
   ver/descargar (confirma que Storage y las URLs firmadas funcionan).
5. Refrescar el navegador estando en una ruta interna (ej. `/tickets/1`) —
   debe seguir funcionando y no dar 404 (confirma el fallback de SPA del
   proxy/servidor estático).
6. Probar manualmente el endpoint de cron con `curl` y el header correcto,
   confirmar que responde 200 y no 401.

## 11. Notas de seguridad

- `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET` son secretos — guardarlos solo
  en el archivo `.env` del servidor (que ya está en `.gitignore`), nunca en
  el repo, capturas de pantalla, tickets de soporte o chats.
- Generar valores nuevos para `CRON_SECRET` en este despliegue — no reusar
  ninguno visto en el repo original o en otras conversaciones.
- El dato manejado (tickets de facturación, adjuntos, posible información de
  pacientes) exige HTTPS en todo el tráfico expuesto a internet y backups
  periódicos de la base de datos (gestionados del lado de Supabase si se usa
  el proyecto Cloud; `Settings → Database → Backups` en el panel de
  Supabase).
