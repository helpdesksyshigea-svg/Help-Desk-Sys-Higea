-- Nuevo permiso para ver el dashboard ejecutivo de KPIs (Administración →
-- Dashboard ejecutivo). Mismo patrón que reportes.exportar: se asigna a
-- admin y supervisora_facturacion.
insert into permisos (clave, descripcion) values
  ('reportes.ver_dashboard', 'Ver el dashboard ejecutivo de KPIs')
on conflict (clave) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre in ('admin', 'supervisora_facturacion')
  and p.clave = 'reportes.ver_dashboard'
on conflict do nothing;
