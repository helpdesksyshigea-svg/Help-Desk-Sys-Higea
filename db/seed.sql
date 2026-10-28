-- Datos semilla: roles, permisos y SLA. Sin usuarios ni datos de pacientes.

insert into sla_config (prioridad, dias_habiles) values
  ('alta', 1),
  ('normal', 2),
  ('baja', 5);

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
