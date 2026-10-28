import "dotenv/config";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { ticketsRouter } from "./routes/tickets.js";
import { adjuntosRouter } from "./routes/adjuntos.js";
import { adminRouter } from "./routes/admin.js";
import { catalogosRouter } from "./routes/catalogos.js";

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN }));
app.use(express.json());

app.use(healthRouter);
app.use(meRouter);
app.use(ticketsRouter);
app.use(adjuntosRouter);
app.use(adminRouter);
app.use(catalogosRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
