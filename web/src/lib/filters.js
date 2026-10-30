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
  if (rol === "coordinador_medico") return "coordinador_medico";
  // El médico radica y responde solicitudes de información igual que un
  // facturador — mismo set de filtros de bandeja, la diferencia está en que
  // su ticket pasa primero por el coordinador médico (eso lo decide el backend
  // con etapa_aprobacion, no la bandeja).
  if (rol === "medico") return "facturador";
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
      coordinador_medico: [
        ["accion", "Requiere tu acción", (t) => necesitaAccion(t, "coordinador_medico", userId)],
        ["facturacion", "En facturación", (t) => t.estado === "pendiente" && !t.etapa_aprobacion],
        ["higea", "En SYS HIGEA", (t) => ["aprobado", "en_proceso", "requiere_info"].includes(t.estado)],
        ["devueltos", "Devueltos", (t) => t.estado === "devuelto"],
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

// "Bandeja" (el link principal, sin ?filtro= en la URL) mostraba por
// defecto "Requiere tu acción" — si ese filtro estaba en 0, la bandeja se
// veía vacía aunque la persona sí tuviera tickets bajo su gestión en otro
// estado. "Todos" es el superconjunto: siempre incluye tanto lo urgente
// como el resto de lo que le corresponde ver a cada rol, así que la
// bandeja nunca aparenta estar vacía sin estarlo de verdad. "Requiere tu
// acción" sigue existiendo como pestaña aparte, con su propio aviso.
export const FILTRO_DEFAULT = {
  supervisora_facturacion: "todos",
  coordinador_medico: "todos",
  facturador: "todos",
  higea_soporte: "todos",
  admin: "todos",
};

// "Esperando a quién" por estado — mismo texto para cualquier rol que mire el ticket.
export function esperando(ticket) {
  if (ticket.estado === "pendiente" && ticket.etapa_aprobacion === "coordinador_medico") {
    return "Esperando aprobación del coordinador médico";
  }
  return ESPERANDO[ticket.estado];
}

export const ESPERANDO = {
  pendiente: "Esperando aprobación de facturación",
  devuelto: "Esperando corrección de quien radicó",
  aprobado: "Esperando que SYS HIGEA tome el caso",
  en_proceso: "En gestión de SYS HIGEA",
  requiere_info: "Esperando respuesta de Facturación",
  cerrado: "Cerrado",
};

// Un rol "necesita actuar" sobre un ticket si el estado actual es el que a ese
// rol le toca mover. Los roles combinados (ej. supervisora_admin) heredan el
// comportamiento del rol base cuyo nombre contienen. Para "pendiente", quien
// actúa depende de etapa_aprobacion: mientras valga "coordinador_medico" le
// toca al coordinador, no a supervisora; una vez se limpia (o nunca se fijó,
// como con facturador), le toca a cualquier supervisora.
export function necesitaAccion(ticket, rol, userId) {
  const esSupervisora = rol?.includes("supervisora");
  const esCoordinador = rol === "coordinador_medico";
  const esHigea = rol === "higea_soporte";
  const esFacturador = rol === "facturador" || rol === "medico";
  return (
    (esSupervisora && ticket.estado === "pendiente" && !ticket.etapa_aprobacion) ||
    (esCoordinador && ticket.estado === "pendiente" && ticket.etapa_aprobacion === "coordinador_medico") ||
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
