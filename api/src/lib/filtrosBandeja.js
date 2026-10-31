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

// Traduce el mismo criterio de filtro a SQL (para GET /tickets y /tickets/
// conteos): la base de datos filtra y cuenta por su cuenta en vez de traer
// filas a Node para filtrarlas en memoria — lo único que no se puede
// expresar en SQL es "vencidos" (no es una columna, se calcula), así que
// devuelve el sentinela "VENCIDOS" y el llamador lo maneja aparte sobre el
// subconjunto acotado de tickets "abiertos ahora".
export const VENCIDOS_SENTINEL = "VENCIDOS";
const ESTADOS_HIGEA_SQL = ["aprobado", "en_proceso", "requiere_info"];

export function aplicarFiltroSQL(query, filtro, rol, userId) {
  const base = rolBaseBandeja(rol);
  if (!filtro || filtro === "todos") return query;
  if (filtro === "vencidos") return VENCIDOS_SENTINEL;
  if (filtro === "accion") {
    if (base === "supervisora_facturacion") return query.eq("estado", "pendiente").is("etapa_aprobacion", null);
    if (base === "coordinador_medico") return query.eq("estado", "pendiente").eq("etapa_aprobacion", "coordinador_medico");
    if (base === "higea_soporte") return query.or(`estado.eq.aprobado,and(estado.eq.en_proceso,asignado_a.eq.${userId})`);
    return query.in("estado", ["devuelto", "requiere_info"]); // facturador / médico
  }
  if (filtro === "pendiente") return query.eq("estado", "pendiente");
  if (filtro === "higea") return query.in("estado", ESTADOS_HIGEA_SQL);
  if (filtro === "devueltos") return query.eq("estado", "devuelto");
  if (filtro === "cerrados") return query.eq("estado", "cerrado");
  if (filtro === "abiertos") return query.neq("estado", "cerrado");
  if (filtro === "en_proceso") return query.eq("estado", "en_proceso");
  if (filtro === "requiere_info") return query.eq("estado", "requiere_info");
  if (filtro === "facturacion") return query.eq("estado", "pendiente").is("etapa_aprobacion", null);
  return query; // filtro desconocido: no filtra nada, nunca rompe la bandeja
}

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
