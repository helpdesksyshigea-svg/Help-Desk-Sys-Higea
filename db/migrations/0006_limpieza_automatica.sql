-- Configuración editable por el administrador (hoy solo un parámetro: días de
-- retención para tickets cerrados antes de borrarlos permanentemente).
create table if not exists config_sistema (
  clave text primary key,
  valor text not null
);

insert into config_sistema (clave, valor) values
  ('dias_retencion_cierre', '90')
on conflict (clave) do nothing;

-- Borra un ticket por completo, incluido su historial append-only. Esto es
-- EXCEPCIONAL y deliberado: el trigger que protege ticket_eventos sigue
-- bloqueando cualquier UPDATE/DELETE fuera de esta función — nadie puede editar
-- o borrar un evento individual, solo esta rutina puede borrar el ticket entero
-- como parte de la política de retención configurada por el administrador.
-- No hay respaldo: una vez borrado, el caso no se puede recuperar.
create or replace function eliminar_ticket_permanente(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  alter table ticket_eventos disable trigger no_update_eventos;
  alter table ticket_eventos disable trigger no_delete_eventos;
  begin
    delete from tickets where id = p_ticket_id;
  exception when others then
    alter table ticket_eventos enable trigger no_update_eventos;
    alter table ticket_eventos enable trigger no_delete_eventos;
    raise;
  end;
  alter table ticket_eventos enable trigger no_update_eventos;
  alter table ticket_eventos enable trigger no_delete_eventos;
end;
$$;
