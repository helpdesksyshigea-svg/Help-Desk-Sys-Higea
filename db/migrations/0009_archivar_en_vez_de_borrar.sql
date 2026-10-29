-- Cambio de criterio (decisión explícita del usuario, revierte la 0006): en vez
-- de borrar el ticket completo sin respaldo, la limpieza automática ahora solo
-- borra los adjuntos pesados (PDFs) y deja el ticket, sus registros y su
-- historial completo para siempre, solo de consulta.
alter table tickets add column if not exists archivado_at timestamptz;
