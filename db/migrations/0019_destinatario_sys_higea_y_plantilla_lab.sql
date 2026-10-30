-- El destinatario fijo del oficio pasa de "SYS SOFTWARE Y SOLUCIONES LTDA /
-- Pasto, Nariño" a "SOPORTE TÉCNICO SYS HIGEA / Mesa de Ayuda" — decisión
-- explícita del usuario tras revisar un oficio real de laboratorio que así
-- lo dirige. La migración 0018 ya corrió con el valor anterior, así que acá
-- se actualiza el registro existente (el default nuevo en el create table
-- de 0018 solo aplicaría a una instalación desde cero).
update config_oficio set
  destinatario_nombre = 'SOPORTE TÉCNICO SYS HIGEA',
  destinatario_ciudad = 'Mesa de Ayuda',
  updated_at = now()
where id = true;

-- Plantilla real para "Eliminación de laboratorio (código y resultado)",
-- tomada tal cual de un oficio real del hospital (Word), con el nombre de
-- quien firma reemplazado por el marcador {{firmante}}.
update tipos_solicitud set plantilla_oficio =
  'Yo {{firmante}}, por medio del presente, desde el Proceso de Facturación de la E.S.E. Hospital Orito, me permito solicitar su apoyo para realizar en el sistema corrección de la factura del registro de laboratorio correspondientes a la atención que se relaciona a continuación, en razón a que se identificó error en la facturación entre el servicio efectivamente prestado y lo registrado en la factura.

La corrección se requiere para garantizar la coherencia entre la historia clínica, los soportes de la atención y la facturación, conforme a la normatividad vigente en materia de facturación electrónica en salud y reporte de RIPS, y así prevenir glosas y devoluciones por parte de las entidades responsables de pago.

Una vez efectuados los ajustes, les agradecemos confirmar por este mismo medio para proceder con la validación y el envío de la factura correspondiente. Se adjuntan los soportes que respaldan la solicitud.'
where clave = 'elim_lab';
