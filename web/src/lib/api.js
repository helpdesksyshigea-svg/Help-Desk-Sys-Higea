import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

/** Llama al backend adjuntando el token de la sesión activa. Lanza en 401/403/5xx. */
export async function apiFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar ${path}`);
  }
  return res.json();
}
