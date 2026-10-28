import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { supabase } from "../config/supabase.js";
import { authenticate } from "../middleware/auth.js";

export const adjuntosRouter = Router();
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
  const { data } = await supabase.from("tickets").select("solicitante_id").eq("id", ticketId).single();
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
    return res.status(403).json({ error: "No tiene permiso sobre este tiquete" });
  }

  const { data: ticket } = await supabase.from("tickets").select("estado").eq("id", ticketId).single();
  if (!ticket) return res.status(404).json({ error: "Tiquete no encontrado" });

  const storagePath = `${ticketId}/${randomUUID()}-${req.file.originalname}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
  if (uploadError) return res.status(500).json({ error: uploadError.message });

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
  if (dbError) return res.status(500).json({ error: dbError.message });

  await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo_evento: "adjunto_subido",
    estado_anterior: ticket.estado,
    estado_nuevo: ticket.estado,
    por: req.user.id,
    texto: `Adjunto: ${req.file.originalname} (${kind})`,
  });

  res.status(201).json(adjunto);
});

// ---------- listar ----------
adjuntosRouter.get("/tickets/:id/adjuntos", async (req, res) => {
  if (!(await puedeVerTicket(req, req.params.id))) {
    return res.status(403).json({ error: "No tiene permiso sobre este tiquete" });
  }
  const { data, error } = await supabase
    .from("ticket_adjuntos")
    .select("*")
    .eq("ticket_id", req.params.id)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ---------- url firmada para ver/descargar ----------
adjuntosRouter.get("/tickets/:id/adjuntos/:adjuntoId/url", async (req, res) => {
  if (!(await puedeVerTicket(req, req.params.id))) {
    return res.status(403).json({ error: "No tiene permiso sobre este tiquete" });
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
