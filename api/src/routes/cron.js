import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { limpiarTicketsAntiguos } from "../lib/limpieza.js";
import { verificarAlertaAlmacenamiento } from "../lib/almacenamiento.js";

export const cronRouter = conManejoAsync(Router());

// Sin sesión de usuario: lo llama un job programado (GitHub Actions), autenticado
// con un secreto compartido en vez de un token de Supabase.
cronRouter.post("/cron/limpiar-tickets", async (req, res) => {
  const secreto = req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || secreto !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }
  const resultado = await limpiarTicketsAntiguos();

  // La alerta de almacenamiento no debe tumbar la limpieza si falla: se
  // intenta después de que la limpieza (que puede liberar espacio) ya corrió.
  let almacenamiento = null;
  try {
    almacenamiento = await verificarAlertaAlmacenamiento();
  } catch (e) {
    console.error("[cron] error verificando alerta de almacenamiento:", e.message);
  }

  res.json({ ...resultado, almacenamiento });
});
