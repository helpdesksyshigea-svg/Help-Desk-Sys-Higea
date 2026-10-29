// Elevación principal por color de superficie; una sombra casi imperceptible
// (1px, muy baja opacidad) le da peso físico a las tarjetas sin volverse decorativa.
export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[0_1px_2px_rgba(17,17,13,0.04)] ${className}`}
      {...props}
    />
  );
}
