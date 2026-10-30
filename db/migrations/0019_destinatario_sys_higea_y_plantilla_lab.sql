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
  'Yo, {{firmante}}, en mi calidad de {{cargo}} de la E.S.E. Hospital Orito, solicito su apoyo para efectuar la corrección del registro de laboratorio correspondiente a la factura {{factura}}, debido a una inconsistencia detectada en la información registrada frente al servicio efectivamente prestado.

Esta solicitud responde a la necesidad de mantener la integridad, exactitud y trazabilidad de la información institucional, de manera que exista plena concordancia entre la atención brindada, los registros de la historia clínica, los soportes correspondientes y los datos utilizados en el proceso de facturación.

La actualización de esta información contribuirá al cumplimiento de los procedimientos institucionales y de los requerimientos normativos aplicables, minimizando el riesgo de glosas, devoluciones y objeciones por parte de las entidades responsables de pago.'
where clave = 'elim_lab';
