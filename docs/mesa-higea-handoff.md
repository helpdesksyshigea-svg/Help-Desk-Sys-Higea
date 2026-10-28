# Mesa de ayuda SYS HIGEA — documento de traspaso

**Institución:** E.S.E. Hospital Orito — Proceso de Facturación
**Responsable funcional:** Maribel Guerra Gómez (Supervisora de Facturación)
**Estado:** versión 3 publicada el 28/10/2026, en piloto
**Artefacto:** https://claude.ai/artifact/3yYuRUfTBx73R5CSQyK54j

---

## 1. Problema que resuelve

Facturación solicita a SYS HIGEA, el proveedor del software, unas **25 eliminaciones al mes** de laboratorios mal facturados y de historias clínicas. Hoy todo se hace por oficio y correo electrónico, y eso trae cuatro problemas:

- No hay trazabilidad ni estado de cada caso.
- No hay plazos medibles.
- La supervisora no controla qué sale hacia el proveedor.
- Las respuestas quedan dispersas en hilos de correo.

La mesa reemplaza el correo por **tiquetes** con aprobación previa, oficio firmado adjunto, plazos (ANS) y cierre documentado por el proveedor.

## 2. Flujo

```
Facturador radica ──► Supervisora aprueba ──► HIGEA toma el caso ──► HIGEA reporta realizado y cierra
   (pendiente)            (aprobado)              (en_proceso)                 (cerrado)
        ▲                     │                        │
        └──── devuelto ◄──────┘                        ├──► requiere_info ──► facturación responde ──► en_proceso
                                                       │
                          supervisora puede reabrir ◄──┘ (desde cerrado → en_proceso)
```

| Estado | Etiqueta en pantalla | Quién lo produce |
|---|---|---|
| `pendiente` | Pendiente de aprobación | Facturador al radicar o reenviar |
| `devuelto` | Devuelto al facturador | Supervisora (nota obligatoria) |
| `aprobado` | Enviado a HIGEA | Supervisora (exige oficio adjunto) |
| `en_proceso` | En gestión HIGEA | HIGEA "Tomar caso", o respuesta del hospital |
| `requiere_info` | HIGEA requiere información | HIGEA (nota obligatoria) |
| `cerrado` | Realizado y cerrado | HIGEA "Reportar realizado y cerrar" (nota obligatoria) |

**Regla clave:** un tiquete solo cuenta como aprobado si existe un documento `aprobaciones/{ticketId}` con `decision: "aprobado"`. Ese documento solo lo puede escribir la dueña del artefacto. Si un ticket dice `estado: "aprobado"` (o un estado posterior) pero no tiene aprobación válida, la página lo muestra como `pendiente` y HIGEA no lo ve. Ver la función `est(t)`.

## 3. Roles

| Rol | Cómo se asigna | Qué ve y hace |
|---|---|---|
| **Supervisora** | Automático: la dueña del artefacto (`user.isOwner()`) | Todo. Aprueba o devuelve, reabre, corrige roles. Su selector "Ver como" le permite previsualizar las otras vistas. Los tiquetes que ella crea quedan aprobados de una vez. |
| **Facturación** | La persona lo elige en su primer ingreso (`miembros/{id}`) | Radica, edita mientras está pendiente o devuelto, y responde a HIGEA |
| **SYS HIGEA** | La persona lo elige en su primer ingreso | Ve solo los tiquetes aprobados. Toma, pide información y cierra. |

> La elección de rol es autodeclarada. La supervisora la corrige en el panel *Equipo y roles*. Lo único protegido por el servidor es la aprobación.

## 4. Plazos (ANS)

En días hábiles (lunes a viernes, **sin festivos colombianos**), contados **desde la aprobación**:

- Alta: 1 día
- Normal: 2 días
- Baja: 5 días

Un tiquete está vencido si está en `aprobado` o `en_proceso` y ya pasó la fecha límite. El tiempo en `requiere_info` no se descuenta.

## 5. Arquitectura técnica

Es una sola página HTML (vanilla JS, sin librerías) publicada como **Artifact de claude.ai**, con capacidades de ejecución del runtime de artefactos (contrato `0.2.92`):

```json
{
  "db": { "rules": [
    { "path": "aprobaciones",     "read": "view", "write": "owner" },
    { "path": "miembros",         "read": "view", "write": "owner" },
    { "path": "miembros/{self}",  "read": "view", "write": "interact" }
  ]},
  "user":   { "scopes": ["profile"] },
  "assets": { "upload": "interact" }
}
```

- `db`: almacén de documentos compartido y en tiempo real (`onSnapshot`).
- `user`: identidad (`id()`, `isOwner()`, `profiles()` para nombres y avatares). Solo se guardan ids, nunca nombres.
- `assets`: subida de PDF o imágenes (máximo 20 MB). En los documentos se guarda el `id`; la URL para mostrarlo es `/_blob/{id}`.

Fuentes: Google Fonts (Bricolage Grotesque, Instrument Sans, IBM Plex Mono). Tema claro y oscuro con tokens CSS.

### 5.1 Modelo de datos

**`tickets/{autoId}`**
```js
{
  code: "TK-261028-X7Q",          // visible, generado en el cliente
  tipo: "lab" | "factura" | "hc" | "otro",
  motivo: "arl_vencida" | "doble" | "no_corresponde" | "registro" | "hc_error" | "otro",
  prioridad: "alta" | "normal" | "baja",
  estado: "pendiente" | "devuelto" | "aprobado" | "en_proceso" | "requiere_info" | "cerrado",
  solicitante: "Nombre de quien firma",  solicitanteId: "u_…",
  observacion: "texto libre",
  items: [{ factura, paciente, documento, cups, descripcion, fecha }], // cups = folio si tipo hc
  adjuntos: [{ id, name, type, size, kind: "oficio"|"soporte"|"evidencia", by, rol, at }],
  createdAt, enviadoAt, updatedAt, aprobadoAt, cerradoAt,   // ISO 8601
  historial: [{ at, by, rol, texto, firma, estado?, adj? }]
}
```

**`aprobaciones/{ticketId}`** (solo la dueña escribe)
```js
{ decision: "aprobado" | "devuelto", at, by, nota }
```

**`miembros/{userId}`** (cada persona escribe el suyo; la dueña escribe cualquiera)
```js
{ rol: "facturacion" | "higea", at, por }
```

### 5.2 Mapa del código (todo en el `<script>`)

| Bloque | Funciones |
|---|---|
| Catálogos | `TIPOS`, `MOTIVOS`, `ESTADOS`, `PRIO`, `ROLES` |
| Reglas del flujo | `est()`, `approved()`, `aprobAt()`, `due()`, `isOver()`, `FILTERS` por rol |
| Bandeja e indicadores | `renderFlow()`, `renderChips()`, `renderList()`, `renderCauses()` |
| Expediente | `renderDetail()`, `actionsFor()` (matriz rol × estado), `act()` (escrituras), `renderTimeline()` |
| Adjuntos | `pickFiles()`, `uploadFiles()`; los adjuntos pendientes viven en `S.pend` hasta la siguiente acción |
| Formulario | `renderForm()` sirve para nuevo y para edición, y valida el oficio obligatorio |
| Ingreso | `renderOnboard()`, `applyRole()`, `renderTeam()` |
| Arranque | IIFE final: `claude.use("db" / "user" / "assets")`, tres suscripciones |

## 6. Cómo seguir desarrollando

1. **Editar:** modificar el HTML del anexo (sección 9). El archivo no lleva `<html>` ni `<head>`, porque la plataforma los agrega al publicar.
2. **Publicar:** desde una conversación de Claude con la herramienta Artifact, publicar sobre la URL existente (`url` = la del artefacto) para conservar los datos. **Debe hacerlo la dueña** o alguien con permiso de edición.
3. **Capacidades:** si se omite `capabilities` al republicar, se conservan las actuales. Si se cambian, hay que declarar el conjunto completo; lo que no se repita se revoca.
4. **Datos:** se pueden leer y sembrar desde Claude con la herramienta ArtifactData (colecciones `tickets`, `aprobaciones`, `miembros`).

## 7. Limitaciones conocidas

- **Acceso:** cada usuario necesita una cuenta de claude.ai con el correo invitado y la sesión iniciada en el navegador. Sin sesión aparece "No se pudo abrir la base compartida".
- **Usuarios externos a la organización** (HIGEA y, si la cuenta es personal, también los facturadores): según la ayuda de Claude, con permiso de edición solo pueden subir imágenes y video, **no PDF**. La página pide el oficio como foto JPG/PNG cuando el PDF falla.
- **No está confirmado** que una cuenta gratuita pueda escribir en un artefacto compartido. Hay que probarlo en el piloto.
- **Enlace público:** si el artefacto se comparte como "cualquiera con el enlace", los invitados externos pierden el permiso de escritura y los datos de pacientes quedan expuestos. Debe compartirse **solo por correo, como Editor**.
- **Sin notificaciones:** la mesa no envía correos. El botón "Copiar como correo" genera el texto para avisar manualmente.
- **Concurrencia:** `historial` y `adjuntos` son arreglos reescritos completos (gana la última escritura). Con el volumen actual el riesgo es bajo.
- **ANS sin festivos colombianos.**
- La gráfica de causas usa el motivo del tiquete para todos sus registros.

