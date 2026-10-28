import "dotenv/config";
import express from "express";
import cors from "cors";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { ticketsRouter } from "./routes/tickets.js";

const app = express();

app.use(cors({ origin: process.env.WEB_ORIGIN }));
app.use(express.json());

app.use(healthRouter);
app.use(meRouter);
app.use(ticketsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`API escuchando en el puerto ${port}`);
});
