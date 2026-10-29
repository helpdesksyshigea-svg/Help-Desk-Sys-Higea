-- Expone el tamaño real de la base de datos en bytes. La API REST de
-- Supabase no da esto directamente (solo permite consultar filas); esta
-- función sí puede, porque corre dentro de Postgres con pg_database_size().
-- security definer + search_path fijo: no recibe parámetros del usuario,
-- así que no hay superficie de inyección, pero se fija igual por costumbre
-- del proyecto con las demás funciones security definer.
create or replace function tamano_base_datos()
returns bigint
language sql
security definer
set search_path = public
as $$
  select pg_database_size(current_database());
$$;

-- Cualquier usuario autenticado por la API puede llamarla (expone un número,
-- nada sensible); el backend ya la restringe a quienes tienen config.editar
-- antes de usarla.
grant execute on function tamano_base_datos() to authenticated;
