-- Cadena de aprobación adicional para solicitudes radicadas por el rol "médico":
-- médico -> coordinador médico -> supervisora de facturación -> SYS HIGEA (sin cambios
-- en este último tramo, ya existente). Para facturador el flujo sigue igual: pendiente
-- -> aprobado directo por cualquier supervisora.
--
-- tickets.etapa_aprobacion: null = listo para que cualquier supervisora apruebe (flujo
-- de hoy); 'coordinador_medico' = debe pasar primero por un coordinador médico. Se fija
-- una sola vez al radicar, según el rol de quien crea el ticket, y PATCH /tickets/:id
-- (reenvío tras corrección) no la toca — así, si quien devolvió el ticket fue el
-- coordinador, el reenvío vuelve a él; si fue la supervisora (porque el coordinador ya
-- había aprobado antes), el reenvío va directo a supervisora, sin repetir ese paso.
alter table tickets add column if not exists etapa_aprobacion text;

-- aprobaciones pasa de "una decisión final por ticket" a "una decisión por etapa": se
-- quita el unique(ticket_id) y se reemplaza por unique(ticket_id, etapa), para poder
-- guardar tanto la aprobación del coordinador médico como la aprobación final de
-- supervisora sin que una pise a la otra. 'final' es la etapa de siempre (supervisora),
-- nombrada así para no romper las filas ya existentes.
alter table aprobaciones drop constraint if exists aprobaciones_ticket_id_key;
alter table aprobaciones add column if not exists etapa text not null default 'final';
alter table aprobaciones add constraint aprobaciones_ticket_id_etapa_key unique (ticket_id, etapa);

insert into permisos (clave, descripcion) values
  ('tickets.aprobar_coordinador', 'Aprobar, como coordinador médico, un tiquete radicado por un médico'),
  ('tickets.devolver_coordinador', 'Devolver, como coordinador médico, un tiquete radicado por un médico')
on conflict (clave) do nothing;

insert into roles (nombre, descripcion, es_sistema) values
  ('medico', 'Radica tiquetes que requieren aprobación de un coordinador médico', false),
  ('coordinador_medico', 'Aprueba o devuelve, en primera instancia, los tiquetes radicados por médicos', false)
on conflict (nombre) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'medico'
  and p.clave in ('tickets.crear', 'tickets.ver_propios', 'tickets.responder_info')
on conflict do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'coordinador_medico'
  and p.clave in ('tickets.ver_todos', 'tickets.aprobar_coordinador', 'tickets.devolver_coordinador')
on conflict do nothing;
