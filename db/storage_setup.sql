-- Crear el bucket privado de adjuntos en Supabase Storage.
-- Ejecutar en el SQL Editor del proyecto Supabase (requiere permisos de servicio).

insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', false)
on conflict (id) do nothing;

-- Sin políticas de acceso directo desde el cliente: solo el backend
-- (con la service role key) sube archivos y genera URLs firmadas de corta duración.
-- No se definen políticas RLS públicas de lectura/escritura a propósito.
