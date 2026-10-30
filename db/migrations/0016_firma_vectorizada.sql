-- Guarda el trazo SVG vectorizado de la firma (ver api/src/lib/firmaVector.js),
-- no la imagen en sí: así todas las firmas salen del mismo tamaño en el
-- oficio y el PDF no carga el peso variable de cada escaneo. firma_path
-- (migración 0015) se conserva como respaldo del archivo original subido.
alter table usuarios
  add column if not exists firma_svg text;
