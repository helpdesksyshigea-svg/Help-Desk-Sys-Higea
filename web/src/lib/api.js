import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

/** Llama al backend adjuntando el token de la sesión activa. Lanza en 401/403/5xx. */
export async function apiFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const esFormData = options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    ...options,
    headers: {
      ...(esFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar ${path}`);
  }

  // Cualquier escritura sobre /tickets (crear, aprobar, cerrar, adjuntar...) puede
  // cambiar los contadores de la bandeja. El sidebar guarda su propia copia de la
  // lista y no sabría que cambió si no avisamos: este evento es ese aviso.
  if (options.method && options.method !== "GET" && path.includes("/tickets")) {
    window.dispatchEvent(new Event("tickets-changed"));
  }

  return res.json();
}
