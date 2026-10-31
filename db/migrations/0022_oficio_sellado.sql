-- GET /tickets/:id/oficio-generado.pdf regenera el PDF "al vuelo" en cada
-- consulta con los datos ACTUALES de la base (firma_svg, cargo, config_oficio,
-- plantilla del tipo de solicitud). Esto significa que un oficio ya firmado
-- podía cambiar de forma retroactiva si alguien cambiaba su firma/cargo o la
-- administradora editaba la plantilla — sin posibilidad de probar ante un
-- tercero (ej. una auditoría de Supersalud o la Contraloría) qué decía
-- exactamente el documento el día en que quedó firmado.
--
-- Estas columnas guardan el snapshot inmutable: una vez el ticket recibe su
-- última firma requerida, el backend congela los datos exactos usados para
-- construir el oficio (nombres, cédulas, cargos, el trazo de cada firma, el
-- texto de la plantilla — un JSON de unos pocos KB) y el hash SHA-256 del PDF
-- que esos datos producen. Desde ese momento, oficio-generado.pdf reconstruye
-- el PDF siempre a partir de este snapshot congelado (nunca de los datos
-- actuales, que sí pueden cambiar) — no se guarda el PDF en ningún lado, así
-- que un ticket firmado no gasta espacio de Storage, solo esta fila. Solo los
-- oficios aún incompletos siguen generándose al vuelo como vista previa
-- dinámica.
alter table tickets add column if not exists oficio_sellado_snapshot jsonb;
alter table tickets add column if not exists oficio_sellado_hash text;
alter table tickets add column if not exists oficio_sellado_at timestamptz;
