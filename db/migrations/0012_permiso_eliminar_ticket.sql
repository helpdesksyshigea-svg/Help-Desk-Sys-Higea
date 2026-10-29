-- Permite a la administradora eliminar un ticket por completo (ej. casos de
-- prueba radicados por error, como "jjjjj"). Usa la misma rutina
-- eliminar_ticket_permanente() que ya existe para la limpieza automática
-- (bypassa el trigger append-only de ticket_eventos de forma controlada).
-- Irreversible y sin respaldo — gated por este permiso nuevo, no por
-- usuarios.gestionar ni config.editar, para que quede explícito en Roles.
insert into permisos (clave, descripcion) values
  ('tickets.eliminar', 'Eliminar un ticket por completo (irreversible)')
on conflict (clave) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where (r.nombre like '%admin%')
  and p.clave = 'tickets.eliminar'
on conflict do nothing;
