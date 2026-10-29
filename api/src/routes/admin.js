import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { limpiarTicketsAntiguos } from "../lib/limpieza.js";

export const adminRouter = Router();
adminRouter.use(authenticate);

// Asigna el siguiente código interno de 3 dígitos libre (101, 102, ...), sin importar
// el rol: todo usuario nuevo lo necesita para poder radicar tickets o para que su
// nombre quede identificado en el código del ticket que otros radiquen a su nombre.
// Reintenta ante choque de unicidad por si dos invitaciones llegan al mismo tiempo.
async function siguienteCodigoInterno() {
  for (let intento = 0; intento < 20; intento++) {
    const { data } = await supabase
      .from("usuarios")
      .select("codigo_interno")
      .not("codigo_interno", "is", null)
      .order("codigo_interno", { ascending: false });
    const maximo = (data || [])
      .map((u) => Number(u.codigo_interno))
      .filter((n) => Number.isInteger(n))
      .reduce((max, n) => Math.max(max, n), 100);
    const candidato = String(maximo + 1 + intento).padStart(3, "0");
    const { count } = await supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("codigo_interno", candidato);
    if (!count) return candidato;
  }
  throw new Error("No se pudo asignar un código interno disponible");
}

// ======================= Almacenamiento =======================

const LIMITE_DB_BYTES = 500 * 1024 * 1024; // 500 MB, plan gratuito de Supabase
const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB, plan gratuito de Supabase
const TABLAS = [
  "tickets",
  "ticket_items",
  "ticket_adjuntos",
  "ticket_eventos",
  "aprobaciones",
  "usuarios",
  "roles",
];

adminRouter.get("/admin/almacenamiento", requirePermission("config.editar"), async (req, res) => {
  const conteos = {};
  for (const tabla of TABLAS) {
    const { count } = await supabase.from(tabla).select("*", { count: "exact", head: true });
    conteos[tabla] = count ?? 0;
  }

  let bytesStorage = 0;
  let archivosStorage = 0;
  const { data: carpetas } = await supabase.storage.from("adjuntos").list("", { limit: 1000 });
  for (const carpeta of carpetas || []) {
    const { data: archivos } = await supabase.storage.from("adjuntos").list(carpeta.name, { limit: 1000 });
    for (const archivo of archivos || []) {
      bytesStorage += archivo.metadata?.size || 0;
      archivosStorage++;
    }
  }

  const { data: configRow } = await supabase.from("config_sistema").select("valor").eq("clave", "dias_retencion_cierre").single();

  res.json({
    conteos,
    storage: { bytes: bytesStorage, archivos: archivosStorage, limite: LIMITE_STORAGE_BYTES },
    baseDatos: { limite: LIMITE_DB_BYTES }, // Supabase no expone el tamaño real por API; los conteos de filas son la señal disponible.
    diasRetencionCierre: Number(configRow?.valor ?? 90),
  });
});

adminRouter.patch("/admin/config/dias_retencion_cierre", requirePermission("config.editar"), async (req, res) => {
  const dias = Number(req.body.valor);
  if (!Number.isInteger(dias) || dias < 1) {
    return res.status(400).json({ error: "El valor debe ser un entero mayor a 0" });
  }
  const { error } = await supabase.from("config_sistema").update({ valor: String(dias) }).eq("clave", "dias_retencion_cierre");
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, dias });
});

// Borrado permanente, sin respaldo, de tickets cerrados hace más del plazo
// configurado. Solo lo puede disparar manualmente quien tiene config.editar;
// la ejecución automática diaria llama a /cron/limpiar-tickets en su lugar,
// protegida por un secreto compartido en vez de una sesión de usuario.
adminRouter.post("/admin/limpieza/ejecutar", requirePermission("config.editar"), async (req, res) => {
  try {
    const resultado = await limpiarTicketsAntiguos();
    res.json(resultado);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ======================= Usuarios =======================

adminRouter.get("/admin/usuarios", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, email, nombre, proveedor, codigo_interno, activo, created_at, roles(id, nombre)")
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

  const codigoInterno = await siguienteCodigoInterno();

  const { data: usuario, error } = await supabase
    .from("usuarios")
    .insert({
      id: invited.user.id,
      email: email.trim(),
      nombre: nombre.trim(),
      rol_id,
      proveedor: proveedor || null,
      codigo_interno: codigoInterno,
      activo: true,
    })
    .select("id, email, nombre, proveedor, codigo_interno, activo, created_at, roles(id, nombre)")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(usuario);
});

adminRouter.patch("/admin/usuarios/:id", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { rol_id, activo, nombre, proveedor, codigo_interno } = req.body;
  const patch = {};
  if (rol_id !== undefined) patch.rol_id = rol_id;
  if (activo !== undefined) patch.activo = activo;
  if (nombre !== undefined) patch.nombre = nombre;
  if (proveedor !== undefined) patch.proveedor = proveedor;
  if (codigo_interno !== undefined) {
    const valor = codigo_interno === null || codigo_interno === "" ? null : String(codigo_interno).trim();
    if (valor !== null && !/^\d{3}$/.test(valor)) {
      return res.status(400).json({ error: "El código interno debe tener exactamente 3 dígitos (ej. 101)" });
    }
    patch.codigo_interno = valor;
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("usuarios")
    .update(patch)
    .eq("id", req.params.id)
    .select("id, email, nombre, proveedor, codigo_interno, activo, created_at, roles(id, nombre)")
    .single();
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ese código interno ya lo tiene asignado otro usuario" });
    return res.status(500).json({ error: error.message });
  }
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
