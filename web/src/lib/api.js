import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL;

// fetch() rechaza con un TypeError genérico ("Failed to fetch", "Load failed"...)
// cuando no hay conexión, el servidor está caído o el navegador bloquea la
// petición (ej. una extensión) — nunca llega a tocar res.ok. Sin esto, ese texto
// en inglés terminaba mostrándose tal cual en un toast o debajo de un formulario.
function esErrorDeRed(e) {
  return e instanceof TypeError;
}
const MENSAJE_SIN_CONEXION = "No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.";

/** Llama al backend adjuntando el token de la sesión activa. Lanza en 401/403/5xx. */
export async function apiFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const esFormData = options.body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        ...(esFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (e) {
    throw new Error(esErrorDeRed(e) ? MENSAJE_SIN_CONEXION : e.message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `El servidor no pudo completar la solicitud (error ${res.status}). Intenta de nuevo en unos minutos.`);
  }

  // Cualquier escritura sobre /tickets (crear, aprobar, cerrar, adjuntar...) puede
  // cambiar los contadores de la bandeja. El sidebar guarda su propia copia de la
  // lista y no sabría que cambió si no avisamos: este evento es ese aviso.
  if (options.method && options.method !== "GET" && path.includes("/tickets")) {
    window.dispatchEvent(new Event("tickets-changed"));
  }

  return res.json();
}

/** Igual que apiFetch, pero para respuestas binarias (ej. el PDF del oficio generado). */
export async function apiFetchBlob(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const esFormData = options.body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      cache: "no-store",
      ...options,
      headers: {
        ...(esFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (e) {
    throw new Error(esErrorDeRed(e) ? MENSAJE_SIN_CONEXION : e.message);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `El servidor no pudo completar la solicitud (error ${res.status}). Intenta de nuevo en unos minutos.`);
  }

  return res.blob();
}
