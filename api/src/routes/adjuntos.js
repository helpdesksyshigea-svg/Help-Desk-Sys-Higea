import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import multer from "multer";
import { randomUUID } from "crypto";
import { supabase } from "../config/supabase.js";
import { authenticate } from "../middleware/auth.js";

export const adjuntosRouter = conManejoAsync(Router());
adjuntosRouter.use(authenticate);

const BUCKET = "adjuntos";
const TIPOS_PERMITIDOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const TAMANO_MAXIMO = 20 * 1024 * 1024; // 20 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO },
});

async function puedeVerTicket(req, ticketId) {
  if (req.user.permisos.has("tickets.ver_todos")) return true;
  const { data, error } = await supabase.from("tickets").select("solicitante_id").eq("id", ticketId).maybeSingle();
  // 22P02 = id que no es uuid: equivale a "no existe". Otro error es un fallo real
  // y no debe presentarse como "no tiene permiso".
  if (error && error.code !== "22P02") throw new Error(`verificando acceso al ticket ${ticketId}: ${error.message}`);
  return data?.solicitante_id === req.user.id;
}

// ---------- subir ----------
adjuntosRouter.post("/tickets/:id/adjuntos", upload.single("archivo"), async (req, res) => {
  const ticketId = req.params.id;
  const kind = req.body.kind; // 'oficio' | 'soporte' | 'evidencia'
  if (!["oficio", "soporte", "evidencia"].includes(kind)) {
    return res.status(400).json({ error: "kind inválido (oficio | soporte | evidencia)" });
  }
  if (!req.file) return res.status(400).json({ error: "Falta el archivo" });
  if (!TIPOS_PERMITIDOS.includes(req.file.mimetype)) {
    return res.status(400).json({ error: "Tipo de archivo no permitido (solo PDF, PNG, JPEG, WEBP)" });
  }
  if (!(await puedeVerTicket(req, ticketId))) {
    return res.status(403).json({ error: "No tiene permiso sobre este ticket" });
  }

  const { data: ticket, error: ticketError } = await supabase.from("tickets").select("estado").eq("id", ticketId).maybeSingle();
  if (ticketError && ticketError.code !== "22P02") {
    throw new Error(`cargando ticket ${ticketId}: ${ticketError.message}`);
  }
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  const storagePath = `${ticketId}/${randomUUID()}-${req.file.originalname}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) {
    console.error(`[adjuntos] error subiendo ${storagePath} a Storage:`, uploadError.message);
    return res.status(500).json({ error: uploadError.message });
  }

  const { data: adjunto, error: dbError } = await supabase
    .from("ticket_adjuntos")
    .insert({
      ticket_id: ticketId,
      storage_path: storagePath,
      nombre_original: req.file.originalname,
      tipo_mime: req.file.mimetype,
      tamano_bytes: req.file.size,
      kind,
      subido_por: req.user.id,
    })
    .select()
    .single();
  if (dbError) {
    console.error(`[adjuntos] error registrando adjunto ${storagePath}:`, dbError.message);
    // Sin la fila en ticket_adjuntos el archivo queda huérfano en Storage
    // (nadie lo lista ni lo limpia): se intenta retirar.
    const { error: rmError } = await supabase.storage.from(BUCKET).remove([storagePath]);
    if (rmError) console.error(`[adjuntos] no se pudo retirar el archivo huérfano ${storagePath}:`, rmError.message);
    return res.status(500).json({ error: dbError.message });
  }

  // El adjunto ya quedó guardado: si falla solo el registro en el historial se
  // deja constancia en el log en vez de responder error por algo que sí se hizo.
  const { error: eventoError } = await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo_evento: "adjunto_subido",
    estado_anterior: ticket.estado,
    estado_nuevo: ticket.estado,
    por: req.user.id,
    texto: `Adjunto: ${req.file.originalname} (${kind})`,
  });
  if (eventoError) {
    console.error(`[adjuntos] adjunto ${adjunto.id} subido, pero falló el evento de historial:`, eventoError.message);
  }

  res.status(201).json(adjunto);
});

// ---------- listar ----------
adjuntosRouter.get("/tickets/:id/adjuntos", async (req, res) => {
  if (!(await puedeVerTicket(req, req.params.id))) {
    return res.status(403).json({ error: "No tiene permiso sobre este ticket" });
  }
  const { data, error } = await supabase
    .from("ticket_adjuntos")
    .select("*, subido_por_usuario:usuarios!ticket_adjuntos_subido_por_fkey(nombre)")
    .eq("ticket_id", req.params.id)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- renombrar ----------
adjuntosRouter.patch("/tickets/:id/adjuntos/:adjuntoId", async (req, res) => {
  if (!(await puedeVerTicket(req, req.params.id))) {
    return res.status(403).json({ error: "No tiene permiso sobre este ticket" });
  }
  const nombre = req.body?.nombre_original?.trim();
  if (!nombre) return res.status(400).json({ error: "El nombre no puede estar vacío" });

  const { data: adjunto, error: findError } = await supabase
    .from("ticket_adjuntos")
    .select("ticket_id")
    .eq("id", req.params.adjuntoId)
    .single();
  if (findError || !adjunto || adjunto.ticket_id !== req.params.id) {
    return res.status(404).json({ error: "Adjunto no encontrado" });
  }

  const { data: actualizado, error } = await supabase
    .from("ticket_adjuntos")
    .update({ nombre_original: nombre })
    .eq("id", req.params.adjuntoId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(actualizado);
});

// ---------- eliminar ----------
// Puede eliminarlo quien lo subió (corrige su propio error) o quien ya tiene
// visibilidad total del ticket (supervisora/admin/SYS HIGEA) — no cualquiera
// que simplemente pueda ver el ticket. Un ticket cerrado no permite borrar
// adjuntos: son la evidencia del cierre, igual de inmutables que el resto
// del historial (ticket_eventos ya es append-only por el mismo motivo).
adjuntosRouter.delete("/tickets/:id/adjuntos/:adjuntoId", async (req, res) => {
  const { data: adjunto, error: findError } = await supabase
    .from("ticket_adjuntos")
    .select("ticket_id, storage_path, nombre_original, subido_por, kind")
    .eq("id", req.params.adjuntoId)
    .maybeSingle();
  if (findError) return res.status(500).json({ error: findError.message });
  if (!adjunto || adjunto.ticket_id !== req.params.id) {
    return res.status(404).json({ error: "Adjunto no encontrado" });
  }

  const { data: ticket, error: ticketError } = await supabase.from("tickets").select("estado").eq("id", req.params.id).maybeSingle();
  if (ticketError) return res.status(500).json({ error: ticketError.message });
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  const puedeEliminar = adjunto.subido_por === req.user.id || req.user.permisos.has("tickets.ver_todos");
  if (!puedeEliminar) {
    return res.status(403).json({ error: "No tiene permiso para eliminar este adjunto" });
  }
  if (ticket.estado === "cerrado") {
    return res.status(409).json({ error: "No se pueden eliminar adjuntos de un ticket cerrado" });
  }

  const { error: rmError } = await supabase.storage.from(BUCKET).remove([adjunto.storage_path]);
  if (rmError) console.error(`[adjuntos] no se pudo retirar ${adjunto.storage_path} de Storage:`, rmError.message);

  const { error: deleteError } = await supabase.from("ticket_adjuntos").delete().eq("id", req.params.adjuntoId);
  if (deleteError) return res.status(500).json({ error: deleteError.message });

  const { error: eventoError } = await supabase.from("ticket_eventos").insert({
    ticket_id: req.params.id,
    tipo_evento: "adjunto_eliminado",
    estado_anterior: ticket.estado,
    estado_nuevo: ticket.estado,
    por: req.user.id,
    texto: `Adjunto eliminado: ${adjunto.nombre_original} (${adjunto.kind})`,
  });
  if (eventoError) console.error(`[adjuntos] adjunto eliminado, pero falló el evento de historial:`, eventoError.message);

  res.json({ ok: true });
});

// ---------- url firmada para ver/descargar ----------
adjuntosRouter.get("/tickets/:id/adjuntos/:adjuntoId/url", async (req, res) => {
  if (!(await puedeVerTicket(req, req.params.id))) {
    return res.status(403).json({ error: "No tiene permiso sobre este ticket" });
  }
  const { data: adjunto, error } = await supabase
    .from("ticket_adjuntos")
    .select("storage_path, ticket_id")
    .eq("id", req.params.adjuntoId)
    .single();
  if (error || !adjunto || adjunto.ticket_id !== req.params.id) {
    return res.status(404).json({ error: "Adjunto no encontrado" });
  }

  // URL firmada de corta duración: nunca se expone el bucket como público.
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(adjunto.storage_path, 60);
  if (signError) return res.status(500).json({ error: signError.message });

  res.json({ url: signed.signedUrl });
});
