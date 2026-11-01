// Tipos de solicitud que nunca llegan a SYS HIGEA: la gestión la resuelve
// directamente Facturación del hospital (la supervisora que aprueba cierra
// el caso ella misma). Compartido entre tickets.js (flujo de transición,
// oficio dirigido a Facturación) y correo.js (a quién notificar).
export const TIPOS_SIN_SYS_HIGEA = new Set(["elim_fact_amb"]);
