-- Esquema inicial: Help Desk SYS HIGEA
-- Postgres (Supabase). Ejecutar en orden. No incluye datos reales de pacientes.

create extension if not exists "pgcrypto";

-- ---------- RBAC ----------

create table roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  descripcion text,
  es_sistema boolean not null default false, -- true para los 4 roles semilla, no se pueden borrar
  created_at timestamptz not null default now()
);

create table permisos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique, -- ej: 'tickets.aprobar'
  descripcion text not null
);

create table rol_permisos (
  rol_id uuid not null references roles(id) on delete cascade,
  permiso_id uuid not null references permisos(id) on delete cascade,
  primary key (rol_id, permiso_id)
);

-- usuarios.id = id del usuario en Supabase Auth (auth.users.id)
create table usuarios (
  id uuid primary key,
  email text not null unique,
  nombre text not null,
  rol_id uuid not null references roles(id),
  proveedor text, -- ej: 'SYS HIGEA', null para personal del hospital
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Configuración (parametrizable desde el panel de administración) ----------

create table festivos_colombia (
  fecha date primary key,
  descripcion text not null
);

create table sla_config (
  prioridad text primary key, -- 'alta' | 'normal' | 'baja'
  dias_habiles int not null
);

create table tipos_solicitud (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true,
  requiere_factura boolean not null default true -- false para historias clínicas: no tienen número de factura
);

create table motivos (
  clave text primary key,
  etiqueta text not null,
  activo boolean not null default true
);

-- ---------- Tickets ----------

create table tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tipo text not null references tipos_solicitud(clave),
  prioridad text not null references sla_config(prioridad),
  estado text not null default 'pendiente',
  solicitante_id uuid not null references usuarios(id),
  firmante text not null, -- nombre de quien firma el oficio (puede diferir de quien radica)
  observacion text,
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  updated_at timestamptz not null default now(),
  aprobado_at timestamptz,
  cerrado_at timestamptz
);

create table ticket_items (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  factura text,
  paciente text,
  documento text,
  cups text,
  descripcion text,
  fecha date,
  motivo text not null references motivos(clave) -- motivo por registro individual (backlog ítem 2, resuelto desde el inicio)
);

create table ticket_adjuntos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  storage_path text not null, -- ruta en Supabase Storage, bucket privado
  nombre_original text not null,
  tipo_mime text not null,
  tamano_bytes int not null,
  kind text not null, -- 'oficio' | 'soporte' | 'evidencia'
  subido_por uuid not null references usuarios(id),
  created_at timestamptz not null default now()
);

create table aprobaciones (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references tickets(id) on delete cascade,
  decision text not null, -- 'aprobado' | 'devuelto'
  hash_items text,         -- hash de ticket_items en el momento de aprobar; se recalcula y compara al cerrar
  nota text,
  decidido_por uuid not null references usuarios(id),
  created_at timestamptz not null default now()
);

-- Append-only: la API solo inserta, nunca actualiza ni borra filas de esta tabla.
create table ticket_eventos (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  tipo_evento text not null, -- 'creado' | 'aprobado' | 'devuelto' | 'tomado' | 'requiere_info' | 'respondido' | 'cerrado' | 'reabierto'
  estado_anterior text,
  estado_nuevo text,
  por uuid not null references usuarios(id),
  texto text,
  created_at timestamptz not null default now()
);

-- Trigger de refuerzo: bloquea UPDATE/DELETE sobre ticket_eventos incluso si alguien
-- obtiene acceso directo a la base, para que el historial sea evidencia confiable.
create or replace function bloquear_mutacion_eventos()
returns trigger as $$
begin
  raise exception 'ticket_eventos es append-only: % no permitido', tg_op;
end;
$$ language plpgsql;

create trigger no_update_eventos
  before update on ticket_eventos
  for each row execute function bloquear_mutacion_eventos();

create trigger no_delete_eventos
  before delete on ticket_eventos
  for each row execute function bloquear_mutacion_eventos();

-- ---------- Índices ----------

create index idx_tickets_estado on tickets(estado);
create index idx_tickets_solicitante on tickets(solicitante_id);
create index idx_ticket_items_ticket on ticket_items(ticket_id);
create index idx_ticket_eventos_ticket on ticket_eventos(ticket_id);
create index idx_ticket_adjuntos_ticket on ticket_adjuntos(ticket_id);
