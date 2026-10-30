-- Oficio generado automáticamente con firma digital confirmada (beta).
-- beta_firma_oficio es una bandera por USUARIO (no un permiso por rol): el
-- sistema de permisos existente es por rol, y esta funcionalidad se quiere
-- probar en una sola cuenta a la vez sin exponerla a todo un rol real.
alter table usuarios
  add column if not exists identificacion text,
  add column if not exists cargo text,
  add column if not exists firma_path text,
  add column if not exists beta_firma_oficio boolean not null default false;

alter table tipos_solicitud
  add column if not exists plantilla_oficio text;

alter table tickets
  add column if not exists firma_solicitante_at timestamptz,
  add column if not exists firma_aprobador_at timestamptz;
