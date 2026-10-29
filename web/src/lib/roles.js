// Nombres de rol legibles por cargo. Un rol nuevo creado desde el panel que no esté
// aquí cae al formato "snake_case" -> "Title Case" como respaldo razonable.
const ROL_LABELS = {
  admin: "Administrador",
  supervisora_facturacion: "Supervisora de Facturación",
  supervisora_admin: "Supervisora / Administradora",
  facturador: "Facturador",
  higea_soporte: "Soporte Técnico (SYS HIGEA)",
};

export function nombreLegible(nombre) {
  if (!nombre) return "";
  return ROL_LABELS[nombre] || nombre.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
