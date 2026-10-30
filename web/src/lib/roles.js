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
  if (ROL_LABELS[nombre]) return ROL_LABELS[nombre];
  // \b\w no reconoce letras acentuadas como parte de una palabra (ej. en
  // "Médico", la "é" rompe el límite de palabra ahí mismo), así que termina
  // poniendo mayúscula también en la "d" de "dico" ("MéDico"). Capitalizar
  // por palabra completa (separada por espacio/guión bajo) evita el problema.
  return nombre
    .replace(/_/g, " ")
    .split(" ")
    .map((palabra) => (palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1) : palabra))
    .join(" ");
}
