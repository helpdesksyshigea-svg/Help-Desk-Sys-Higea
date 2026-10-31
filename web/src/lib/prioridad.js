// Colores de prioridad de ticket (alta/normal/baja). Se mantienen como constante
// JS propia y no como token de index.css porque es una escala semántica distinta
// a los --color-state-*/--color-sem-* (esos hablan de estado/urgencia de SLA,
// esta de prioridad declarada en el ticket) — forzarla a reusar esos tokens
// mezclaría dos conceptos que hoy son independientes.
export const PRIORIDAD_COLOR = { alta: "#e02424", normal: "#f59e0b", baja: "#16a34a" };
