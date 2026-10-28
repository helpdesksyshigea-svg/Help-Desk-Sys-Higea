-- Datos semilla: roles, permisos y SLA. Sin usuarios ni datos de pacientes.

insert into sla_config (prioridad, dias_habiles) values
  ('alta', 1),
  ('normal', 2),
  ('baja', 5);

insert into tipos_solicitud (clave, etiqueta) values
  ('elim_lab', 'Eliminación de laboratorio (código y resultado)'),
  ('elim_fact', 'Eliminación completa de factura'),
  ('elim_hc', 'Eliminación o anulación de historia clínica'),
  ('otro_ajuste', 'Otro ajuste en el sistema');

insert into motivos (clave, etiqueta) values
  ('arl_vencida', 'Autorización ARL/EPS vencida'),
  ('doble_fact', 'Doble facturación'),
  ('no_corresponde', 'Servicio no corresponde a lo prestado'),
  ('error_registro', 'Error de registro o paciente equivocado'),
  ('hc_error', 'Historia clínica abierta por error'),
  ('otro_motivo', 'Otro motivo');

insert into festivos_colombia (fecha, descripcion) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Día de los Reyes Magos'),
  ('2026-03-23', 'Día de San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón de Jesús'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-20', 'Día de la Independencia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Día de la Inmaculada Concepción'),
  ('2026-12-25', 'Navidad');

insert into permisos (clave, descripcion) values
  ('tickets.crear', 'Radicar un nuevo tiquete'),
  ('tickets.ver_propios', 'Ver únicamente los tiquetes propios o asignados'),
  ('tickets.ver_todos', 'Ver todos los tiquetes'),
  ('tickets.aprobar', 'Aprobar un tiquete pendiente'),
  ('tickets.devolver', 'Devolver un tiquete al facturador'),
  ('tickets.reabrir', 'Reabrir un tiquete cerrado'),
  ('tickets.tomar', 'Tomar un tiquete aprobado para gestionarlo'),
  ('tickets.pedir_info', 'Solicitar información adicional sobre un tiquete'),
  ('tickets.responder_info', 'Responder una solicitud de información'),
  ('tickets.cerrar', 'Reportar como realizado y cerrar un tiquete'),
  ('usuarios.gestionar', 'Crear, activar o desactivar usuarios'),
  ('roles.gestionar', 'Crear roles y asignarles permisos'),
  ('reportes.exportar', 'Exportar el informe mensual'),
  ('config.editar', 'Editar festivos y configuración de SLA');

insert into roles (nombre, descripcion, es_sistema) values
  ('admin', 'Administra usuarios, roles y configuración del sistema', true),
  ('supervisora_facturacion', 'Aprueba o devuelve tiquetes, ve todo, gestiona equipo', true),
  ('facturador', 'Radica tiquetes y responde solicitudes de información', true),
  ('higea_soporte', 'Toma, gestiona y cierra tiquetes aprobados', true);

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'admin'
  and p.clave in ('usuarios.gestionar','roles.gestionar','config.editar','reportes.exportar','tickets.ver_todos','tickets.crear');

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'supervisora_facturacion'
  and p.clave in ('tickets.ver_todos','tickets.aprobar','tickets.devolver','tickets.reabrir','tickets.crear','reportes.exportar');

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'facturador'
  and p.clave in ('tickets.crear','tickets.ver_propios','tickets.responder_info');

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre = 'higea_soporte'
  and p.clave in ('tickets.ver_todos','tickets.tomar','tickets.pedir_info','tickets.cerrar');
