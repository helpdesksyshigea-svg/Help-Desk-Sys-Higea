-- Reemplaza el código consecutivo por año (siguiente_numero_ticket) por un
-- código trazable: AAAAMMDDHHmm + código interno de 3 dígitos de quien
-- radica (ej. 202610282225101 = 2026-10-28 22:25, facturador 101). El
-- consecutivo por año queda en desuso pero no se elimina la tabla por si se
-- necesita auditar códigos antiguos.

alter table usuarios add column if not exists codigo_interno text;

-- Único solo cuando no es null, para no bloquear usuarios que aún no lo tienen asignado.
create unique index if not exists usuarios_codigo_interno_key
  on usuarios (codigo_interno) where codigo_interno is not null;
