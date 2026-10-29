-- Reemplaza el booleano suelto requiere_factura (que existía pero el
-- backend nunca llegó a usar) por una lista configurable: cada tipo de
-- solicitud decide cuáles de los 7 campos del registro son obligatorios,
-- administrable desde Administración → Tipos de solicitud.
alter table tipos_solicitud
  add column if not exists campos_obligatorios jsonb not null
  default '["factura","paciente","documento","cups","fecha","motivo","descripcion"]'::jsonb;

-- Preserva el comportamiento que ya existía para historias clínicas (no
-- tienen número de factura).
update tipos_solicitud
  set campos_obligatorios = '["paciente","documento","cups","fecha","motivo","descripcion"]'::jsonb
  where clave = 'elim_hc';
