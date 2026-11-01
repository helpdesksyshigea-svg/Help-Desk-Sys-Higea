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

-- El catálogo original agrupaba todo bajo "datos_incorrectos", sin decir cuál
-- de los campos que digita el facturador/médico está mal — quien revisa
-- después tenía que abrir el ticket y adivinar. Se desglosa uno por cada
-- campo que se captura en el formulario (TicketForm.jsx: firmante, y por
-- cada registro factura/paciente/documento/cups/fecha/motivo/descripción),
-- más los que no son de un campo puntual (soporte adjunto, firma del oficio,
-- duplicado, otro).
insert into motivos_devolucion (clave, etiqueta) values
  ('firmante_incorrecto', 'Nombre de quien firma el oficio incorrecto o no coincide'),
  ('factura_incorrecta', 'Número de factura incorrecto o no corresponde'),
  ('paciente_incorrecto', 'Datos del paciente incorrectos o no coinciden con la factura'),
  ('documento_incorrecto', 'Número de documento de identidad incorrecto'),
  ('cups_incorrecto', 'CUPS o folio incorrecto'),
  ('fecha_incorrecta', 'Fecha del registro incorrecta'),
  ('descripcion_insuficiente', 'Descripción del registro insuficiente o poco clara'),
  ('soporte_incompleto', 'Falta soporte o documento adjunto'),
  ('oficio_sin_firmar', 'Oficio no firmado o firma inválida'),
  ('info_insuficiente', 'La justificación general no es suficiente'),
  ('duplicado', 'Ya existe una solicitud para el mismo caso'),
  ('otro', 'Otro motivo')
on conflict (clave) do nothing;

-- Nullable: solo aplica cuando aprobaciones.decision = 'devuelto'. Las
-- aprobaciones viejas (de antes de este cambio) y las que no sean devolución
-- quedan en null — el dashboard las cuenta aparte, en un bucket "Sin motivo
-- registrado", en vez de descartarlas o romper el conteo.
alter table aprobaciones add column if not exists motivo_devolucion text references motivos_devolucion(clave);
