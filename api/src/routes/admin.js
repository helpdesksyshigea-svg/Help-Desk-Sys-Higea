import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";

export const adminRouter = Router();
adminRouter.use(authenticate);

// ======================= Usuarios =======================

adminRouter.get("/admin/usuarios", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, email, nombre, proveedor, activo, created_at, roles(id, nombre)")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Crea la cuenta en Supabase Auth (invitación por correo: la persona define su propia
// contraseña) y la fila de negocio en `usuarios` con el rol asignado por la administradora.
adminRouter.post("/admin/usuarios", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { email, nombre, rol_id, proveedor } = req.body;
  if (!email?.trim() || !nombre?.trim() || !rol_id) {
    return res.status(400).json({ error: "Faltan campos obligatorios (email, nombre, rol_id)" });
  }

  const { data: invited, error: authError } = await supabase.auth.admin.inviteUserByEmail(email.trim(), {
    redirectTo: process.env.WEB_ORIGIN,
  });
  if (authError) return res.status(400).json({ error: `No se pudo invitar al usuario: ${authError.message}` });

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .insert({
      id: invited.user.id,
      email: email.trim(),
      nombre: nombre.trim(),
      rol_id,
      proveedor: proveedor || null,
      activo: true,
    })
    .select("id, email, nombre, proveedor, activo, created_at, roles(id, nombre)")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(usuario);
});

