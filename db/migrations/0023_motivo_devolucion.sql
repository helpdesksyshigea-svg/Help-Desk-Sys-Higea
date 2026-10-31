-- Hoy, cuando un coordinador médico o una supervisora devuelve un ticket
-- (POST /tickets/:id/devolver y /tickets/:id/devolver-coordinador), solo se
-- pide una nota de texto libre obligatoria — no hay ninguna causa estructurada
-- que se pueda contar o graficar para saber por qué se devuelven los tickets
-- más seguido. Esta migración agrega un catálogo de "motivo de devolución",
-- mismo patrón que el catálogo `motivos` ya existente para los ítems del
-- ticket (clave/etiqueta/activo, gestionable desde Administración).
create table if not exists motivos_devolucion (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true
);

insert into motivos_devolucion (clave, etiqueta) values
  ('soporte_incompleto', 'Falta soporte o documento adjunto'),
  ('datos_incorrectos', 'Datos del paciente o factura incorrectos'),
  ('oficio_sin_firmar', 'Oficio no firmado o firma inválida'),
  ('info_insuficiente', 'La justificación no es suficiente'),
  ('duplicado', 'Ya existe una solicitud para el mismo caso'),
  ('otro', 'Otro motivo')
on conflict (clave) do nothing;

-- Nullable: solo aplica cuando aprobaciones.decision = 'devuelto'. Las
-- aprobaciones viejas (de antes de este cambio) y las que no sean devolución
-- quedan en null — el dashboard las cuenta aparte, en un bucket "Sin motivo
-- registrado", en vez de descartarlas o romper el conteo.
alter table aprobaciones add column if not exists motivo_devolucion text references motivos_devolucion(clave);
