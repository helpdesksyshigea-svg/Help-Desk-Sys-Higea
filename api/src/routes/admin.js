import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { limpiarTicketsAntiguos } from "../lib/limpieza.js";
import { medirStorage, medirBaseDatos, LIMITE_DB_BYTES } from "../lib/almacenamiento.js";

export const adminRouter = conManejoAsync(Router());
adminRouter.use(authenticate);

// Asigna el siguiente código interno de 3 dígitos libre (101, 102, ...), sin importar
// el rol: todo usuario nuevo lo necesita para poder radicar tickets o para que su
// nombre quede identificado en el código del ticket que otros radiquen a su nombre.
// Reintenta ante choque de unicidad por si dos invitaciones llegan al mismo tiempo.
async function siguienteCodigoInterno() {
  for (let intento = 0; intento < 20; intento++) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("codigo_interno")
      .not("codigo_interno", "is", null)
      .order("codigo_interno", { ascending: false });
    if (error) throw new Error(`consultando códigos internos: ${error.message}`);
    const maximo = (data || [])
      .map((u) => Number(u.codigo_interno))
      .filter((n) => Number.isInteger(n))
      .reduce((max, n) => Math.max(max, n), 100);
    const candidato = String(maximo + 1 + intento).padStart(3, "0");
    const { count, error: countError } = await supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .eq("codigo_interno", candidato);
    // Con error, count es null y el candidato se daría por libre sin haberlo verificado.
    if (countError) throw new Error(`verificando código interno ${candidato}: ${countError.message}`);
    if (!count) return candidato;
  }
  throw new Error("No se pudo asignar un código interno disponible");
}