## 8. Mejoras sugeridas (backlog)

1. Calendario de festivos de Colombia en `addBiz()` y `bizDays()`.
2. Motivo por registro (`items[].motivo`) para que la gráfica de causas sea exacta.
3. Exportar a Excel el informe mensual (radicados, tiempos, vencidos por prioridad), por ejemplo para el comité.
4. Avisos: una tarea programada que envíe un resumen diario por correo o a un canal.
5. Mover `historial` a una subcolección (`tickets/{id}/eventos`) para evitar pérdidas por escrituras simultáneas.
6. Validar que el documento del paciente y el formato de factura (FEV, CAP…) sean consistentes.
7. Sellar la aprobación: guardar en `aprobaciones` un hash de los `items` aprobados y marcar el tiquete si cambian después de aprobado.

## 9. Anexo — código fuente completo (`mesa-higea.html`)

```html
<title>Mesa de ayuda SYS HIGEA</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: cinta de flujo (radicado → aprobación → HIGEA → cerrado) con indicadores, bandeja a la izquierda y expediente del tiquete a la derecha; apilado en celular */
:root{
  --bg:#f2f5f4; --panel:#ffffff; --ink:#13201e; --muted:#586a66; --line:#d9e2df; --soft:#e8eeec;
  --accent:#0f6e64; --accent-ink:#ffffff; --accent-soft:#d6ebe7;
  --warn:#9a5b06; --warn-soft:#fbeed6; --bad:#b3362a; --bad-soft:#f8e0dc; --ok:#2c7536; --ok-soft:#ddefdf; --info:#3656a3; --info-soft:#e1e8f8; --violet:#6a3fa0; --violet-soft:#ece3f7;
  --f-display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif;
  --f-body:"Instrument Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --f-mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#0e1614; --panel:#151f1d; --ink:#e3ebe9; --muted:#92a49f; --line:#293634; --soft:#1c2826;
  --accent:#4fb8aa; --accent-ink:#06201c; --accent-soft:#15332e;
  --warn:#e2a54b; --warn-soft:#33270f; --bad:#ec7c70; --bad-soft:#3a1c19; --ok:#78c584; --ok-soft:#17301b; --info:#8eaaf0; --info-soft:#1c2540; --violet:#b796e6; --violet-soft:#2a1f3b; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#0e1614; --panel:#151f1d; --ink:#e3ebe9; --muted:#92a49f; --line:#293634; --soft:#1c2826;
  --accent:#4fb8aa; --accent-ink:#06201c; --accent-soft:#15332e;
  --warn:#e2a54b; --warn-soft:#33270f; --bad:#ec7c70; --bad-soft:#3a1c19; --ok:#78c584; --ok-soft:#17301b; --info:#8eaaf0; --info-soft:#1c2540; --violet:#b796e6; --violet-soft:#2a1f3b; color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:14.5px;line-height:1.45}
.wrap{max-width:1260px;margin:0 auto;padding-block:20px 48px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:16px}
header.top{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:end;justify-content:space-between}
.brand small{display:block;font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:600}
h1{font-family:var(--f-display);font-size:clamp(24px,3.4vw,32px);margin:2px 0 0;letter-spacing:-.01em;text-wrap:balance}
.toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.who{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.who img{width:26px;height:26px;border-radius:50%}
.who b{color:var(--ink)}
.rolechip{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:5px}
.r-supervisora{background:var(--violet-soft);color:var(--violet)}
.r-facturacion{background:var(--accent-soft);color:var(--accent)}
.r-higea{background:var(--info-soft);color:var(--info)}
select.compact{padding:5px 8px;font-size:12.5px}
.btn{border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:8px;padding:8px 14px;font:600 13.5px var(--f-body);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.btn:hover:not(:disabled){border-color:var(--accent)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.btn.approve{background:var(--violet);border-color:var(--violet);color:var(--panel)}
.btn.danger{color:var(--bad);border-color:var(--bad-soft)}
.btn.small{padding:5px 10px;font-size:12.5px}
.btn:disabled{opacity:.5;cursor:not-allowed}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,.item:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Flujo + indicadores */
.flow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.stage{padding:12px 16px;border-right:1px solid var(--line);min-width:0;position:relative;cursor:pointer;background:transparent;border-top:0;border-bottom:0;border-left:0;text-align:left;font:inherit;color:inherit}
.stage:last-child{border-right:0}
.stage:hover{background:var(--soft)}
.stage .lbl{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;display:flex;gap:6px;align-items:center}
.stage .lbl i{width:8px;height:8px;border-radius:50%;background:currentColor;display:inline-block}
.stage b{display:block;font-family:var(--f-display);font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums;margin-top:2px}
.stage .sub{font-size:12px;color:var(--muted)}
.stage.hot b{color:var(--bad)}
.stage.mine{box-shadow:inset 0 -3px 0 var(--violet)}
@media (max-width:760px){.flow{grid-template-columns:repeat(2,minmax(0,1fr))}.stage{border-bottom:1px solid var(--line)}.stage:nth-child(2n){border-right:0}.stage:last-child{grid-column:1/-1}}

.main{display:grid;grid-template-columns:minmax(0,390px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:900px){.main{grid-template-columns:minmax(0,1fr)} .main.has-sel .inbox{display:none} .main:not(.has-sel) .detail{display:none}}
.inbox,.detail,.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-width:0}
.inbox-head{padding:12px;border-bottom:1px solid var(--line);display:grid;gap:8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:99px;padding:4px 10px;font:600 12.5px var(--f-body);cursor:pointer}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--panel);border-color:var(--ink)}
.chip .n{font-variant-numeric:tabular-nums;opacity:.75;margin-left:4px}
.list{list-style:none;margin:0;padding:0;max-height:72vh;overflow:auto}
.item{border-bottom:1px solid var(--line);padding:11px 14px 11px 18px;cursor:pointer;display:grid;gap:4px;position:relative}
.item:hover{background:var(--soft)}
.item[aria-current="true"]{background:var(--accent-soft)}
.item.over::before,.item.needs::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px}
.item.over::before{background:var(--bad)}
.item.needs::before{background:var(--violet)}
.row1{display:flex;justify-content:space-between;gap:8px;align-items:center}
.code{font-family:var(--f-mono);font-size:12.5px;color:var(--muted)}
.item .title{font-weight:600;overflow-wrap:anywhere}
.item .meta{font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px}
.clip{font-size:12px;color:var(--muted)}
.empty{padding:28px 18px;color:var(--muted);text-align:center}

.pill{display:inline-flex;align-items:center;gap:5px;border-radius:99px;padding:2px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.pill::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.st-pendiente{background:var(--violet-soft);color:var(--violet)}
.st-devuelto{background:var(--warn-soft);color:var(--warn)}
.st-aprobado{background:var(--info-soft);color:var(--info)}
.st-en_proceso{background:var(--warn-soft);color:var(--warn)}
.st-requiere_info{background:var(--bad-soft);color:var(--bad)}
.st-cerrado{background:var(--ok-soft);color:var(--ok)}
.tag{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--accent)}

.detail{padding:20px;display:grid;gap:18px}
.back{display:none}
@media (max-width:900px){.back{display:inline-flex;justify-self:start}}
.dhead{display:grid;gap:6px}
.dhead h2{font-family:var(--f-display);font-size:22px;margin:0;text-wrap:balance}
.dhead .line{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;font-size:13px;color:var(--muted)}
.sla{font-weight:600}
.sla.over{color:var(--bad)} .sla.ok{color:var(--ok)}
.steps{display:flex;flex-wrap:wrap;gap:0;list-style:none;margin:0;padding:0;font-size:12.5px}
.steps li{display:flex;align-items:center;gap:6px;color:var(--muted);padding-right:10px}
.steps li::after{content:"";width:18px;height:1px;background:var(--line);margin-left:4px}
.steps li:last-child::after{display:none}
.steps .dot{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;font-size:10px;font-weight:700}
.steps .done{color:var(--ink)} .steps .done .dot{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.steps .now{color:var(--ink);font-weight:600} .steps .now .dot{border-color:var(--accent);color:var(--accent)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 18px;margin:0}
.facts div{min-width:0}
.facts dt{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);font-weight:600}
.facts dd{margin:2px 0 0;overflow-wrap:anywhere}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);background:var(--soft);font-weight:600}
tr:last-child td{border-bottom:0}
td.mono{font-family:var(--f-mono);font-size:12.5px;white-space:nowrap}
section h3,.h3{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);margin:0 0 8px;font-weight:700}
.files{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.file{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.file .ico{width:38px;height:44px;border-radius:4px;background:var(--soft);display:grid;place-items:center;font:700 10px var(--f-mono);color:var(--muted);border:1px solid var(--line)}
.file .ico.pdf{color:var(--bad)}
.file a{color:var(--ink);font-weight:600;text-decoration:none;overflow-wrap:anywhere}
.file a:hover{text-decoration:underline}
.file .fm{font-size:12px;color:var(--muted)}
.kind{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:4px}
.k-oficio{background:var(--violet-soft);color:var(--violet)}
.k-soporte{background:var(--soft);color:var(--muted)}
.k-evidencia{background:var(--ok-soft);color:var(--ok)}
.timeline{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.timeline li{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px}
.timeline img{width:28px;height:28px;border-radius:50%}
.tl-meta{font-size:12.5px;color:var(--muted)}
.tl-meta b{color:var(--ink)}
.tl-text{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2px}
.side{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:4px;margin-left:4px}
.reply{display:grid;gap:10px;border-top:1px solid var(--line);padding-top:16px}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.callout{border-radius:10px;padding:12px 14px;display:grid;gap:8px;font-size:13.5px}
.callout.violet{background:var(--violet-soft)}
.callout.info{background:var(--info-soft)}
.callout.warn{background:var(--warn-soft);color:var(--warn)}
.callout.bad{background:var(--bad-soft);color:var(--bad)}
.callout.ok{background:var(--ok-soft)}
.callout b.t{font-size:14px;color:var(--ink)}
label.f{display:grid;gap:4px;font-size:12.5px;font-weight:600;color:var(--muted)}
input,select,textarea{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:8px 10px;min-width:0;width:100%}
textarea{resize:vertical;min-height:72px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.form{display:grid;gap:12px}
.item-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:12px;border:1px dashed var(--line);border-radius:8px;position:relative}
.item-row .rm{position:absolute;top:6px;right:6px}
.drop{border:1.5px dashed var(--line);border-radius:10px;padding:14px;display:grid;gap:8px;justify-items:start}
.drop.req{border-color:var(--violet)}
.drop.drag{background:var(--accent-soft);border-color:var(--accent)}
.drop p{margin:0;font-size:12.5px;color:var(--muted)}
.notice{padding:10px 12px;border-radius:8px;background:var(--warn-soft);color:var(--warn);font-size:13px}
.notice.err{background:var(--bad-soft);color:var(--bad)}
.toast{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--ink);color:var(--panel);padding:9px 16px;border-radius:8px;font-weight:600;font-size:13.5px;z-index:20;max-width:calc(100vw - 32px)}
.panel{padding:16px 18px;display:grid;gap:12px}
.panel summary{cursor:pointer;font-weight:700;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.lower{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:900px){.lower{grid-template-columns:minmax(0,1fr)}}
.bars{display:grid;gap:8px}
.bar{display:grid;grid-template-columns:minmax(0,200px) minmax(0,1fr) 34px;gap:10px;align-items:center;font-size:13px}
.bar .track{height:10px;background:var(--soft);border-radius:5px;overflow:hidden}
.bar .fill{height:100%;background:var(--accent);border-radius:5px}
.bar .v{font-variant-numeric:tabular-nums;text-align:right;font-weight:600}
@media (max-width:520px){.bar{grid-template-columns:minmax(0,1fr) 34px}.bar .track{grid-column:1/-1;order:3}}
.team{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.team li{display:grid;grid-template-columns:28px minmax(0,1fr) 150px;gap:10px;align-items:center}
.team img{width:28px;height:28px;border-radius:50%}
.onb{display:grid;gap:14px;max-width:560px}
.onb .choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.choice{border:1px solid var(--line);border-radius:10px;padding:14px;text-align:left;background:var(--panel);color:var(--ink);font:inherit;cursor:pointer;display:grid;gap:4px}
.choice:hover{border-color:var(--accent)}
.choice b{font-family:var(--f-display);font-size:17px}
.choice span{font-size:13px;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.item,.btn,.chip,.stage,.choice{transition:background .15s,border-color .15s}}
</style>

<div class="wrap">
  <header class="top">
    <div class="brand">
      <small>E.S.E. Hospital Orito · Proceso de Facturación</small>
      <h1>Mesa de ayuda SYS HIGEA</h1>
    </div>
    <div class="toolbar">
      <div class="who" id="who"></div>
      <label id="viewas-wrap" hidden style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted);font-weight:600">Ver como
        <select class="compact" id="viewas" style="width:auto">
          <option value="supervisora">Supervisora</option>
          <option value="facturacion">Facturación</option>
          <option value="higea">SYS HIGEA</option>
        </select></label>
      <button class="btn primary" type="button" id="btn-new" hidden>Nuevo tiquete</button>
    </div>
  </header>

  <div id="banner" class="notice" hidden></div>

  <div class="flow" id="flow" aria-label="Flujo de tiquetes"></div>

  <div class="main" id="main">
    <aside class="inbox">
      <div class="inbox-head">
        <div class="chips" id="chips"></div>
        <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
          <input id="q" type="search" placeholder="Factura, paciente, documento, CUPS" aria-label="Buscar">
          <select id="ftipo" aria-label="Tipo de solicitud"><option value="todos">Todos los tipos</option></select>
        </div>
      </div>
      <ul class="list" id="list"><li class="empty">Cargando tiquetes…</li></ul>
    </aside>
    <section class="detail" id="detail"></section>
  </div>

  <div class="lower">
    <section class="panel">
      <div class="h3" style="margin:0">Causas de las solicitudes · <span id="c-month"></span></div>
      <div class="bars" id="bars"></div>
      <p style="margin:0;font-size:12.5px;color:var(--muted)">Cuenta registros, no tiquetes. Muestra dónde corregir en origen para que bajen las eliminaciones.</p>
    </section>
    <details class="panel" id="team-panel" hidden>
      <summary>Equipo y roles</summary>
      <p style="margin:0;font-size:13px;color:var(--muted)">Cada persona elige su rol al entrar por primera vez. Corrija aquí si alguien quedó en el rol equivocado. Solo usted puede aprobar tiquetes.</p>
      <ul class="team" id="team"></ul>
    </details>
  </div>
</div>
<input type="file" id="filepick" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden>
<div class="toast" id="toast" hidden role="status"></div>

<script>
const TIPOS={
  lab:{l:"Eliminación de laboratorio (código y resultado)",c:"Laboratorio"},
  factura:{l:"Eliminación completa de factura",c:"Factura"},
  hc:{l:"Eliminación o anulación de historia clínica",c:"Historia clínica"},
  otro:{l:"Otro ajuste en el sistema",c:"Otro"}
};
const MOTIVOS={arl_vencida:"Autorización ARL/EPS vencida",doble:"Doble facturación",no_corresponde:"Servicio no corresponde a lo prestado",registro:"Error de registro o paciente equivocado",hc_error:"Historia clínica abierta por error",otro:"Otro motivo"};
const ESTADOS={pendiente:"Pendiente de aprobación",devuelto:"Devuelto al facturador",aprobado:"Enviado a HIGEA",en_proceso:"En gestión HIGEA",requiere_info:"HIGEA requiere información",cerrado:"Realizado y cerrado"};
const PRIO={alta:{l:"Alta",d:1},normal:{l:"Normal",d:2},baja:{l:"Baja",d:5}};
const ROLES={supervisora:"Supervisora",facturacion:"Facturación",higea:"SYS HIGEA"};
const HIGEA_ST=["aprobado","en_proceso","requiere_info","cerrado"];
const OK_TYPES=["application/pdf","image/png","image/jpeg","image/webp"];

const S={tickets:[],aprob:{},miembros:{},sel:null,filter:null,tipo:"todos",q:"",db:null,user:null,assets:null,uid:null,owner:false,view:null,ready:false,mode:"view",draft:null,pend:[],uploading:0};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
for(const k in TIPOS){const o=document.createElement("option");o.value=k;o.textContent=TIPOS[k].c;$("ftipo").appendChild(o)}

/* ---------- utilidades ---------- */
function addBiz(iso,n){const d=new Date(iso);while(n>0){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)n--}return d}
function bizDays(a,b){const s=new Date(a),e=new Date(b);if(!(e>s))return 0;let h=0;const d=new Date(s);while(d<e){d.setTime(d.getTime()+3600e3);const w=d.getDay();if(w!==0&&w!==6)h++}return h/24}
function fmt(iso,t){if(!iso)return"";const o={day:"2-digit",month:"short",year:"numeric",timeZone:"America/Bogota"};if(t){o.hour="2-digit";o.minute="2-digit"}return new Date(iso).toLocaleString("es-CO",o)}
function ago(iso){const h=(Date.now()-new Date(iso))/36e5;if(h<1)return"hace minutos";if(h<24)return`hace ${Math.floor(h)} h`;return`hace ${Math.floor(h/24)} d`}
function kb(n){return n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB"}
function toast(m){const t=$("toast");t.textContent=m;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,3000)}
function newCode(){const d=new Date(),p=n=>String(n).padStart(2,"0");return"TK-"+String(d.getFullYear()).slice(2)+p(d.getMonth()+1)+p(d.getDate())+"-"+Math.random().toString(36).slice(2,5).toUpperCase()}

/* ---------- reglas del flujo ---------- */
function approved(t){const a=S.aprob[t.id];return !!(a&&a.decision==="aprobado")}
function est(t){return HIGEA_ST.includes(t.estado)&&!approved(t)?"pendiente":t.estado}
function aprobAt(t){const a=S.aprob[t.id];return(a&&a.decision==="aprobado"&&a.at)||t.aprobadoAt}
function due(t){const a=aprobAt(t);return a?addBiz(a,(PRIO[t.prioridad]||PRIO.normal).d):null}
function isOver(t){const e=est(t);return(e==="aprobado"||e==="en_proceso")&&due(t)&&new Date()>due(t)}
function hasOficio(t){return(t.adjuntos||[]).some(a=>a.kind==="oficio")}
function role(){return S.view}
function visible(t){return role()!=="higea"||HIGEA_ST.includes(est(t))}

const FILTERS={
  supervisora:[["por_aprobar","Por aprobar",t=>est(t)==="pendiente"],["higea","En HIGEA",t=>["aprobado","en_proceso","requiere_info"].includes(est(t))],["vencidos","Vencidos",isOver],["devuelto","Devueltos",t=>est(t)==="devuelto"],["cerrado","Cerrados",t=>est(t)==="cerrado"],["todos","Todos",()=>true]],
  facturacion:[["abiertos","Abiertos",t=>est(t)!=="cerrado"],["accion","Requieren mi acción",t=>["devuelto","requiere_info"].includes(est(t))],["pendiente","En aprobación",t=>est(t)==="pendiente"],["higea","En HIGEA",t=>["aprobado","en_proceso"].includes(est(t))],["cerrado","Cerrados",t=>est(t)==="cerrado"],["todos","Todos",()=>true]],
  higea:[["por_atender","Por atender",t=>est(t)==="aprobado"],["en_proceso","En gestión",t=>est(t)==="en_proceso"],["vencidos","Vencidos",isOver],["requiere_info","Esperando al hospital",t=>est(t)==="requiere_info"],["cerrado","Cerrados",t=>est(t)==="cerrado"],["todos","Todos",()=>true]]
};
const DEFAULT_FILTER={supervisora:"por_aprobar",facturacion:"abiertos",higea:"por_atender"};
function filters(){return FILTERS[role()]||FILTERS.facturacion}
function curFilter(){return filters().find(f=>f[0]===S.filter)||filters()[0]}
function textMatch(t){if(!S.q)return true;return[t.code,t.solicitante,t.observacion,...(t.items||[]).flatMap(i=>[i.factura,i.paciente,i.documento,i.cups,i.descripcion])].join(" ").toLowerCase().includes(S.q.toLowerCase())}

/* ---------- render: cabecera ---------- */
async function renderWho(){
  const w=$("who");if(!S.user||!S.uid){w.innerHTML="";return}
  const me=await S.user.me();const r=S.owner?"supervisora":(S.miembros[S.uid]||{}).rol;
  w.innerHTML=`<img alt="" src="${esc(me.avatarUrl)}"><b></b>${r?`<span class="rolechip r-${r}">${ROLES[r]}</span>`:""}${!S.owner&&r?`<button class="btn small" type="button" id="chg-rol">Cambiar rol</button>`:""}`;
  w.querySelector("b").textContent=me.name||"Usted";
  const c=$("chg-rol");if(c)c.onclick=()=>{S.view=null;S.mode="onboard";render()};
}

function renderFlow(){
  const T=S.tickets.filter(visible),c=f=>T.filter(f).length,ym=new Date().toISOString().slice(0,7);
  const closed=T.filter(t=>t.cerradoAt&&aprobAt(t));
  const avg=closed.length?(closed.reduce((s,t)=>s+bizDays(aprobAt(t),t.cerradoAt),0)/closed.length).toFixed(1):"–";
  const over=c(isOver);
  const st=[
    ["pendiente","Por aprobar",c(t=>est(t)==="pendiente"),`${c(t=>est(t)==="devuelto")} devueltos`,"var(--violet)",role()==="supervisora"?"por_aprobar":"pendiente"],
    ["aprobado","Por atender HIGEA",c(t=>est(t)==="aprobado"),"aprobados, sin tomar","var(--info)",role()==="higea"?"por_atender":"higea"],
    ["en_proceso","En gestión",c(t=>["en_proceso","requiere_info"].includes(est(t))),`${c(t=>est(t)==="requiere_info")} esperan información`,"var(--warn)",role()==="higea"?"en_proceso":"higea"],
    ["vencidos","Vencidos ANS",over,"fuera del plazo pactado","var(--bad)","vencidos"],
    ["cerrado","Cerrados en el mes",c(t=>est(t)==="cerrado"&&(t.cerradoAt||"").slice(0,7)===ym),`${avg} días hábiles promedio`,"var(--ok)","cerrado"]
  ];
  const vis=role()==="higea"?st.slice(1):st;
  $("flow").style.gridTemplateColumns=`repeat(${vis.length},minmax(0,1fr))`;
  if(matchMedia("(max-width:760px)").matches)$("flow").style.gridTemplateColumns="";
  $("flow").innerHTML=vis.map(([k,l,n,sub,col,f])=>`<button type="button" class="stage${k==="vencidos"&&n>0?" hot":""}${k==="pendiente"&&role()==="supervisora"&&n>0?" mine":""}" data-f="${f}"><span class="lbl" style="color:${col}"><i></i><span style="color:var(--muted)">${l}</span></span><b>${n}</b><span class="sub">${esc(sub)}</span></button>`).join("");
  $("flow").querySelectorAll(".stage").forEach(b=>b.onclick=()=>{if(filters().some(f=>f[0]===b.dataset.f)){S.filter=b.dataset.f;renderChips();renderList()}});
}

function renderChips(){
  const T=S.tickets.filter(visible);
  $("chips").innerHTML=filters().map(([k,l,fn])=>`<button type="button" class="chip" data-f="${k}" aria-pressed="${curFilter()[0]===k}">${l}<span class="n">${T.filter(fn).length}</span></button>`).join("");
  $("chips").querySelectorAll(".chip").forEach(b=>b.onclick=()=>{S.filter=b.dataset.f;renderChips();renderList()});
}

function needsMe(t){const e=est(t),r=role();return(r==="supervisora"&&e==="pendiente")||(r==="higea"&&e==="aprobado")||(r==="facturacion"&&(e==="devuelto"||e==="requiere_info"))}
function renderList(){
  const ul=$("list");
  if(!S.ready){return}
  const fn=curFilter()[2];
  const rows=S.tickets.filter(visible).filter(fn).filter(t=>S.tipo==="todos"||t.tipo===S.tipo).filter(textMatch)
    .sort((a,b)=>(isOver(b)-isOver(a))||(needsMe(b)-needsMe(a))||((b.createdAt||"")>(a.createdAt||"")?1:-1));
  if(!S.tickets.filter(visible).length){ul.innerHTML=`<li class="empty">${role()==="higea"?"No hay tiquetes aprobados para atender todavía.":"Aún no hay tiquetes. Use <b>Nuevo tiquete</b> para radicar la primera solicitud."}</li>`;return}
  if(!rows.length){ul.innerHTML=`<li class="empty">Ningún tiquete en esta vista.</li>`;return}
  ul.innerHTML=rows.map(t=>{const it=t.items||[],fac=it.map(i=>i.factura).filter(Boolean),e=est(t),n=(t.adjuntos||[]).length;
    return`<li class="item${isOver(t)?" over":needsMe(t)?" needs":""}" data-id="${esc(t.id)}" aria-current="${S.sel===t.id}" tabindex="0">
      <div class="row1"><span class="code">${esc(t.code)}</span><span class="pill st-${e}">${ESTADOS[e]}</span></div>
      <div class="tag">${esc((TIPOS[t.tipo]||TIPOS.otro).c)}</div>
      <div class="title">${esc(fac.join(", ")||it[0]?.paciente||"Sin factura")}</div>
      <div class="meta"><span>${esc(t.solicitante||"")}</span><span>${it.length} registro${it.length===1?"":"s"}</span><span>${n?`${n} adjunto${n===1?"":"s"}`:"sin adjuntos"}</span><span>${ago(t.createdAt)}</span></div></li>`}).join("");
  ul.querySelectorAll(".item").forEach(li=>{const go=()=>{S.sel=li.dataset.id;S.mode="view";S.pend=[];render()};li.onclick=go;li.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
}

function renderCauses(){
  const now=new Date(),ym=now.toISOString().slice(0,7);
  $("c-month").textContent=now.toLocaleString("es-CO",{month:"long",year:"numeric",timeZone:"America/Bogota"});
  const counts={};S.tickets.filter(t=>(t.createdAt||"").slice(0,7)===ym).forEach(t=>(t.items||[{}]).forEach(i=>{const m=i.motivo||t.motivo;counts[m]=(counts[m]||0)+1}));
  const ents=Object.entries(counts).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...ents.map(e=>e[1]));
  $("bars").innerHTML=ents.length?ents.map(([k,v])=>`<div class="bar"><span>${esc(MOTIVOS[k]||k)}</span><div class="track"><div class="fill" style="width:${(v/max*100).toFixed(1)}%"></div></div><span class="v">${v}</span></div>`).join(""):`<p style="margin:0;color:var(--muted)">Sin solicitudes radicadas este mes.</p>`;
}

async function renderTeam(){
  const p=$("team-panel");p.hidden=!S.owner;if(!S.owner)return;
  const ids=Object.keys(S.miembros).filter(id=>id!==S.uid);
  if(!ids.length){$("team").innerHTML=`<li style="display:block;color:var(--muted);font-size:13px">Nadie más ha entrado todavía. Comparta la página como <b>Editor</b> con sus facturadores y con SYS HIGEA.</li>`;return}
  const ps=await S.user.profiles(ids);
  $("team").innerHTML=ids.map(id=>`<li><img alt="" src="${esc(ps[id].avatarUrl)}"><span class="nm"></span><select class="compact" data-id="${esc(id)}" aria-label="Rol">${["facturacion","higea"].map(r=>`<option value="${r}" ${S.miembros[id].rol===r?"selected":""}>${ROLES[r]}</option>`).join("")}</select></li>`).join("");
  $("team").querySelectorAll("li").forEach((li,i)=>li.querySelector(".nm").textContent=ps[ids[i]].name||"Persona sin nombre visible");
  $("team").querySelectorAll("select").forEach(s=>s.onchange=()=>save(()=>S.db.doc("miembros/"+s.dataset.id).set({rol:s.value,at:new Date().toISOString(),por:S.uid}),"Rol actualizado"));
}

/* ---------- detalle ---------- */
function stepper(t){
  const e=est(t),order=["pendiente","aprobado","en_proceso","cerrado"],labels=["Radicado","Aprobado","En gestión","Cerrado"];
  let idx={pendiente:0,devuelto:0,aprobado:1,en_proceso:2,requiere_info:2,cerrado:3}[e];
  return`<ol class="steps">${labels.map((l,i)=>`<li class="${i<idx||e==="cerrado"?"done":i===idx?"now":""}"><span class="dot">${i<idx||e==="cerrado"?"✓":i+1}</span>${l}</li>`).join("")}</ol>`;
}
function fileList(arr){
  if(!arr.length)return`<p style="margin:0;color:var(--muted);font-size:13px">Sin documentos adjuntos.</p>`;
  return`<ul class="files">${arr.map(a=>{const pdf=a.type==="application/pdf";return`<li class="file"><span class="ico${pdf?" pdf":""}">${pdf?"PDF":"IMG"}</span><div style="min-width:0"><a href="/_blob/${esc(a.id)}" target="_blank" rel="noopener">${esc(a.name)}</a><div class="fm"><span class="kind k-${esc(a.kind)}">${esc({oficio:"Oficio firmado",soporte:"Soporte",evidencia:"Evidencia HIGEA"}[a.kind]||a.kind)}</span> · ${kb(a.size||0)} · ${fmt(a.at,true)}</div></div>${a._pending?`<button class="btn small" type="button" data-unpend="${esc(a.id)}">Quitar</button>`:""}</li>`}).join("")}</ul>`;
}

async function renderTimeline(t){
  const h=t.historial||[],ids=[...new Set(h.map(x=>x.by).filter(Boolean))];let ps={};
  if(S.user&&ids.length)ps=await S.user.profiles(ids);
  const el=$("tl");if(!el)return;
  el.innerHTML=h.map(x=>{const p=x.by?ps[x.by]:null,name=(p&&p.name)||x.firma||ROLES[x.rol]||"Hospital";
    return`<li>${p?`<img alt="" src="${esc(p.avatarUrl)}">`:"<span></span>"}<div><div class="tl-meta"><b>${esc(name)}</b><span class="side rolechip r-${esc(x.rol)}">${esc(ROLES[x.rol]||x.rol)}</span> · ${fmt(x.at,true)}${x.estado?` · <b>${esc(ESTADOS[x.estado]||x.estado)}</b>`:""}${x.adj?` · ${x.adj} adjunto${x.adj===1?"":"s"}`:""}</div>${x.texto?`<div class="tl-text">${esc(x.texto)}</div>`:""}</div></li>`}).join("");
}

function actionsFor(t){
  const e=est(t),r=role(),A=[];
  if(r==="supervisora"){
    if(e==="pendiente"){A.push(["aprobar","Aprobar y enviar a HIGEA","approve"]);A.push(["devolver","Devolver al facturador","danger"])}
    if(e==="devuelto")A.push(["editar","Corregir yo misma",""]);
    if(e==="requiere_info")A.push(["responder","Responder y devolver a HIGEA","primary"]);
    if(e==="cerrado")A.push(["reabrir","Reabrir: la factura aún no valida","danger"]);
  }
  if(r==="facturacion"){
    if(e==="pendiente"||e==="devuelto")A.push(["editar",e==="devuelto"?"Corregir y reenviar":"Editar",e==="devuelto"?"primary":""]);
    if(e==="requiere_info")A.push(["responder","Responder y devolver a HIGEA","primary"]);
  }
  if(r==="higea"){
    if(e==="aprobado")A.push(["tomar","Tomar caso",""]);
    if(e==="aprobado"||e==="en_proceso"){A.push(["info","Pedir información",""]);A.push(["cerrar","Reportar realizado y cerrar","primary"])}
  }
  return A;
}
const PLACEHOLDER={supervisora:"Nota para el facturador o para HIGEA",facturacion:"Nota o respuesta a HIGEA",higea:"Describa qué se eliminó o anuló en HIGEA (códigos, resultados, folios). Esta nota queda como constancia del cierre."};

function renderDetail(){
  const d=$("detail");
  const keep={id:d.dataset.tid,text:$("r-text")?.value||"",firma:$("r-firma")?.value||""};d.dataset.tid="";$("main").classList.toggle("has-sel",!!S.sel||S.mode==="new"||S.mode==="edit"||S.mode==="onboard");
  if(S.mode==="onboard")return renderOnboard();
  if(S.mode==="new"||S.mode==="edit")return renderForm();
  const t=S.tickets.find(x=>x.id===S.sel&&visible(x));
  if(!t){d.innerHTML=`<div><h2 style="font-family:var(--f-display);font-size:20px;margin:0 0 6px">Seleccione un tiquete</h2><p style="margin:0;color:var(--muted);max-width:60ch">${role()==="higea"?"Aquí llegan solo las solicitudes que la supervisora de facturación ya aprobó. Al terminar el proceso en el sistema, reporte lo realizado y cierre el tiquete.":role()==="supervisora"?"Los tiquetes que radican sus facturadores esperan su aprobación antes de llegar a SYS HIGEA. Revise el oficio firmado y los registros, y apruebe o devuelva.":"Radique cada solicitud con el oficio firmado. La supervisora la aprueba y luego SYS HIGEA la realiza y la cierra."}</p></div>`;return}
  const it=t.items||[],e=est(t),hc=t.tipo==="hc",dl=due(t),over=isOver(t);
  const sla=e==="cerrado"?`Cerrado ${fmt(t.cerradoAt)}${aprobAt(t)?` · ${bizDays(aprobAt(t),t.cerradoAt).toFixed(1)} días hábiles en HIGEA`:""}`:dl?(over?`Vencido desde ${fmt(dl.toISOString())}`:`HIGEA debe responder antes de ${fmt(dl.toISOString())}`):`Esperando aprobación ${ago(t.enviadoAt||t.createdAt)}`;
  const A=actionsFor(t),adj=(t.adjuntos||[]).concat(S.pend.map(p=>({...p,_pending:true})));
  const callout=
    e==="pendiente"&&role()==="supervisora"?`<div class="callout violet"><b class="t">Este tiquete espera su aprobación</b>${hasOficio(t)||S.pend.some(p=>p.kind==="oficio")?"Revise el oficio firmado y los registros. Al aprobar, SYS HIGEA lo recibe en su bandeja y empieza a correr el plazo de respuesta.":"<span style='color:var(--bad)'>Falta el oficio firmado. Adjúntelo abajo o devuelva el tiquete para que el facturador lo cargue.</span>"}</div>`:
    e==="devuelto"?`<div class="callout warn"><b class="t" style="color:inherit">Devuelto por la supervisora</b>${esc((S.aprob[t.id]||{}).nota||"")}</div>`:
    e==="requiere_info"?`<div class="callout bad"><b class="t" style="color:inherit">SYS HIGEA necesita información</b>${esc(lastNote(t,"higea"))}</div>`:
    e==="aprobado"&&role()==="higea"?`<div class="callout info"><b class="t">Aprobado por la supervisora de facturación</b>Tome el caso, realice la eliminación en el sistema y repórtela con el botón de cierre.</div>`:
    e==="cerrado"?`<div class="callout ok"><b class="t">Realizado por SYS HIGEA</b>${esc(lastNote(t,"higea"))}</div>`:"";
  const reqNote=["devolver","info","cerrar","responder","reabrir"];
  d.innerHTML=`
  <button class="btn small back" type="button" id="back">← Bandeja</button>
  <div class="dhead">
    <div class="line"><span class="code">${esc(t.code)}</span><span class="pill st-${e}">${ESTADOS[e]}</span><span class="sla ${over?"over":e==="cerrado"?"ok":""}">${esc(sla)}</span></div>
    <h2>${esc((TIPOS[t.tipo]||TIPOS.otro).l)}</h2>
    ${stepper(t)}
  </div>
  ${callout}
  <dl class="facts">
    <div><dt>Motivo</dt><dd>${esc(MOTIVOS[t.motivo]||"")}</dd></div>
    <div><dt>Prioridad</dt><dd>${esc((PRIO[t.prioridad]||PRIO.normal).l)} · ${(PRIO[t.prioridad]||PRIO.normal).d} día(s) hábil(es)</dd></div>
    <div><dt>Solicita</dt><dd>${esc(t.solicitante||"—")}</dd></div>
    <div><dt>Radicado</dt><dd>${fmt(t.createdAt,true)}</dd></div>
    <div><dt>Aprobado</dt><dd>${aprobAt(t)&&approved(t)?fmt(aprobAt(t),true):"—"}</dd></div>
  </dl>
  ${t.observacion?`<p style="margin:0;max-width:72ch">${esc(t.observacion)}</p>`:""}
  <section><h3>Registros a eliminar (${it.length})</h3>
  <div class="tablewrap"><table><thead><tr><th>Factura</th><th>Paciente</th><th>Documento</th><th>${hc?"Folio / registro HC":"CUPS"}</th><th>Descripción</th><th>Atención</th></tr></thead><tbody>
  ${it.map(i=>`<tr><td class="mono">${esc(i.factura||"—")}</td><td>${esc(i.paciente)}</td><td class="mono">${esc(i.documento)}</td><td class="mono" style="white-space:normal">${esc(i.cups)}</td><td>${esc(i.descripcion)}</td><td>${esc(i.fecha)}</td></tr>`).join("")}
  </tbody></table></div></section>
  <section><h3>Documentos</h3><div id="adj">${fileList(adj)}</div></section>
  <section><h3>Seguimiento</h3><ul class="timeline" id="tl"></ul></section>
  <div class="reply">
    <label class="f" for="r-text">${role()==="higea"?"Respuesta de SYS HIGEA":"Nota"}<textarea id="r-text" placeholder="${esc(PLACEHOLDER[role()])}"></textarea></label>
    <div class="actions">
      ${S.assets?`<button class="btn small" type="button" id="r-attach">Adjuntar ${role()==="higea"?"evidencia":role()==="supervisora"&&!hasOficio(t)?"oficio firmado":"documento"}</button>`:""}
      <span id="up-state" class="clip"></span>
      <label style="display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--muted);font-weight:600;max-width:260px">Firma<input id="r-firma" placeholder="Nombre de quien responde"></label>
    </div>
    <div class="actions">
      <button class="btn" type="button" id="r-send">Agregar nota</button>
      ${A.map(([k,l,c])=>`<button class="btn ${c}" type="button" data-act="${k}">${l}</button>`).join("")}
      <span style="flex:1"></span>
      <button class="btn small" type="button" id="r-copy">Copiar como correo</button>
    </div>
    <p style="margin:0;font-size:12px;color:var(--muted)">${A.some(a=>reqNote.includes(a[0]))?"Devolver, pedir información, responder, reabrir y cerrar exigen una nota.":""}</p>
  </div>`;
  $("back").onclick=()=>{S.sel=null;S.pend=[];render()};
  $("r-copy").onclick=async()=>{const txt=emailText(t);try{await navigator.clipboard.writeText(txt);toast("Texto copiado")}catch(err){const ta=$("r-text");ta.value=txt;ta.select();toast("Texto seleccionado: cópielo con Ctrl+C")}};
  $("r-send").onclick=()=>act(t,"nota");
  d.querySelectorAll("[data-act]").forEach(b=>b.onclick=()=>act(t,b.dataset.act));
  const at=$("r-attach");if(at)at.onclick=()=>pickFiles(role()==="higea"?"evidencia":(role()==="supervisora"&&!hasOficio(t))?"oficio":"soporte",()=>renderAdj(t));
  d.querySelectorAll("[data-unpend]").forEach(b=>b.onclick=()=>{S.pend=S.pend.filter(p=>p.id!==b.dataset.unpend);renderAdj(t)});
  try{const f=localStorage.getItem("mesa-firma-"+role());if(f)$("r-firma").value=f}catch(err){}
  d.dataset.tid=t.id;
  if(keep.id===t.id){$("r-text").value=keep.text;if(keep.firma)$("r-firma").value=keep.firma}
  renderAdj(t);renderTimeline(t);
}
function renderAdj(t){const el=$("adj");if(!el)return;el.innerHTML=fileList((t.adjuntos||[]).concat(S.pend.map(p=>({...p,_pending:true}))));el.querySelectorAll("[data-unpend]").forEach(b=>b.onclick=()=>{S.pend=S.pend.filter(p=>p.id!==b.dataset.unpend);renderAdj(t)});const u=$("up-state");if(u)u.textContent=S.pend.length?`${S.pend.length} adjunto${S.pend.length===1?"":"s"} listo${S.pend.length===1?"":"s"} para enviar con la nota`:""}
function lastNote(t,rol){const h=(t.historial||[]).filter(x=>x.rol===rol&&x.texto);return h.length?h[h.length-1].texto:""}

async function act(t,kind){
  const texto=$("r-text").value.trim(),firma=$("r-firma").value.trim(),r=role();
  try{localStorage.setItem("mesa-firma-"+r,firma)}catch(err){}
  if(S.uploading){toast("Espere a que termine de subir el archivo");return}
  if(kind==="editar"){S.mode="edit";S.draft=JSON.parse(JSON.stringify({...t,files:t.adjuntos||[]}));S.pend=[];renderDetail();return}
  const needText={nota:"Escriba la nota",devolver:"Explique qué debe corregir el facturador",info:"Indique qué información necesita",cerrar:"Describa qué se realizó en el sistema",responder:"Escriba la respuesta para HIGEA",reabrir:"Explique por qué se reabre"};
  if(needText[kind]&&!texto&&!(kind==="nota"&&S.pend.length)){toast(needText[kind]);$("r-text").focus();return}
  if(kind==="aprobar"&&!hasOficio(t)&&!S.pend.some(p=>p.kind==="oficio")){toast("Adjunte el oficio firmado antes de aprobar");return}
  const now=new Date().toISOString();
  const to={aprobar:"aprobado",devolver:"devuelto",tomar:"en_proceso",info:"requiere_info",cerrar:"cerrado",responder:"en_proceso",reabrir:"en_proceso"}[kind];
  const files=S.pend.map(({_pending,...p})=>p);
  const entry={at:now,by:S.uid,rol:r,texto:texto||(kind==="aprobar"?"Aprobado y enviado a SYS HIGEA.":kind==="tomar"?"Caso tomado por SYS HIGEA.":""),firma};
  if(to)entry.estado=to;if(files.length)entry.adj=files.length;
  const patch={historial:[...(t.historial||[]),entry],updatedAt:now};
  if(files.length)patch.adjuntos=[...(t.adjuntos||[]),...files];
  if(to)patch.estado=to;
  if(to==="cerrado")patch.cerradoAt=now;
  if(kind==="reabrir")patch.cerradoAt=null;
  if(kind==="aprobar")patch.aprobadoAt=now;
  const run=async()=>{
    if(kind==="aprobar"||kind==="devolver")await S.db.doc("aprobaciones/"+t.id).set({decision:kind==="aprobar"?"aprobado":"devuelto",at:now,by:S.uid,nota:texto});
    await S.db.doc("tickets/"+t.id).update(patch)};
  const msg={nota:"Nota agregada",aprobar:"Aprobado: ya está en la bandeja de SYS HIGEA",devolver:"Devuelto al facturador",tomar:"Caso tomado",info:"Solicitud de información enviada",cerrar:"Tiquete cerrado como realizado",responder:"Respuesta enviada a HIGEA",reabrir:"Tiquete reabierto"}[kind];
  if(await save(run,msg)){S.pend=[];const ta=$("r-text");if(ta)ta.value="";renderAdj(S.tickets.find(x=>x.id===t.id)||t)}
}

async function save(fn,ok){
  if(!S.db){toast("Sin conexión con la base compartida");return false}
  try{await fn();toast(ok);return true}catch(e){
    if(e&&e.code==="unavailable"){await new Promise(r=>setTimeout(r,600+Math.random()*800));try{await fn();toast(ok);return true}catch(e2){}}
    if(e&&e.code==="invalid_argument")toast("Su acceso no permite esta acción. Si debería poder hacerla, pida a la supervisora que lo comparta como Editor.");
    else toast("No se pudo guardar. Intente de nuevo.");return false}}

/* ---------- adjuntos ---------- */
let pickCb=null,pickKind="soporte";
function pickFiles(kind,cb){pickKind=kind;pickCb=cb;$("filepick").value="";$("filepick").click()}
$("filepick").onchange=e=>uploadFiles([...e.target.files],pickKind,pickCb);
async function uploadFiles(files,kind,cb){
  if(!S.assets){toast("Su acceso no permite adjuntar archivos");return}
  for(const f of files){
    const type=OK_TYPES.includes(f.type)?f.type:(/\.pdf$/i.test(f.name)?"application/pdf":"");
    if(!type){toast(`${f.name}: solo se aceptan PDF o imágenes (PNG, JPG)`);continue}
    if(f.size>20*1048576){toast(`${f.name} supera 20 MB. Escanéelo en menor resolución.`);continue}
    S.uploading++;const u=$("up-state");if(u)u.textContent=`Subiendo ${f.name}…`;
    try{const r=await S.assets.upload(f,{type});
      const rec={id:r.id,name:f.name,type:r.contentType,size:r.sizeBytes,kind,by:S.uid,rol:role(),at:new Date().toISOString()};
      if(S.mode==="new"||S.mode==="edit")S.draft.files.push(rec);else S.pend.push(rec);
    }catch(err){toast(err&&err.code==="too_large"?"El archivo es demasiado grande":(err&&(err.code==="unsupported_type"||err.code==="not_granted")&&type==="application/pdf")?"Su cuenta no puede subir PDF. Suba el oficio como foto o imagen JPG/PNG.":err&&err.code==="unsupported_type"?"Tipo de archivo no admitido":"No se pudo subir "+f.name)}
    finally{S.uploading--}
  }
  if(cb)cb();
}

/* ---------- formulario ---------- */
function blankItem(){return{factura:"",paciente:"",documento:"",cups:"",descripcion:"",fecha:""}}
function renderForm(){
  const d=$("detail"),edit=S.mode==="edit";
  if(!S.draft)S.draft={tipo:"lab",motivo:"arl_vencida",prioridad:"normal",solicitante:"",observacion:"",items:[blankItem()],files:[]};
  if(!S.draft.solicitante){try{S.draft.solicitante=localStorage.getItem("mesa-firma-"+role())||""}catch(e){}}
  const D=S.draft,hc=D.tipo==="hc",ofi=D.files.filter(f=>f.kind==="oficio"),sop=D.files.filter(f=>f.kind!=="oficio");
  d.innerHTML=`<button class="btn small back" type="button" id="back">← Bandeja</button>
  <div class="dhead"><h2>${edit?"Corregir tiquete "+esc(D.code):"Nuevo tiquete para SYS HIGEA"}</h2><div class="line">${role()==="supervisora"?"Como supervisora, su tiquete queda aprobado y llega directo a HIGEA.":"Al radicar, el tiquete pasa a aprobación de la supervisora antes de llegar a HIGEA."}</div></div>
  <form id="frm" class="form" novalidate>
    <div class="grid2">
      <label class="f" for="n-tipo">Tipo de solicitud<select id="n-tipo">${Object.entries(TIPOS).map(([k,v])=>`<option value="${k}" ${D.tipo===k?"selected":""}>${v.l}</option>`).join("")}</select></label>
      <label class="f" for="n-motivo">Motivo<select id="n-motivo">${Object.entries(MOTIVOS).map(([k,v])=>`<option value="${k}" ${D.motivo===k?"selected":""}>${v}</option>`).join("")}</select></label>
      <label class="f" for="n-prio">Prioridad<select id="n-prio">${Object.entries(PRIO).map(([k,v])=>`<option value="${k}" ${D.prioridad===k?"selected":""}>${v.l} · ${v.d} día(s) hábil(es)</option>`).join("")}</select></label>
      <label class="f" for="n-sol">Solicita<input id="n-sol" value="${esc(D.solicitante)}" placeholder="Nombre de quien firma el oficio"></label>
    </div>
    <label class="f" for="n-obs">Detalle del caso<textarea id="n-obs" placeholder="Qué pasó y qué debe quedar en el sistema">${esc(D.observacion)}</textarea></label>
    <div class="h3" style="margin:4px 0 0">Registros a eliminar</div>
    ${D.items.map((i,n)=>`<div class="item-row" data-n="${n}">
      ${D.items.length>1?`<button type="button" class="btn small rm" data-rm="${n}" aria-label="Quitar registro ${n+1}">Quitar</button>`:""}
      <label class="f" for="i-fac-${n}">No. factura<input id="i-fac-${n}" data-k="factura" value="${esc(i.factura)}" placeholder="FEV449319"></label>
      <label class="f" for="i-pac-${n}">Paciente<input id="i-pac-${n}" data-k="paciente" value="${esc(i.paciente)}"></label>
      <label class="f" for="i-doc-${n}">Documento<input id="i-doc-${n}" data-k="documento" value="${esc(i.documento)}" placeholder="CC" inputmode="numeric"></label>
      <label class="f" for="i-cups-${n}">${hc?"Folio / registro HC":"Código(s) CUPS"}<input id="i-cups-${n}" data-k="cups" value="${esc(i.cups)}" placeholder="${hc?"Folio o número de ingreso":"906915"}"></label>
      <label class="f" for="i-desc-${n}">${hc?"Qué anular":"Laboratorio / descripción"}<input id="i-desc-${n}" data-k="descripcion" value="${esc(i.descripcion)}"></label>
      <label class="f" for="i-fec-${n}">Fecha de atención<input id="i-fec-${n}" data-k="fecha" value="${esc(i.fecha)}" placeholder="dd/mm/aaaa"></label>
    </div>`).join("")}
    <div><button class="btn small" type="button" id="add-row">Agregar otro registro</button></div>
    <div class="drop req" id="drop-ofi"><div class="h3" style="margin:0">Oficio firmado <span style="color:var(--violet)">· obligatorio</span></div>
      ${ofi.length?fileList(ofi):`<p>Escanee el oficio con firma y VoBo. y súbalo en PDF, o como foto JPG/PNG si su cuenta no admite PDF. Puede arrastrarlo aquí.</p>`}
      ${S.assets?`<button class="btn small" type="button" id="up-ofi">${ofi.length?"Reemplazar oficio":"Subir oficio firmado"}</button>`:`<p style="color:var(--bad)">Su acceso no permite subir archivos. Pida a la supervisora que lo comparta como Editor.</p>`}</div>
    <div class="drop" id="drop-sop"><div class="h3" style="margin:0">Otros soportes · opcional</div>
      ${sop.length?fileList(sop):`<p>Autorización vencida, captura de la HC, resultado de laboratorio.</p>`}
      ${S.assets?`<button class="btn small" type="button" id="up-sop">Adjuntar soporte</button>`:""}</div>
    <span id="up-state" class="clip"></span>
    <div id="ferr" class="notice err" hidden></div>
    <div class="actions"><span style="flex:1"></span>
      <button class="btn" type="button" id="cancel">Cancelar</button>
      <button class="btn primary" type="submit" id="submit">${role()==="supervisora"?"Radicar y enviar a HIGEA":edit?"Reenviar a aprobación":"Radicar para aprobación"}</button></div>
  </form>`;
  const sync=()=>{D.tipo=$("n-tipo").value;D.motivo=$("n-motivo").value;D.prioridad=$("n-prio").value;D.solicitante=$("n-sol").value;D.observacion=$("n-obs").value;
    d.querySelectorAll(".item-row").forEach(r=>{const n=+r.dataset.n;r.querySelectorAll("[data-k]").forEach(inp=>D.items[n][inp.dataset.k]=inp.value)})};
  $("frm").addEventListener("input",sync);
  $("n-tipo").onchange=()=>{sync();if(D.tipo==="hc"&&D.motivo==="arl_vencida")D.motivo="hc_error";renderForm()};
  $("add-row").onclick=()=>{sync();D.items.push(blankItem());renderForm();$("i-fac-"+(D.items.length-1)).focus()};
  d.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{sync();D.items.splice(+b.dataset.rm,1);renderForm()});
  const keepLastOficio=()=>{const o=D.files.filter(f=>f.kind==="oficio");D.files=[...D.files.filter(f=>f.kind!=="oficio"),...o.slice(-1)];renderForm()};
  if($("up-ofi"))$("up-ofi").onclick=()=>{sync();pickFiles("oficio",keepLastOficio)};
  if($("up-sop"))$("up-sop").onclick=()=>{sync();pickFiles("soporte",()=>renderForm())};
  [["drop-ofi","oficio"],["drop-sop","soporte"]].forEach(([id,kind])=>{const z=$(id);
    z.ondragover=e=>{e.preventDefault();z.classList.add("drag")};z.ondragleave=()=>z.classList.remove("drag");
    z.ondrop=e=>{e.preventDefault();z.classList.remove("drag");sync();uploadFiles([...e.dataTransfer.files].slice(0,kind==="oficio"?1:10),kind,kind==="oficio"?keepLastOficio:()=>renderForm())}});
  const close=()=>{S.mode="view";S.draft=null;render()};
  $("back").onclick=close;$("cancel").onclick=close;
  $("frm").onsubmit=async e=>{e.preventDefault();sync();
    if(S.uploading){toast("Espere a que termine de subir el archivo");return}
    const items=D.items.filter(i=>Object.values(i).some(v=>String(v).trim()));
    const ofis=D.files.filter(f=>f.kind==="oficio");
    const err=!items.length?"Agregue al menos un registro.":!D.solicitante.trim()?"Indique quién solicita.":items.find(i=>!i.factura.trim()&&D.tipo!=="hc")?"Cada registro necesita su número de factura.":(!ofis.length&&S.assets)?"Adjunte el oficio firmado.":"";
    if(err){$("ferr").textContent=err;$("ferr").hidden=false;return}
    // dejar solo el oficio más reciente
    const files=[...D.files.filter(f=>f.kind!=="oficio"),...ofis.slice(-1)];
    $("submit").disabled=true;
    const now=new Date().toISOString(),sup=role()==="supervisora",clean=items.map(i=>Object.fromEntries(Object.entries(i).map(([k,v])=>[k,String(v).trim()])));
    try{localStorage.setItem("mesa-firma-"+role(),D.solicitante.trim())}catch(x){}
    let ok;
    if(edit){
      const t=S.tickets.find(x=>x.id===D.id);
      const patch={tipo:D.tipo,motivo:D.motivo,prioridad:D.prioridad,solicitante:D.solicitante.trim(),observacion:D.observacion.trim(),items:clean,adjuntos:files,estado:sup?"aprobado":"pendiente",enviadoAt:now,updatedAt:now,
        historial:[...(t.historial||[]),{at:now,by:S.uid,rol:role(),estado:sup?"aprobado":"pendiente",texto:sup?"Corregido y aprobado por la supervisora.":"Corregido y reenviado a aprobación.",firma:D.solicitante.trim()}]};
      if(sup)patch.aprobadoAt=now;
      ok=await save(async()=>{if(sup)await S.db.doc("aprobaciones/"+D.id).set({decision:"aprobado",at:now,by:S.uid,nota:""});await S.db.doc("tickets/"+D.id).update(patch)},sup?"Aprobado y enviado a HIGEA":"Reenviado a aprobación");
      if(ok){S.sel=D.id;close()}else $("submit").disabled=false;return}
    const ref=S.db.collection("tickets").doc();
    const doc={code:newCode(),tipo:D.tipo,motivo:D.motivo,prioridad:D.prioridad,estado:sup?"aprobado":"pendiente",solicitante:D.solicitante.trim(),solicitanteId:S.uid,observacion:D.observacion.trim(),
      items:clean,adjuntos:files,createdAt:now,enviadoAt:now,updatedAt:now,aprobadoAt:sup?now:null,cerradoAt:null,
      historial:[{at:now,by:S.uid,rol:role(),estado:"pendiente",texto:"Tiquete radicado"+(files.length?` con ${files.length} adjunto${files.length===1?"":"s"}.`:"."),firma:D.solicitante.trim()}].concat(sup?[{at:now,by:S.uid,rol:"supervisora",estado:"aprobado",texto:"Aprobado y enviado a SYS HIGEA.",firma:""}]:[])};
    ok=await save(async()=>{await ref.set(doc);if(sup)await S.db.doc("aprobaciones/"+ref.id).set({decision:"aprobado",at:now,by:S.uid,nota:""})},sup?"Tiquete "+doc.code+" enviado a HIGEA":"Tiquete "+doc.code+" radicado para aprobación");
    if(ok){S.sel=ref.id;close()}else $("submit").disabled=false}}

/* ---------- primer ingreso ---------- */
function renderOnboard(){
  const d=$("detail");
  if(!S.uid){d.innerHTML=`<div class="onb"><h2 style="font-family:var(--f-display);margin:0">Inicie sesión para usar la mesa</h2><p style="margin:0;color:var(--muted)">La mesa identifica quién radica, aprueba y cierra cada tiquete. Abra este enlace con su cuenta de claude.ai.</p></div>`;return}
  d.innerHTML=`<div class="onb"><h2 style="font-family:var(--f-display);margin:0;font-size:22px">¿Cómo usará esta mesa?</h2>
  <p style="margin:0;color:var(--muted)">Elija una vez. La supervisora puede corregirlo si se equivoca.</p>
  <div class="choices">
    <button type="button" class="choice" data-r="facturacion"><b>Facturación</b><span>Radico solicitudes de eliminación con el oficio firmado y respondo a HIGEA.</span></button>
    <button type="button" class="choice" data-r="higea"><b>SYS HIGEA</b><span>Atiendo los tiquetes aprobados, realizo la eliminación y cierro el caso.</span></button>
  </div></div>`;
  d.querySelectorAll(".choice").forEach(b=>b.onclick=async()=>{
    const ok=await save(()=>S.db.doc("miembros/"+S.uid).set({rol:b.dataset.r,at:new Date().toISOString(),por:S.uid}),"Rol guardado: "+ROLES[b.dataset.r]);
    if(ok){S.miembros[S.uid]={rol:b.dataset.r};applyRole();S.mode="view";render()}});
}

function emailText(t){
  const it=t.items||[];
  return`Asunto: ${(TIPOS[t.tipo]||TIPOS.otro).l} – Tiquete ${t.code}

