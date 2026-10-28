import { Router } from "express";
import { authenticate } from "../middleware/auth.js";

export const meRouter = Router();

// El frontend llama esto al iniciar sesión para construir la UI
// a partir de los permisos reales, no de un rol hardcodeado en el cliente.
meRouter.get("/me", authenticate, (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    nombre: req.user.nombre,
    rol: req.user.rol,
    proveedor: req.user.proveedor,
    permisos: [...req.user.permisos],
  });
});
