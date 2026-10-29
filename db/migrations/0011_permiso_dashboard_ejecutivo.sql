-- Nuevo permiso para ver el dashboard ejecutivo de KPIs (Administración →
-- Dashboard ejecutivo). Mismo patrón que reportes.exportar: se asigna a
-- admin y supervisora_facturacion.
insert into permisos (clave, descripcion) values
  ('reportes.ver_dashboard', 'Ver el dashboard ejecutivo de KPIs')
on conflict (clave) do nothing;

-- "like" en vez de una lista cerrada: roles combinados como supervisora_admin
-- (admin + supervisora en una sola cuenta, como ya existe en producción) deben
-- quedar incluidos sin tener que enumerar cada combinación posible.
insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where (r.nombre like '%admin%' or r.nombre like '%supervisora%')
  and p.clave = 'reportes.ver_dashboard'
on conflict do nothing;
