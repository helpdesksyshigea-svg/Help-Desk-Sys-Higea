import { supabase } from "../config/supabase.js";

/**
 * Valida el JWT de Supabase, carga el usuario de negocio (tabla `usuarios`)
 * y sus permisos efectivos, y los adjunta a req.user.
 * Esta es la única fuente de autorización: el frontend nunca decide nada por sí mismo.
 */
export async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Falta el token de autenticación" });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  // Un fallo de red/5xx hacia Supabase Auth no significa que el token sea
  // inválido: responder 401 ahí haría que el frontend cierre la sesión del
  // usuario por un problema transitorio.
  if (authError?.name === "AuthRetryableFetchError") {
    console.error("[auth] Supabase Auth no disponible validando token:", authError.message);
    return res.status(503).json({ error: "El servicio de autenticación no está disponible, intente de nuevo" });
  }
  if (authError || !authData?.user) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select(
      "id, email, nombre, activo, proveedor, codigo_interno, identificacion, cargo, firma_path, firma_svg, beta_firma_oficio, roles(id, nombre)",
    )
    .eq("id", authData.user.id)
    .single();

  // PGRST116 = ninguna fila: el usuario de Auth no existe en `usuarios`. Cualquier
  // otro error es un fallo de la consulta (red, BD) y no debe presentarse como
  // "no registrado", porque el usuario sí lo está.
  if (usuarioError && usuarioError.code !== "PGRST116") {
    console.error(`[auth] error cargando usuario ${authData.user.id}:`, usuarioError.message);
    return res.status(500).json({ error: "No se pudo cargar el usuario, intente de nuevo" });
  }
  if (!usuario) {
    return res.status(403).json({ error: "El usuario no está registrado en el sistema" });
  }
  if (!usuario.activo) {
    return res.status(403).json({ error: "El usuario está desactivado" });
  }

  const { data: permisos, error: permisosError } = await supabase
    .from("rol_permisos")
    .select("permisos(clave)")
    .eq("rol_id", usuario.roles.id);

  if (permisosError) {
    console.error(`[auth] error cargando permisos del rol ${usuario.roles.id}:`, permisosError.message);
    return res.status(500).json({ error: "No se pudieron resolver los permisos" });
  }

  req.user = {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    proveedor: usuario.proveedor,
    codigo_interno: usuario.codigo_interno,
    identificacion: usuario.identificacion,
    cargo: usuario.cargo,
    firma_path: usuario.firma_path,
    firma_svg: usuario.firma_svg,
    beta_firma_oficio: usuario.beta_firma_oficio,
    rol: usuario.roles.nombre,
    permisos: new Set(permisos.map((p) => p.permisos.clave)),
  };

  next();
}

/** Middleware de autorización: exige uno o más permisos sobre req.user. */
export function requirePermission(...clavesRequeridas) {
  return (req, res, next) => {
    const permisos = req.user?.permisos;
    if (!permisos) return res.status(401).json({ error: "No autenticado" });
    const tienePermiso = clavesRequeridas.some((clave) => permisos.has(clave));
    if (!tienePermiso) {
      return res.status(403).json({ error: "No tiene permiso para esta acción" });
    }
    next();
  };
}
