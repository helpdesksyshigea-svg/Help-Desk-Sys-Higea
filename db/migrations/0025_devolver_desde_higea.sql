-- Hoy, si un ticket aprobado o en proceso queda con datos que ya no
-- corresponden a lo que SYS HIGEA necesita resolver (por ejemplo, porque
-- alguien renombró una clave del catálogo "Motivos" y eso cambió en cascada
-- el `motivo` de un item ya aprobado — ver guardas nuevas en
-- PATCH /admin/motivos/:clave), no existía ninguna transición que permitiera
-- corregirlo: /aprobar y /devolver solo aceptan estado 'pendiente', así que
-- el ticket quedaba sin salida al intentar cerrarse con el hash de
-- aprobación desactualizado.
--
-- Este permiso habilita POST /tickets/:id/devolver-higea: un ingeniero de
-- SYS HIGEA devuelve el ticket (estado 'aprobado' o 'en_proceso') directo a
-- 'devuelto', igual que cuando una supervisora lo devuelve desde
-- 'pendiente'. Desde ahí, el facturador corrige y reenvía (PATCH
-- /tickets/:id), y vuelve a pasar por aprobación normal de facturación —
-- nunca se edita el ticket mientras está aprobado/en proceso, ni SYS HIGEA
-- aprueba nada por su cuenta.
insert into permisos (clave, descripcion) values
  ('tickets.devolver_higea', 'Devolver a facturación un tiquete aprobado o en proceso, para que se vuelva a aprobar')
on conflict (clave) do nothing;

insert into rol_permisos (rol_id, permiso_id)
select r.id, p.id from roles r, permisos p
where r.nombre like '%higea%'
  and p.clave = 'tickets.devolver_higea'
on conflict do nothing;
