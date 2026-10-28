import { useAuth } from "../context/AuthContext";

/** Oculta una ruta/sección si el usuario no tiene el permiso — solo UX, el backend decide de verdad. */
export function RequirePermission({ permisos, children, fallback = null }) {
  const { tienePermiso } = useAuth();
  if (!tienePermiso(...permisos)) return fallback;
  return children;
}
