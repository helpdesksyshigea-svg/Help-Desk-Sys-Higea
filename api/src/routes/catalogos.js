import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { supabase } from "../config/supabase.js";
import { authenticate } from "../middleware/auth.js";

// Lectura de catálogos para cualquier usuario autenticado (no requiere permisos de
// administración): el formulario de ticket necesita los tipos y motivos activos.
export const catalogosRouter = conManejoAsync(Router());
catalogosRouter.use(authenticate);

catalogosRouter.get("/catalogos/tipos", async (req, res) => {
  const { data, error } = await supabase
    .from("tipos_solicitud")
    .select("clave, etiqueta, campos_obligatorios")
    .eq("activo", true)
    .order("etiqueta");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

catalogosRouter.get("/catalogos/motivos", async (req, res) => {
  const { data, error } = await supabase.from("motivos").select("clave, etiqueta").eq("activo", true).order("etiqueta");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

catalogosRouter.get("/catalogos/ingenieros", async (req, res) => {
  const { data, error } = await supabase.from("ingenieros_higea").select("clave, etiqueta").eq("activo", true).order("etiqueta");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
