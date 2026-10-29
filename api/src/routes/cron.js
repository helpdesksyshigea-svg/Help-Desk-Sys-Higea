import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { limpiarTicketsAntiguos } from "../lib/limpieza.js";

export const cronRouter = conManejoAsync(Router());

// Sin sesión de usuario: lo llama un job programado (GitHub Actions), autenticado
// con un secreto compartido en vez de un token de Supabase.
cronRouter.post("/cron/limpiar-tickets", async (req, res) => {
  const secreto = req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secreto !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }
  try {
    const resultado = await limpiarTicketsAntiguos();
    res.json(resultado);
  } catch (e) {
    console.error("[cron] error en limpiar-tickets:", e.message);
    res.status(500).json({ error: e.message });
  }
});
