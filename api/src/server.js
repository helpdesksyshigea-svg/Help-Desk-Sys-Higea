import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { ticketsRouter } from "./routes/tickets.js";
import { adjuntosRouter } from "./routes/adjuntos.js";
import { adminRouter } from "./routes/admin.js";
import { catalogosRouter } from "./routes/catalogos.js";
import { cronRouter } from "./routes/cron.js";
import { dashboardRouter } from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN }));
app.use(express.json());

app.use(healthRouter);
app.use(meRouter);
app.use(ticketsRouter);
app.use(adjuntosRouter);
app.use(adminRouter);
app.use(catalogosRouter);
app.use(cronRouter);
app.use(dashboardRouter);

// Manejador de errores global: sin esto, cualquier error que no se capture
// dentro de una ruta (ej. multer rechazando un archivo por tamaño, antes de
// llegar al handler) lo responde el manejador por defecto de Express, que
// no devuelve JSON — el frontend entonces solo puede mostrar un mensaje
// genérico en vez de explicar qué pasó. Aquí también llegan las excepciones de
// los handlers async (ver lib/asyncRouter.js).
app.use((err, req, res, next) => {
  // Si la respuesta ya empezó a enviarse no se puede mandar otro JSON; Express
  // cierra la conexión.
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "El archivo supera el tamaño máximo permitido (20 MB)" });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `No se pudo procesar el archivo: ${err.message}` });
  }
  // express.json() con un cuerpo malformado: es un error del cliente (400), no del servidor.
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido" });
  }
  console.error(`Error no manejado en ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: "Ocurrió un error inesperado en el servidor" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
