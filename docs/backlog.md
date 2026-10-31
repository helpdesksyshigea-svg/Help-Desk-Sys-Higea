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

## 6. Brief UX/UI (completado)
- ✅ Vista priorizada por rol en la bandeja — ya existía (`filtrosPorRol`).
- ✅ Accesibilidad: foco de teclado visible, filas/tarjetas navegables, Escape cierra modales (`666fda9`).
- ✅ Adaptación móvil: menú deslizable y búsqueda en el header (`5a2cad1`).
- ✅ Microcopy: errores de red ya no muestran texto crudo en inglés; avisos de limpieza de adjuntos listan qué tickets fallaron (`dc38276`).
- ✅ Seguridad en Admin: `rol_id` ahora valida que el rol exista (`1c3d09f`) y asignar/cambiar rol exige también `roles.gestionar`, cerrando un camino de escalamiento de privilegios (`6186834`).

### Pendiente de decisión del usuario (seguridad)
- **Rate limiting en login**: no se implementó. El login no pasa por la API propia — el frontend llama directo a `supabase.auth.signInWithPassword`, así que cualquier límite de intentos depende de la configuración de Supabase Auth, no de este repo. Si se quiere, revisar esa configuración directamente en el panel de Supabase (no requiere cambios de código).
- **Política de retención documental del oficio firmado**: `limpiarTicketsAntiguos` (`api/src/lib/limpieza.js`) borraba de Storage, a los `dias_retencion_cierre` (90 por defecto) de cerrado un ticket, también el adjunto de tipo `oficio` — el documento legal firmado (ej. soporte de eliminación de una factura o de una historia clínica), sin respaldo ni posibilidad de recuperarlo. Para una entidad pública eso es un riesgo de cumplimiento frente a Ley 594/2000 y una posible auditoría de Supersalud/Contraloría, no una optimización de espacio real. Mientras tanto se pausó: el `oficio` ya NO se borra automáticamente; solo `soporte`/`evidencia` (documentos de trabajo) siguen el ciclo de limpieza de siempre. Falta decidir con Archivo/Jurídica del hospital la tabla de retención documental real (cuántos años conservar, a dónde archivar) y, una vez decidida, volver a implementar el borrado/archivado del oficio conforme a esa política.

## Limpieza técnica pendiente
- Borrar scripts temporales de prueba en `api/`: `demo_firma_oficio_tmp.mjs`, `demo_paso_a_paso_tmp.mjs` (no son parte del código de producción).
- Ejecutar paso `limpiar` del script de demo para borrar cuentas de prueba (`*.demo1031b@higea.test`).
- Tickets de prueba en producción que no se pueden borrar (trigger de auditoría en `ticket_eventos` lo bloquea) — decidir si se archivan/marcan manualmente: `202610311253474`, `202610311257565`, más los de la serie `20261031...` de verificaciones anteriores.
- Invitar a `CleydermanG` como colaborador con permiso de escritura en el repo de GitHub (pendiente de que el usuario lo haga, Claude no tiene permisos suficientes).
