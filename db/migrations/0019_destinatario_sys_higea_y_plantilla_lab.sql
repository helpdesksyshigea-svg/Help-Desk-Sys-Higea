-- El destinatario fijo del oficio pasa de "SYS SOFTWARE Y SOLUCIONES LTDA /
-- Pasto, Nariño" a "SOPORTE TÉCNICO SYS HIGEA / Mesa de Ayuda" — decisión
-- explícita del usuario tras revisar un oficio real de laboratorio que así
-- lo dirige. La migración 0018 ya corrió con el valor anterior, así que acá
-- se actualiza el registro existente (el default nuevo en el create table
-- de 0018 solo aplicaría a una instalación desde cero).
update config_oficio set
  destinatario_nombre = 'SOPORTE TÉCNICO SYS HIGEA',
  destinatario_ciudad = 'Pasto, Nariño',
  updated_at = now()
where id = true;

-- Plantilla real para "Eliminación de laboratorio (código y resultado)",
-- tomada tal cual de un oficio real del hospital (Word), con el nombre de
-- quien firma reemplazado por el marcador {{firmante}}.
update tipos_solicitud set plantilla_oficio =
  'Yo, {{firmante}}, en mi calidad de {{cargo}} de la E.S.E. Hospital Orito, me permito solicitar su apoyo para corregir en el sistema el registro de laboratorio de la atención relacionada a continuación, debido a una inconsistencia detectada entre el servicio efectivamente prestado y lo facturado.

La corrección se requiere para garantizar la coherencia entre la historia clínica, los soportes de la atención y la facturación, conforme a la normatividad vigente en materia de facturación electrónica en salud y reporte de RIPS, y así prevenir glosas y devoluciones por parte de las entidades responsables de pago.

Una vez efectuados los ajustes, les agradecemos confirmar por este mismo medio para proceder con la validación y el envío de la factura correspondiente. Se adjuntan los soportes que respaldan la solicitud.'
where clave = 'elim_lab';
