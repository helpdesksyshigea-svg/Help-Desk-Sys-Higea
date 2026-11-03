-- Rol combinado "Supervisora / Administradora" (supervisora_admin).
-- El frontend ya lo nombraba (web/src/lib/roles.js) y la bandeja lo trata como
-- supervisora por substring (filtrosBandeja.js / filters.js), pero ninguna
-- migración lo creaba: en un proyecto Supabase nuevo no existía.
-- Recibe la unión de los permisos de admin y supervisora_facturacion, de modo
-- que una misma persona pueda aprobar/devolver tickets y administrar el sistema.

insert into roles (nombre, descripcion, es_sistema) values
  ('supervisora_admin', 'Supervisora de facturación con permisos de administración del sistema', true)
on conflict (nombre) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select destino.id, rp.permiso_id
from roles destino
join roles origen on origen.nombre in ('admin', 'supervisora_facturacion')
join rol_permisos rp on rp.rol_id = origen.id
where destino.nombre = 'supervisora_admin'
on conflict do nothing;
