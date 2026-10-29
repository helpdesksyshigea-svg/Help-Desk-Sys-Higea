-- Reemplaza el chequeo hardcodeado "tipo === 'hc'" (que se rompió al renombrar esa
-- clave a 'elim_hc') por un campo real del catálogo: cada tipo de solicitud declara
-- si sus registros necesitan número de factura. Así un renombre o un tipo nuevo no
-- vuelve a romper la validación en silencio.

alter table tipos_solicitud add column if not exists requiere_factura boolean not null default true;
update tipos_solicitud set requiere_factura = false where clave = 'elim_hc';
