-- Cuando un agente de SYS HIGEA toma un ticket, queda bloqueado para los
-- demás: nadie más puede tomarlo, pedir información ni cerrarlo mientras siga
-- asignado a esa persona. No es asignación automática (round-robin ni por
-- carga) — sigue siendo "el primero que lo toma, se lo lleva" — pero una vez
-- tomado, es exclusivo.
alter table tickets add column if not exists asignado_a uuid references usuarios(id);
