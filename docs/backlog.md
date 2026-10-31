# Backlog — mejoras propuestas (2026-10-31)

Pendientes identificados tras cerrar el flujo de firma digital en el oficio (1/2/3 firmas). Sin fecha comprometida; priorizar según impacto vs. esfuerzo.

## 1. Notificaciones proactivas
Email/WhatsApp cuando un ticket cambia de etapa. Hoy el usuario debe entrar a revisar manualmente.

## 2. SLA con alertas automáticas
Ya existe `sla_config` (prioridad → plazos), pero falta aviso automático cuando un ticket está por vencerse, no solo mostrarlo en el detalle.

## 3. Búsqueda y filtros potentes en la bandeja
Por paciente, número de factura, CUPS, rango de fechas. Crítico a medida que crece el volumen de tickets.

## 4. Reportes / analítica para supervisoras
Ver plan detallado en `docs/plan-analitica-supervisoras.md`. Incluye tiempos promedio de aprobación, cuellos de botella por etapa, ranking de motivos.

## 5. Auditoría exportable de firma digital
Ya existe la base (`firma_solicitante_at`, `firma_coordinador_at`, `firma_aprobador_at`), falta un log exportable (CSV/PDF) para auditorías externas (ej. entes de control, revisoría).

## 6. Brief UX/UI (en curso, P1/P2)
- Vista priorizada por rol en la bandeja.
- Mejora de lectura del historial/adjuntos.
- Microcopy en mensajes de éxito/error.
- Seguridad en el panel de administración.
- Accesibilidad (color + texto, foco de teclado).
- Adaptación móvil.

## Limpieza técnica pendiente
- Borrar scripts temporales de prueba en `api/`: `demo_firma_oficio_tmp.mjs`, `demo_paso_a_paso_tmp.mjs` (no son parte del código de producción).
- Ejecutar paso `limpiar` del script de demo para borrar cuentas de prueba (`*.demo1031b@higea.test`).
- Tickets de prueba en producción que no se pueden borrar (trigger de auditoría en `ticket_eventos` lo bloquea) — decidir si se archivan/marcan manualmente: `202610311253474`, `202610311257565`, más los de la serie `20261031...` de verificaciones anteriores.
- Invitar a `CleydermanG` como colaborador con permiso de escritura en el repo de GitHub (pendiente de que el usuario lo haga, Claude no tiene permisos suficientes).
