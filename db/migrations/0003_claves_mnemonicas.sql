-- Renombra las claves de tipos_solicitud y motivos a un formato mnemónico
-- (acción + tema) y actualiza los tickets/registros existentes que ya las usan.

begin;

update tipos_solicitud set clave = 'elim_lab' where clave = 'lab';
update tickets set tipo = 'elim_lab' where tipo = 'lab';

update tipos_solicitud set clave = 'elim_fact' where clave = 'factura';
update tickets set tipo = 'elim_fact' where tipo = 'factura';

update tipos_solicitud set clave = 'elim_hc' where clave = 'hc';
update tickets set tipo = 'elim_hc' where tipo = 'hc';

update tipos_solicitud set clave = 'otro_ajuste' where clave = 'otro';
update tickets set tipo = 'otro_ajuste' where tipo = 'otro';

update motivos set clave = 'doble_fact' where clave = 'doble';
update ticket_items set motivo = 'doble_fact' where motivo = 'doble';

update motivos set clave = 'error_registro' where clave = 'registro';
update ticket_items set motivo = 'error_registro' where motivo = 'registro';

update motivos set clave = 'otro_motivo' where clave = 'otro';
update ticket_items set motivo = 'otro_motivo' where motivo = 'otro';

commit;
