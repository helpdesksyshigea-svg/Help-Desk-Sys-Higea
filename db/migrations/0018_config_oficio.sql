-- Texto fijo del oficio generado (destinatario, cierre, despedida) hasta ahora
-- vivía hardcodeado en api/src/lib/oficio.js. El usuario pidió poder
-- configurarlo desde Administración sin tocar código — tabla singleton (un
-- solo registro, igual al patrón "id boolean primary key" para forzar que
-- nunca haya más de una fila).
create table if not exists config_oficio (
  id boolean primary key default true,
  check (id),
  destinatario_nombre text not null default 'SOPORTE TÉCNICO SYS HIGEA',
  destinatario_ciudad text not null default 'Pasto, Nariño',
  texto_cierre text not null default 'Agradezco de antemano su valiosa colaboración.',
  texto_despedida text not null default 'Atentamente,',
  updated_at timestamptz not null default now()
);

insert into config_oficio (id) values (true) on conflict (id) do nothing;
