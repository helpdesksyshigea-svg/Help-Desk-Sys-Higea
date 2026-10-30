import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { authenticate } from "../middleware/auth.js";

export const meRouter = conManejoAsync(Router());

// El frontend llama esto al iniciar sesión para construir la UI
// a partir de los permisos reales, no de un rol hardcodeado en el cliente.
meRouter.get("/me", authenticate, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    id: req.user.id,
    email: req.user.email,
    nombre: req.user.nombre,
    rol: req.user.rol,
    proveedor: req.user.proveedor,
    permisos: [...req.user.permisos],
    identificacion: req.user.identificacion,
    cargo: req.user.cargo,
    tieneFirma: !!req.user.firma_svg,
    beta_firma_oficio: req.user.beta_firma_oficio,
  });
});