Señores SYS HIGEA – Soporte y Mesa de Ayuda
Desde el Proceso de Facturación de la E.S.E. Hospital Orito solicitamos su apoyo con: ${(TIPOS[t.tipo]||TIPOS.otro).l.toLowerCase()}.
Motivo: ${MOTIVOS[t.motivo]||""}${t.observacion?" – "+t.observacion:""}

${it.map((i,n)=>`${n+1}) Factura ${i.factura||"—"} | ${i.paciente||""}${i.documento?" ("+i.documento+")":""} | ${t.tipo==="hc"?"Folio/registro":"CUPS"}: ${i.cups||"—"}${i.descripcion?" – "+i.descripcion:""} | Atención: ${i.fecha||"—"}`).join("\n")}

Estado en la mesa de ayuda: ${ESTADOS[est(t)]}.${due(t)?" Fecha límite de respuesta: "+fmt(due(t).toISOString())+".":""}
El oficio firmado y los soportes están adjuntos al tiquete ${t.code} en la mesa de ayuda.
Solicita: ${t.solicitante||""} · VoBo. Supervisora de Facturación`}

/* ---------- arranque ---------- */
function applyRole(){
  const r=S.owner?(S.view&&ROLES[S.view]?S.view:"supervisora"):(S.miembros[S.uid]||{}).rol||null;
  if(S.view!==r){S.view=r;S.filter=DEFAULT_FILTER[r]||null}
  $("viewas-wrap").hidden=!S.owner;if(S.owner)$("viewas").value=S.view;
  $("btn-new").hidden=!(r==="facturacion"||r==="supervisora");
  if(!r&&S.ready)S.mode="onboard";
}
$("viewas").onchange=e=>{S.view=e.target.value;S.filter=DEFAULT_FILTER[S.view];S.sel=null;S.mode="view";applyRole();render()};
$("q").oninput=e=>{S.q=e.target.value.trim();renderList()};
$("ftipo").onchange=e=>{S.tipo=e.target.value;renderList()};
$("btn-new").onclick=()=>{S.mode="new";S.sel=null;S.draft=null;render()};
function render(){renderFlow();renderChips();renderList();renderDetail();renderCauses()}
S.view="facturacion";S.filter="abiertos";render();$("list").innerHTML=`<li class="empty">Cargando tiquetes…</li>`;

(async()=>{
  const db=await window.claude?.use?.("db");
  if(!db){$("list").innerHTML=`<li class="empty">No se pudo abrir la base compartida. Inicie sesión en claude.ai con la cuenta a la que le compartieron esta mesa.</li>`;return}
  S.db=db;S.user=await window.claude?.use?.("user");
  if(S.user){S.uid=await S.user.id();S.owner=await S.user.isOwner()}
  window.claude.use("assets").then(a=>{S.assets=a;if(S.mode!=="view")renderDetail();else if(S.sel)renderDetail()});
  let got={t:false,a:false,m:false};
  const go=()=>{if(got.t&&got.a&&got.m){const first=!S.ready;S.ready=true;applyRole();if(first&&!S.view)S.mode="onboard";render();renderWho();renderTeam()}};
  db.collection("miembros").onSnapshot(s=>{S.miembros=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));got.m=true;go()},()=>{got.m=true;go()});
  db.collection("aprobaciones").onSnapshot(s=>{S.aprob=Object.fromEntries(s.docs.map(d=>[d.id,d.data()]));got.a=true;go()},()=>{got.a=true;go()});
  db.collection("tickets").onSnapshot(s=>{S.tickets=s.docs.map(d=>({id:d.id,...d.data()}));got.t=true;if(S.mode==="new"||S.mode==="edit"){if(S.ready){renderFlow();renderChips();renderList();renderCauses()}else go()}else go()},
    e=>{$("list").innerHTML=`<li class="empty">Se perdió la conexión con la base. Recargue la página.</li>`});
  setInterval(()=>{if(S.ready&&S.mode==="view"){renderFlow();renderList()}},60000);
})();
</script>

```
