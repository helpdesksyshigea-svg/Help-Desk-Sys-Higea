-- Ninguna tabla tenía Row Level Security activado. Con RLS apagado, Postgres
-- aplica los privilegios de tabla normales: por defecto Supabase le da
-- SELECT/INSERT/UPDATE/DELETE a los roles "anon" y "authenticated" sobre las
-- tablas públicas. La clave "anon" viaja en el bundle del frontend
-- (web/src/lib/supabase.js) solo para iniciar sesión, pero sin RLS esa misma
-- clave podía leer y escribir directo contra /rest/v1/ sobre cualquier tabla
-- de aquí abajo — tickets, ticket_items (nombres y documentos de pacientes),
-- usuarios (incluida firma_svg), aprobaciones, rol_permisos — sin pasar por
-- el backend ni por ningún chequeo de permiso.
--
-- El backend (api/src/config/supabase.js) usa siempre la service role key,
-- que ignora RLS por completo. Por eso activar RLS sin ninguna política
-- ("deny-all") no cambia nada para la API: toda la lógica de negocio sigue
-- intacta. Lo único que cierra es el acceso directo desde el navegador con
-- la clave anon, que nunca debió tener permisos sobre estas tablas.
--
-- Si en el futuro se necesita que el frontend lea algo directo de Supabase
-- (sin pasar por la API), se agrega una política explícita y acotada en una
-- migración aparte — nunca el default abierto.

alter table roles enable row level security;
alter table permisos enable row level security;
alter table rol_permisos enable row level security;
alter table usuarios enable row level security;
alter table festivos_colombia enable row level security;
alter table sla_config enable row level security;
alter table tipos_solicitud enable row level security;
alter table motivos enable row level security;
alter table ticket_secuencias enable row level security;
alter table tickets enable row level security;
alter table ticket_items enable row level security;
alter table ticket_adjuntos enable row level security;
alter table aprobaciones enable row level security;
alter table ticket_eventos enable row level security;
alter table config_sistema enable row level security;
alter table ingenieros_higea enable row level security;
alter table config_oficio enable row level security;

-- Igual que tickets.js:573 (api/src/routes/tickets.js) invoca esta función
-- con la service role, que ignora GRANT/REVOKE sobre funciones igual que
-- ignora RLS — este REVOKE no afecta al backend. Sin él, cualquiera con la
-- clave anon podía llamar /rest/v1/rpc/eliminar_ticket_permanente y borrar
-- cualquier ticket junto con su historial append-only, porque las funciones
-- en Postgres son ejecutables por PUBLIC a menos que se revoque a mano.
revoke execute on function eliminar_ticket_permanente(uuid) from public, anon, authenticated;
