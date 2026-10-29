-- Reemplaza el código de ticket aleatorio (TK-AAMMDD-XXX) por un consecutivo
-- real por año (TK-{año}-{número}), con incremento atómico a nivel de base de
-- datos para que dos radicaciones simultáneas nunca reciban el mismo número.

create table if not exists ticket_secuencias (
  anio int primary key,
  siguiente int not null default 1
);

create or replace function siguiente_numero_ticket(p_anio int)
returns int as $$
declare
  v_numero int;
begin
  insert into ticket_secuencias (anio, siguiente) values (p_anio, 2)
  on conflict (anio) do update set siguiente = ticket_secuencias.siguiente + 1
  returning siguiente - 1 into v_numero;
  return v_numero;
end;
$$ language plpgsql;
