-- Convierte tipo de solicitud y motivo en catálogos parametrizables (antes eran
-- valores fijos en el código JS del frontend). También agrega la columna activo
-- a sla_config para poder desactivar prioridades sin romper tickets existentes.

create table if not exists tipos_solicitud (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true
);

create table if not exists motivos (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true
);

insert into tipos_solicitud (clave, etiqueta) values
  ('elim_lab', 'Eliminación de laboratorio (código y resultado)'),
  ('elim_fact', 'Eliminación completa de factura'),
  ('elim_hc', 'Eliminación o anulación de historia clínica'),
  ('otro_ajuste', 'Otro ajuste en el sistema')
on conflict (clave) do nothing;

update tipos_solicitud set requiere_factura = false where clave = 'elim_hc';

insert into motivos (clave, etiqueta) values
  ('arl_vencida', 'Autorización ARL/EPS vencida'),
  ('doble_fact', 'Doble facturación'),
  ('no_corresponde', 'Servicio no corresponde a lo prestado'),
  ('error_registro', 'Error de registro o paciente equivocado'),
  ('hc_error', 'Historia clínica abierta por error'),
  ('otro_motivo', 'Otro motivo')
on conflict (clave) do nothing;

-- Festivos de Colombia 2026 (Ley 51 de 1983, festivos trasladados al lunes siguiente
-- cuando aplica). La supervisora puede agregar/editar estos desde el panel de admin.
insert into festivos_colombia (fecha, descripcion) values
  ('2026-01-01', 'Año Nuevo'),
  ('2026-01-12', 'Día de los Reyes Magos'),
  ('2026-03-23', 'Día de San José'),
  ('2026-04-02', 'Jueves Santo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-18', 'Ascensión del Señor'),
  ('2026-06-08', 'Corpus Christi'),
  ('2026-06-15', 'Sagrado Corazón de Jesús'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-20', 'Día de la Independencia'),
  ('2026-08-07', 'Batalla de Boyacá'),
  ('2026-08-17', 'Asunción de la Virgen'),
  ('2026-10-12', 'Día de la Raza'),
  ('2026-11-02', 'Todos los Santos'),
  ('2026-11-16', 'Independencia de Cartagena'),
  ('2026-12-08', 'Día de la Inmaculada Concepción'),
  ('2026-12-25', 'Navidad')
on conflict (fecha) do nothing;
