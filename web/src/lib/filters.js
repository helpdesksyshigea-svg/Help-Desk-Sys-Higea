// Filtros de bandeja por rol. Reflejan el flujo documentado en docs/mesa-higea-handoff.md.
// Solo cambian qué se muestra; el backend decide qué tickets puede ver cada rol.
export const FILTROS_POR_ROL = {
  supervisora_facturacion: [
    ["por_aprobar", "Por aprobar", (t) => t.estado === "pendiente"],
    ["higea", "En HIGEA", (t) => ["aprobado", "en_proceso", "requiere_info"].includes(t.estado)],
    ["vencidos", "Vencidos", (t) => t.vencido],
    ["devueltos", "Devueltos", (t) => t.estado === "devuelto"],
    ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
    ["todos", "Todos", () => true],
  ],
  facturador: [
    ["abiertos", "Abiertos", (t) => t.estado !== "cerrado"],
    ["accion", "Requieren mi acción", (t) => ["devuelto", "requiere_info"].includes(t.estado)],
    ["pendiente", "En aprobación", (t) => t.estado === "pendiente"],
    ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
    ["todos", "Todos", () => true],
  ],
  higea_soporte: [
    ["por_atender", "Por atender", (t) => t.estado === "aprobado"],
    ["en_proceso", "En gestión", (t) => t.estado === "en_proceso"],
    ["vencidos", "Vencidos", (t) => t.vencido],
    ["requiere_info", "Esperando al hospital", (t) => t.estado === "requiere_info"],
    ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
    ["todos", "Todos", () => true],
  ],
  admin: [["todos", "Todos", () => true]],
};

export const FILTRO_DEFAULT = {
  supervisora_facturacion: "por_aprobar",
  facturador: "abiertos",
  higea_soporte: "por_atender",
  admin: "todos",
};

// "Esperando a quién" por estado — mismo texto para cualquier rol que mire el ticket.
export const ESPERANDO = {
  pendiente: "Esperando aprobación",
  devuelto: "Esperando corrección de Facturación",
  aprobado: "Esperando que HIGEA tome el caso",
  en_proceso: "En gestión de HIGEA",
  requiere_info: "Esperando respuesta de Facturación",
  cerrado: "Cerrado",
};

// Un rol "necesita actuar" sobre un ticket si el estado actual es el que a ese
// rol le toca mover. Los roles combinados (ej. supervisora_admin) heredan el
// comportamiento del rol base cuyo nombre contienen.
export function necesitaAccion(ticket, rol) {
  const esSupervisora = rol?.includes("supervisora");
  const esHigea = rol === "higea_soporte";
  const esFacturador = rol === "facturador";
  return (
    (esSupervisora && ticket.estado === "pendiente") ||
    (esHigea && ticket.estado === "aprobado") ||
    (esFacturador && ["devuelto", "requiere_info"].includes(ticket.estado))
  );
}
