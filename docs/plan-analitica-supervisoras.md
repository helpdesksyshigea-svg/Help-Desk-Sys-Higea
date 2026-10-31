# Plan: Reportes y analítica para supervisoras

## Qué ya existe (no reinventar)
`api/src/routes/dashboard.js` (`GET /dashboard/resumen`, permiso `reportes.ver_dashboard`, ya asignado a roles `%supervisora%`/`%admin%`) ya calcula, sobre un rango de fechas:
- Totales (tickets, abiertos, cerrados, vencidos).
- SLA histórico y de abiertos (cumplimiento %, vencidos).
- TPR (tiempo de primera respuesta) y tiempo de resolución promedio.
- Por estado, por tipo, por prioridad, por motivo.
- Aging de abiertos (buckets de días).
- Tendencia mensual (creados vs. cerrados).
- Por agente SYS HIGEA (asignados, cerrados, vencidos, TPR, % cumplimiento).

`web/src/pages/Dashboard.jsx` ya renderiza todo esto. **Lo que falta es específico al tramo de aprobación** (donde vive la supervisora), que hoy no se mide: cuánto tarda cada etapa de firma, dónde se traban los tickets antes de llegar a ella, y cuántos devuelve vs. aprueba.

## Objetivo de esta fase
Agregar una sección "Aprobaciones" al dashboard existente — mismo endpoint, mismo permiso, misma página — en vez de crear un dashboard paralelo.

## 1. Backend — extender `GET /dashboard/resumen`

Fuente de datos: `aprobaciones` (etapa, decision, decidido_por, created_at) y `ticket_eventos` (tipo_evento, estado_anterior/nuevo, created_at), ya se traen para los tickets del rango — solo hace falta calcular sobre ellos, no una tabla nueva.

### 1.1 Tiempo por etapa de aprobación
Para cada ticket con `etapa_aprobacion`, medir el tiempo entre que entra a una etapa y la decisión de esa etapa (`aprobaciones.created_at` por etapa, o el evento de cambio de etapa en `ticket_eventos` si no hay fila en `aprobaciones` aún — caso "pendiente").
```js
const porEtapa = {
  solicitante_a_coordinador: [], // médico firma -> coordinador decide
  coordinador_a_supervisora: [], // coordinador decide -> supervisora decide
  solicitante_a_supervisora: [], // facturador firma -> supervisora decide (sin coordinador)
};
```
Salida: horas promedio/mediana por etapa, para ver dónde se traba el ticket antes de llegar a la supervisora (ej. "el coordinador tarda en promedio 14h en decidir" vs. "la supervisora tarda 2h").

### 1.2 Decisiones de la supervisora
De `aprobaciones` filtrado por `etapa = 'supervisora_facturacion'` (o el nombre real de la etapa final) en el rango:
- Total aprobados vs. devueltos (`decision`), tasa de devolución.
- Motivo de devolución más frecuente (si se registra texto/motivo en la tabla — confirmar columna; si no existe, usar el campo libre de `observacion` del evento).
- Por supervisora individual (si hay más de una cuenta con ese rol): carga y tiempo de respuesta de cada una — mismo patrón que `porAgente` pero para `decidido_por` en la etapa de aprobación.

### 1.3 Cola actual de pendientes de su firma
No es histórico, es "ahora": cuántos tickets están en `etapa_aprobacion = 'supervisora_facturacion'` en este momento, cuántos ya vencieron SLA, y el más antiguo esperando — para que la supervisora entre y sepa qué atacar primero sin tener que ir a la bandeja a ordenar manualmente.

### Forma de la respuesta (agregar a lo existente, no reemplazar)
```json
{
  "...": "...(lo que ya existe)",
  "aprobaciones": {
    "tiempoPorEtapaHoras": { "coordinador": 14.2, "supervisora": 2.1, "medicoACoordinador": null },
    "decisionesSupervisora": { "aprobados": 42, "devueltos": 6, "pctDevolucion": 12.5 },
    "porSupervisora": [{ "nombre": "...", "decididos": 20, "horasPromedio": 1.8, "pctDevolucion": 10 }],
    "colaPendiente": { "total": 5, "vencidos": 1, "masAntiguoHoras": 30.5 }
  }
}
```

## 2. Frontend — `web/src/pages/Dashboard.jsx`
Nueva sección "Aprobaciones" (misma estructura visual que las secciones actuales: tarjetas de KPI + una tabla/gráfico):
- 3 tarjetas: % devolución, horas promedio etapa coordinador, horas promedio etapa supervisora.
- Tabla "Cola pendiente de tu firma" con link directo a cada ticket (solo si el usuario tiene rol supervisora — reutilizar `req.user.rol`/`perfil.rol` ya disponible en el frontend).
- Si hay varias supervisoras: tabla comparativa `porSupervisora` (visible solo para admin, no para que una supervisora vea el detalle de otra salvo que ya tengan ese permiso hoy — confirmar con el patrón de `porAgente`, que sí es visible a todos los que ven el dashboard).

## 3. Verificación
1. Extender `dashboard.js` con los cálculos de 1.1–1.3, reutilizando los datos que el endpoint ya trae (no agregar nuevas queries salvo `aprobaciones` del rango, que hoy no se está trayendo).
2. Probar con datos reales de producción (hay tickets de médico y facturador ya aprobados de esta sesión, ej. `202610311257565`) comparando el cálculo manual (¿cuánto tardó el coordinador según `ticket_eventos`?) contra el número que devuelve el endpoint.
3. Build + deploy a Render, confirmar que una cuenta supervisora ve la sección nueva y una cuenta sin el permiso (ej. facturador) no ve el dashboard en absoluto (comportamiento ya existente, no debe cambiar).

## Fuera de alcance de esta fase (backlog futuro)
- Exportar estos reportes a PDF/Excel.
- Comparativas entre periodos (mes actual vs. mes anterior).
- Alertas automáticas cuando la cola de pendientes supera un umbral (depende de la mejora #1 del backlog, notificaciones proactivas).
