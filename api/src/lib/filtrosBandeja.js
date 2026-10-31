// Espejo en el backend de web/src/lib/filters.js — mismas claves, mismo
// criterio por rol. Existe por separado (no se puede compartir un módulo
// entre api/ y web/, son dos proyectos Node distintos) para que GET
// /tickets/conteos pueda calcular los contadores de la bandeja sin traer
// a cada usuario el listado completo y enriquecido de tickets solo para
// contar — eso es justo lo que hacía colapsar la app con volumen alto. Si
// cambias un filtro en uno de los dos archivos, cámbialo en el otro.
export function rolBaseBandeja(rol) {
  if (rol?.includes("supervisora")) return "supervisora_facturacion";
  if (rol === "coordinador_medico") return "coordinador_medico";
  if (rol === "medico") return "facturador";
  if (rol === "higea_soporte" || rol === "facturador" || rol === "admin") return rol;
  return "facturador";
}

// t.vencido se asume ya calculado de antemano (ver dashboard-style precálculo
// con calcularSla) — estos predicados son síncronos a propósito, para poder
// contarlos en una sola pasada sobre el array de tickets ya cargado.
export function necesitaAccionBandeja(ticket, rol, userId) {
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

const ESTADOS_HIGEA = ["aprobado", "en_proceso", "requiere_info"];

export function predicadosBandeja(rol, userId) {
  const base = rolBaseBandeja(rol);
  const accion = (t) => necesitaAccionBandeja(t, rol, userId);
  const MAPA = {
    supervisora_facturacion: {
      accion,
      vencidos: (t) => Boolean(t.vencido),
      higea: (t) => ESTADOS_HIGEA.includes(t.estado),
      devueltos: (t) => t.estado === "devuelto",
      cerrados: (t) => t.estado === "cerrado",
      todos: () => true,
    },
    facturador: {
      accion,
      pendiente: (t) => t.estado === "pendiente",
      higea: (t) => ESTADOS_HIGEA.includes(t.estado),
      abiertos: (t) => t.estado !== "cerrado",
      cerrados: (t) => t.estado === "cerrado",
      todos: () => true,
    },
    higea_soporte: {
      accion,
      vencidos: (t) => Boolean(t.vencido),
      en_proceso: (t) => t.estado === "en_proceso",
      requiere_info: (t) => t.estado === "requiere_info",
      cerrados: (t) => t.estado === "cerrado",
      todos: () => true,
    },
    coordinador_medico: {
      accion,
      facturacion: (t) => t.estado === "pendiente" && !t.etapa_aprobacion,
      higea: (t) => ESTADOS_HIGEA.includes(t.estado),
      devueltos: (t) => t.estado === "devuelto",
      cerrados: (t) => t.estado === "cerrado",
      todos: () => true,
    },
    admin: { todos: () => true },
  };
  return MAPA[base] || MAPA.facturador;
}
