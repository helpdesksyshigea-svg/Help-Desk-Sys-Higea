import { createClient } from "@supabase/supabase-js";

// Clave pública (anon): solo sirve para iniciar sesión. Ninguna autorización
// de negocio depende de ella; eso lo resuelve siempre el backend.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