adminRouter.patch("/admin/usuarios/:id", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { rol_id, activo, nombre, proveedor } = req.body;
  const patch = {};
  if (rol_id !== undefined) patch.rol_id = rol_id;
  if (activo !== undefined) patch.activo = activo;
  if (nombre !== undefined) patch.nombre = nombre;
  if (proveedor !== undefined) patch.proveedor = proveedor;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("usuarios")
    .update(patch)
    .eq("id", req.params.id)
    .select("id, email, nombre, proveedor, activo, created_at, roles(id, nombre)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ======================= Roles y permisos =======================

adminRouter.get("/admin/permisos", requirePermission("roles.gestionar"), async (req, res) => {
  const { data, error } = await supabase.from("permisos").select("*").order("clave");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.get("/admin/roles", requirePermission("roles.gestionar"), async (req, res) => {
  const { data: roles, error } = await supabase.from("roles").select("*").order("nombre");
  if (error) return res.status(500).json({ error: error.message });

  const { data: rolPermisos } = await supabase.from("rol_permisos").select("rol_id, permisos(clave)");
  const porRol = {};
  for (const rp of rolPermisos || []) {
    (porRol[rp.rol_id] ||= []).push(rp.permisos.clave);
  }
  res.json(roles.map((r) => ({ ...r, permisos: porRol[r.id] || [] })));
});

adminRouter.post("/admin/roles", requirePermission("roles.gestionar"), async (req, res) => {
  const { nombre, descripcion, permisos } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: "El rol necesita un nombre" });

  const { data: rol, error } = await supabase
    .from("roles")
    .insert({ nombre: nombre.trim(), descripcion: descripcion || null, es_sistema: false })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  if (Array.isArray(permisos) && permisos.length) {
    const { data: permisoRows } = await supabase.from("permisos").select("id, clave").in("clave", permisos);
    const { error: rpError } = await supabase
      .from("rol_permisos")
      .insert(permisoRows.map((p) => ({ rol_id: rol.id, permiso_id: p.id })));
    if (rpError) return res.status(500).json({ error: rpError.message });
  }

  res.status(201).json({ ...rol, permisos: permisos || [] });
});

// Reemplaza el nombre/descripción y el conjunto completo de permisos de un rol.
// No se puede renombrar ni borrar un rol de sistema, pero sí ajustar sus permisos.
adminRouter.patch("/admin/roles/:id", requirePermission("roles.gestionar"), async (req, res) => {
  const { data: rol } = await supabase.from("roles").select("*").eq("id", req.params.id).single();
  if (!rol) return res.status(404).json({ error: "Rol no encontrado" });

  const { nombre, descripcion, permisos } = req.body;
  if ((nombre || descripcion !== undefined) && rol.es_sistema) {
    return res.status(409).json({ error: "No se puede renombrar un rol de sistema" });
  }
  if (nombre?.trim() || descripcion !== undefined) {
    await supabase
      .from("roles")
      .update({ ...(nombre?.trim() ? { nombre: nombre.trim() } : {}), ...(descripcion !== undefined ? { descripcion } : {}) })
      .eq("id", rol.id);
  }

  if (Array.isArray(permisos)) {
    await supabase.from("rol_permisos").delete().eq("rol_id", rol.id);
    if (permisos.length) {
      const { data: permisoRows } = await supabase.from("permisos").select("id, clave").in("clave", permisos);
      const { error: rpError } = await supabase
        .from("rol_permisos")
        .insert(permisoRows.map((p) => ({ rol_id: rol.id, permiso_id: p.id })));
      if (rpError) return res.status(500).json({ error: rpError.message });
    }
  }

  res.json({ ok: true });
});

// ======================= Catálogos: tipos de solicitud y motivos =======================

// `referencia` describe dónde más vive la clave de este catálogo (la tabla/columna
// de tickets que la usa), para poder renombrarla en cascada sin dejar tickets huérfanos.
function catalogoRouter(path, tabla, referencia) {
  adminRouter.get(`/admin/${path}`, requirePermission("config.editar"), async (req, res) => {
    const { data, error } = await supabase.from(tabla).select("*").order("etiqueta");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  adminRouter.post(`/admin/${path}`, requirePermission("config.editar"), async (req, res) => {
    const { clave, etiqueta } = req.body;
    if (!clave?.trim() || !etiqueta?.trim()) {
      return res.status(400).json({ error: "Faltan clave y etiqueta" });
    }
    const { data, error } = await supabase
      .from(tabla)
      .insert({ clave: clave.trim(), etiqueta: etiqueta.trim() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  });

  // Desactivar en vez de borrar: tickets históricos siguen referenciando la clave.
  // Renombrar la clave (campo `nueva_clave`) actualiza en cascada los tickets que ya
  // la usan, para que no queden huérfanos apuntando a una clave que ya no existe.
  adminRouter.patch(`/admin/${path}/:clave`, requirePermission("config.editar"), async (req, res) => {
    const { etiqueta, activo, nueva_clave } = req.body;
    const claveActual = req.params.clave;

    if (nueva_clave?.trim() && nueva_clave.trim() !== claveActual) {
      const nueva = nueva_clave.trim();
      const { data: existente } = await supabase.from(tabla).select("clave").eq("clave", nueva).maybeSingle();
      if (existente) return res.status(409).json({ error: `Ya existe la clave '${nueva}'` });

      const { error: renameError } = await supabase.from(tabla).update({ clave: nueva }).eq("clave", claveActual);
      if (renameError) return res.status(500).json({ error: renameError.message });

      const { error: cascadeError } = await supabase
        .from(referencia.tabla)
        .update({ [referencia.columna]: nueva })
        .eq(referencia.columna, claveActual);
      if (cascadeError) return res.status(500).json({ error: cascadeError.message });
    }

    const patch = {};
    if (etiqueta !== undefined) patch.etiqueta = etiqueta;
    if (activo !== undefined) patch.activo = activo;
    const claveFinal = nueva_clave?.trim() || claveActual;
    const { data, error } = await supabase.from(tabla).update(patch).eq("clave", claveFinal).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });
}

catalogoRouter("tipos", "tipos_solicitud", { tabla: "tickets", columna: "tipo" });
catalogoRouter("motivos", "motivos", { tabla: "ticket_items", columna: "motivo" });

// ======================= SLA =======================

adminRouter.get("/admin/sla", requirePermission("config.editar"), async (req, res) => {
  const { data, error } = await supabase.from("sla_config").select("*").order("dias_habiles");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.patch("/admin/sla/:prioridad", requirePermission("config.editar"), async (req, res) => {
  const dias = Number(req.body.dias_habiles);
  if (!Number.isInteger(dias) || dias < 1) {
    return res.status(400).json({ error: "dias_habiles debe ser un entero mayor a 0" });
  }
  const { data, error } = await supabase
    .from("sla_config")
    .update({ dias_habiles: dias })
    .eq("prioridad", req.params.prioridad)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ======================= Festivos =======================

adminRouter.get("/admin/festivos", requirePermission("config.editar"), async (req, res) => {
  const { data, error } = await supabase.from("festivos_colombia").select("*").order("fecha");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

adminRouter.post("/admin/festivos", requirePermission("config.editar"), async (req, res) => {
  const { fecha, descripcion } = req.body;
  if (!fecha || !descripcion?.trim()) return res.status(400).json({ error: "Faltan fecha y descripción" });
  const { data, error } = await supabase
    .from("festivos_colombia")
    .insert({ fecha, descripcion: descripcion.trim() })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

adminRouter.delete("/admin/festivos/:fecha", requirePermission("config.editar"), async (req, res) => {
  const { error } = await supabase.from("festivos_colombia").delete().eq("fecha", req.params.fecha);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});