// ======================= Almacenamiento =======================

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
    const { count, error } = await supabase.from(tabla).select("*", { count: "exact", head: true });
    if (error) {
      console.error(`[admin] error contando filas de ${tabla}:`, error.message);
      return res.status(500).json({ error: `No se pudo contar ${tabla}: ${error.message}` });
    }
    conteos[tabla] = count ?? 0;
  }

  let storage;
  try {
    storage = await medirStorage();
  } catch (e) {
    console.error("[admin] error midiendo Storage:", e.message);
    return res.status(500).json({ error: `No se pudo leer el almacenamiento: ${e.message}` });
  }

  // Requiere la migración 0010 (función SQL tamano_base_datos). Si todavía no
  // se corrió, se muestra solo el conteo de filas en vez de romper la pantalla.
  let baseDatos = { limite: LIMITE_DB_BYTES, bytes: null };
  try {
    baseDatos = await medirBaseDatos();
  } catch (e) {
    console.warn("[admin] no se pudo medir el tamaño real de la base de datos:", e.message);
  }

  const { data: configRow, error: configError } = await supabase
    .from("config_sistema")
    .select("valor")
    .eq("clave", "dias_retencion_cierre")
    .maybeSingle();
  if (configError) {
    console.error("[admin] error leyendo dias_retencion_cierre:", configError.message);
    return res.status(500).json({ error: configError.message });
  }

  res.json({
    conteos,
    storage,
    baseDatos,
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
    console.error("[admin] error en limpieza manual:", e.message);
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

  // La invitación ya salió: si algo falla de aquí en adelante la cuenta de Auth
  // existe sin fila en `usuarios`, así que se deja el id en el log para poder
  // completarla o eliminarla a mano.
  let codigoInterno;
  try {
    codigoInterno = await siguienteCodigoInterno();
  } catch (e) {
    console.error(`[admin] invitación enviada a ${email.trim()} (auth id ${invited.user.id}) pero falló el código interno:`, e.message);
    return res.status(500).json({ error: `Se envió la invitación, pero no se pudo asignar el código interno: ${e.message}` });
  }

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
  if (error) {
    console.error(`[admin] invitación enviada a ${email.trim()} (auth id ${invited.user.id}) pero falló el insert en usuarios:`, error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(usuario);
});

adminRouter.patch("/admin/usuarios/:id", requirePermission("usuarios.gestionar"), async (req, res) => {
  const { rol_id, activo, nombre, proveedor, codigo_interno, email } = req.body;
  const patch = {};
  if (rol_id !== undefined) patch.rol_id = rol_id;
  if (activo !== undefined) patch.activo = activo;
  if (nombre !== undefined) patch.nombre = nombre;
  if (proveedor !== undefined) patch.proveedor = proveedor;
  if (email !== undefined) {
    const valor = typeof email === "string" ? email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
      return res.status(400).json({ error: "El correo no tiene un formato válido" });
    }
    // El correo vive en dos lugares: auth.users (con qué inicia sesión) y
    // usuarios (de negocio). Se actualiza primero en Auth; si eso falla, la
    // fila de negocio ni se toca, para que nunca queden desincronizados.
    const { error: authError } = await supabase.auth.admin.updateUserById(req.params.id, { email: valor });
    if (authError) return res.status(400).json({ error: `No se pudo actualizar el correo de acceso: ${authError.message}` });
    patch.email = valor;
  }
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

// Permite a la administradora fijar una contraseña directamente (ej. soporte
// telefónico con el hospital), sin depender de que el correo de invitación o
// de "olvidé mi contraseña" llegue. No revela la contraseña anterior ni la
// nueva en ningún log.
adminRouter.post("/admin/usuarios/:id/contrasena", requirePermission("usuarios.gestionar"), async (req, res) => {
  const password = req.body?.password;
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
  }
  const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// Borrado real (no desactivación). La base de datos protege la integridad del
// historial: cualquier usuario con tickets radicados, aprobaciones, adjuntos
// o eventos a su nombre no se puede borrar (restricción de llave foránea) —
// en ese caso el error se devuelve tal cual, explicando que debe desactivarse
// en vez de eliminarse. Solo cuentas sin ningún rastro de uso se pueden borrar.
adminRouter.delete("/admin/usuarios/:id", requirePermission("usuarios.gestionar"), async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "No puede eliminar su propia cuenta" });
  }
  const { error } = await supabase.from("usuarios").delete().eq("id", req.params.id);
  if (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        error: "Este usuario tiene tickets, aprobaciones o historial a su nombre; no se puede eliminar sin perder ese rastro. Desactívelo en su lugar.",
      });
    }
    return res.status(500).json({ error: error.message });
  }
  const { error: authError } = await supabase.auth.admin.deleteUser(req.params.id);
  if (authError) {
    console.error(`[admin] usuario ${req.params.id} borrado de usuarios pero no de Auth:`, authError.message);
    return res.status(500).json({ error: `Usuario eliminado del sistema, pero no de la cuenta de acceso: ${authError.message}` });
  }
  res.json({ ok: true });
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

  // Sin este chequeo los roles se mostraban sin permisos, y guardarlos así desde
  // la UI se los borraría de verdad.
  const { data: rolPermisos, error: rpError } = await supabase.from("rol_permisos").select("rol_id, permisos(clave)");
  if (rpError) return res.status(500).json({ error: rpError.message });
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
    const { data: permisoRows, error: pError } = await supabase.from("permisos").select("id, clave").in("clave", permisos);
    if (pError) return res.status(500).json({ error: pError.message });
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
  const { data: rol, error: rolError } = await supabase.from("roles").select("*").eq("id", req.params.id).maybeSingle();
  if (rolError && rolError.code !== "22P02") return res.status(500).json({ error: rolError.message });
  if (!rol) return res.status(404).json({ error: "Rol no encontrado" });

  const { nombre, descripcion, permisos } = req.body;
  if ((nombre || descripcion !== undefined) && rol.es_sistema) {
    return res.status(409).json({ error: "No se puede renombrar un rol de sistema" });
  }
  if (nombre?.trim() || descripcion !== undefined) {
    const { error: updError } = await supabase
      .from("roles")
      .update({ ...(nombre?.trim() ? { nombre: nombre.trim() } : {}), ...(descripcion !== undefined ? { descripcion } : {}) })
      .eq("id", rol.id);
    if (updError) return res.status(500).json({ error: updError.message });
  }

  if (Array.isArray(permisos)) {
    // Se resuelven los ids antes de borrar: si esta lectura falla, el rol conserva
    // sus permisos en vez de quedar vacío.
    let permisoRows = [];
    if (permisos.length) {
      const { data, error: pError } = await supabase.from("permisos").select("id, clave").in("clave", permisos);
      if (pError) return res.status(500).json({ error: pError.message });
      permisoRows = data || [];
    }
    const { error: delError } = await supabase.from("rol_permisos").delete().eq("rol_id", rol.id);
    if (delError) return res.status(500).json({ error: delError.message });
    if (permisoRows.length) {
      const { error: rpError } = await supabase
        .from("rol_permisos")
        .insert(permisoRows.map((p) => ({ rol_id: rol.id, permiso_id: p.id })));
      if (rpError) {
        console.error(`[admin] permisos del rol ${rol.id} borrados pero falló reinsertarlos:`, rpError.message);
        return res.status(500).json({ error: rpError.message });
      }
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
      const { data: existente, error: existeError } = await supabase.from(tabla).select("clave").eq("clave", nueva).maybeSingle();
      if (existeError) return res.status(500).json({ error: existeError.message });
      if (existente) return res.status(409).json({ error: `Ya existe la clave '${nueva}'` });

      const { error: renameError } = await supabase.from(tabla).update({ clave: nueva }).eq("clave", claveActual);
      if (renameError) return res.status(500).json({ error: renameError.message });

      const { error: cascadeError } = await supabase
        .from(referencia.tabla)
        .update({ [referencia.columna]: nueva })
        .eq(referencia.columna, claveActual);
      if (cascadeError) {
        console.error(
          `[admin] clave '${claveActual}' renombrada a '${nueva}' en ${tabla}, pero falló la cascada a ${referencia.tabla}.${referencia.columna}:`,
          cascadeError.message
        );
        return res.status(500).json({ error: cascadeError.message });
      }
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
