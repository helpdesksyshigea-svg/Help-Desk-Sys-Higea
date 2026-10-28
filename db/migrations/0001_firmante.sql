-- Agrega el nombre de quien firma el oficio (puede ser distinto de quien radica el ticket).
-- Ejecutar solo si la tabla tickets ya existía antes de este cambio.

alter table tickets add column if not exists firmante text;
update tickets set firmante = 'Sin registrar' where firmante is null;
alter table tickets alter column firmante set not null;
