// Filtros de bandeja por rol. Reflejan el flujo documentado en docs/mesa-higea-handoff.md.
// Solo cambian qué se muestra; el backend decide qué tickets puede ver cada rol.
// "Requiere tu acción" va primero en los tres roles: es la pregunta real que alguien
// se hace al abrir la bandeja, no "¿qué estado tiene esto?".
// Algunos filtros (el de "Requiere tu acción" de SYS HIGEA) necesitan saber
// quién está mirando la bandeja, no solo el estado del ticket — por eso esto
// es una función en vez de un objeto estático.
// Resuelve el rol "base" cuyo set de filtros aplica. Roles combinados (ej.
// supervisora_admin) se detectan por substring, igual que ya hace
// necesitaAccion — si no se hiciera así, un rol combinado caía en el set por
// defecto (pensado para facturador) y mostraba "Requiere tu acción" siempre
// en cero aunque sí tuviera tickets pendientes de aprobar.
function rolBase(rol) {
  if (rol?.includes("supervisora")) return "supervisora_facturacion";
  if (rol === "higea_soporte" || rol === "facturador" || rol === "admin") return rol;
  return null;
}

export function filtrosPorRol(rol, userId) {
  const base = rolBase(rol);
  return (
    {
      supervisora_facturacion: [
        ["accion", "Requiere tu acción", (t) => necesitaAccion(t, "supervisora_facturacion", userId)],
        ["vencidos", "Vencidos", (t) => t.vencido],
        ["higea", "En SYS HIGEA", (t) => ["aprobado", "en_proceso", "requiere_info"].includes(t.estado)],
        ["devueltos", "Devueltos", (t) => t.estado === "devuelto"],
        ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
        ["todos", "Todos", () => true],
      ],
      facturador: [
        ["accion", "Requiere tu acción", (t) => necesitaAccion(t, "facturador", userId)],
        ["pendiente", "En aprobación", (t) => t.estado === "pendiente"],
        ["higea", "Enviados a SYS HIGEA", (t) => ["aprobado", "en_proceso", "requiere_info"].includes(t.estado)],
        ["abiertos", "Abiertos", (t) => t.estado !== "cerrado"],
        ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
        ["todos", "Todos", () => true],
      ],
      higea_soporte: [
        ["accion", "Requiere tu acción", (t) => necesitaAccion(t, "higea_soporte", userId)],
        ["vencidos", "Vencidos", (t) => t.vencido],
        ["en_proceso", "En gestión", (t) => t.estado === "en_proceso"],
        ["requiere_info", "Esperando al hospital", (t) => t.estado === "requiere_info"],
        ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
        ["todos", "Todos", () => true],
      ],
      admin: [["todos", "Todos", () => true]],
    }[base] || FILTROS_POR_ROL_DEFAULT
  );
}
const FILTROS_POR_ROL_DEFAULT = [
  ["accion", "Requiere tu acción", (t) => necesitaAccion(t, "facturador")],
  ["pendiente", "En aprobación", (t) => t.estado === "pendiente"],
  ["abiertos", "Abiertos", (t) => t.estado !== "cerrado"],
  ["cerrados", "Cerrados", (t) => t.estado === "cerrado"],
  ["todos", "Todos", () => true],
];

export const FILTRO_DEFAULT = {
  supervisora_facturacion: "accion",
  facturador: "accion",
  higea_soporte: "accion",
  admin: "todos",
};

// "Esperando a quién" por estado — mismo texto para cualquier rol que mire el ticket.
export const ESPERANDO = {
  pendiente: "Esperando aprobación",
  devuelto: "Esperando corrección de Facturación",
  aprobado: "Esperando que SYS HIGEA tome el caso",
  en_proceso: "En gestión de SYS HIGEA",
  requiere_info: "Esperando respuesta de Facturación",
  cerrado: "Cerrado",
};

// Un rol "necesita actuar" sobre un ticket si el estado actual es el que a ese
// rol le toca mover. Los roles combinados (ej. supervisora_admin) heredan el
// comportamiento del rol base cuyo nombre contienen.
export function necesitaAccion(ticket, rol, userId) {
  const esSupervisora = rol?.includes("supervisora");
  const esHigea = rol === "higea_soporte";
  const esFacturador = rol === "facturador";
  return (
    (esSupervisora && ticket.estado === "pendiente") ||
    (esHigea && ticket.estado === "aprobado") ||
    (esHigea && ticket.estado === "en_proceso" && userId && ticket.asignado_a === userId) ||
    (esFacturador && ["devuelto", "requiere_info"].includes(ticket.estado))
  );
}

// Texto de SLA accionable para la bandeja y el detalle: nunca solo un color.
export function textoSla(ticket) {
  if (!ticket.dueAt) return null;
  const fecha = new Date(ticket.dueAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  if (ticket.vencido) return { texto: `Vencido desde el ${fecha}`, urgente: true };
  const horas = (new Date(ticket.dueAt) - Date.now()) / 36e5;
  if (horas <= 24) return { texto: `Vence hoy, ${fecha}`, urgente: true };
  return { texto: `Vence el ${fecha}`, urgente: false };
}
