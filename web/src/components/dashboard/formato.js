// Formato de números y paleta de severidad del dashboard "Control de Gestión".
// Separado de primitivas.jsx para que ese archivo exporte solo componentes.

// ---------- formato ----------

// Mismo criterio de unidades que tenía el dashboard original (min / h / d),
// separado en valor + unidad para poder pintar la unidad más pequeña.
export function horasPartes(n) {
  if (n == null) return { valor: "—", unidad: "" };
  if (n < 1) return { valor: String(Math.round(n * 60)), unidad: "min" };
  if (n < 48) return { valor: n.toFixed(1), unidad: "h" };
  return { valor: (n / 24).toFixed(1), unidad: "d" };
}

export function horas(n) {
  const { valor, unidad } = horasPartes(n);
  return unidad ? `${valor} ${unidad}` : valor;
}

export function pct(parte, total) {
  if (!total) return 0;
  return Math.round((parte / total) * 100);
}

// ordena de mayor a menor por total — se usa de forma centralizada para que
// cualquier lista nueva de barras quede ordenada sin tener que acordarse en el backend
export function ordenarDesc(lista) {
  return [...lista].sort((a, b) => b.total - a.total);
}

export const nf = new Intl.NumberFormat("es-CO");

// ---------- severidad (color semántico + texto, nunca color solo) ----------

export const SEVERIDAD = {
  critico: {
    etiqueta: "Crítico",
    color: "var(--color-sem-critical)",
    ink: "var(--color-sem-critical-ink)",
    bg: "var(--color-sem-critical-bg)",
  },
  alerta: {
    etiqueta: "Atención",
    color: "var(--color-sem-warning)",
    ink: "var(--color-sem-warning-ink)",
    bg: "var(--color-sem-warning-bg)",
  },
  info: {
    etiqueta: "Seguimiento",
    color: "var(--color-sem-info)",
    ink: "var(--color-sem-info-ink)",
    bg: "var(--color-sem-info-bg)",
  },
  ok: {
    etiqueta: "En orden",
    color: "var(--color-brand-action)",
    ink: "var(--color-brand-action)",
    bg: "var(--color-brand-soft)",
  },
  neutro: {
    etiqueta: "Sin datos",
    color: "var(--color-chart-neutral)",
    ink: "var(--color-dash-muted)",
    bg: "var(--color-dash-track)",
  },
};

