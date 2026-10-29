-- SYS HIGEA atiende con una sola cuenta/correo compartido entre varios
-- ingenieros; `asignado_a` (el usuario de Auth) no distingue quién de ellos
-- gestionó realmente el caso. Este catálogo (mismo patrón que tipos_solicitud
-- y motivos, administrable desde Administración) registra el nombre real del
-- ingeniero al tomar el caso, en una columna nueva de tickets.
create table if not exists ingenieros_higea (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true
);

alter table tickets add column if not exists agente_higea text;
