// Estándar único de fechas para todo el sistema: DD/MM/AAAA (sin hora) y
// DD/MM/AAAA, HH:mm (con hora) — el formato habitual en facturación/historias
// clínicas en Colombia. Evita que cada pantalla invente su propio formato.
const pad = (n) => String(n).padStart(2, "0");

export function fechaCorta(valor) {
  if (!valor) return "—";
  // "AAAA-MM-DD" (campo de solo fecha, sin hora, ej. ticket_items.fecha) se
  // parsea a mano: new Date("2026-10-01") lo interpreta como medianoche UTC,
  // que en Colombia (UTC-5) cae en el día anterior.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function fechaHora(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fechaCorta(valor)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
