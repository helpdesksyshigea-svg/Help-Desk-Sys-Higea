import { Router } from "express";
import multer from "multer";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { supabase } from "../config/supabase.js";
import { authenticate } from "../middleware/auth.js";

export const perfilRouter = conManejoAsync(Router());
perfilRouter.use(authenticate);

const BUCKET = "adjuntos";
const TIPOS_FIRMA_PERMITIDOS = ["image/png", "image/jpeg", "image/webp"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Solo visible/usable detrás de perfil.beta_firma_oficio en el frontend; el
// endpoint en sí no exige un permiso aparte porque cada quien solo puede
// tocar su propia firma (req.user.id), nunca la de otra persona.
perfilRouter.get("/perfil", async (req, res) => {
  let firmaUrl = null;
  if (req.user.firma_path) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(req.user.firma_path, 60);
    if (!error) firmaUrl = data?.signedUrl || null;
  }
  res.json({
    identificacion: req.user.identificacion,
    cargo: req.user.cargo,
    tieneFirma: !!req.user.firma_path,
    firmaUrl,
  });
});

perfilRouter.patch("/perfil", upload.single("firma"), async (req, res) => {
  const patch = {};
  if (req.body.identificacion !== undefined) patch.identificacion = req.body.identificacion.trim() || null;
  if (req.body.cargo !== undefined) patch.cargo = req.body.cargo.trim() || null;

  if (req.file) {
    if (!TIPOS_FIRMA_PERMITIDOS.includes(req.file.mimetype)) {
      return res.status(400).json({ error: "La firma debe ser una imagen PNG, JPEG o WebP" });
    }
    const extension = req.file.mimetype === "image/png" ? "png" : req.file.mimetype === "image/jpeg" ? "jpg" : "webp";
    const storagePath = `firmas/${req.user.id}-${Date.now()}.${extension}`;
    const anterior = req.user.firma_path;
    const { error: subidaError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype });
    if (subidaError) return res.status(500).json({ error: `No se pudo subir la firma: ${subidaError.message}` });
    patch.firma_path = storagePath;
    if (anterior) await supabase.storage.from(BUCKET).remove([anterior]);
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("usuarios").update(patch).eq("id", req.user.id);
    if (error) return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});
