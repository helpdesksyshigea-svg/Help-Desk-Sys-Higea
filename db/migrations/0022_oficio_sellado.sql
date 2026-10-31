-- GET /tickets/:id/oficio-generado.pdf regenera el PDF "al vuelo" en cada
-- consulta con los datos ACTUALES de la base (firma_svg, cargo, config_oficio,
-- plantilla del tipo de solicitud). Esto significa que un oficio ya firmado
-- podía cambiar de forma retroactiva si alguien cambiaba su firma/cargo o la
-- administradora editaba la plantilla — sin posibilidad de probar ante un
-- tercero (ej. una auditoría de Supersalud o la Contraloría) qué decía
-- exactamente el documento el día en que quedó firmado.
--
-- Estas columnas guardan el snapshot inmutable: una vez el ticket recibe su
-- última firma requerida, el backend genera el PDF, lo sube a Storage (bucket
-- "adjuntos", igual que cualquier otro adjunto) y congela su referencia y
-- hash aquí. Desde ese momento, oficio-generado.pdf sirve ese archivo fijo en
-- vez de regenerarlo — solo los oficios aún incompletos siguen generándose al
-- vuelo como vista previa dinámica.
alter table tickets add column if not exists oficio_sellado_path text;
alter table tickets add column if not exists oficio_sellado_hash text;
alter table tickets add column if not exists oficio_sellado_at timestamptz;
