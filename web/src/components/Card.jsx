// Elevación por color de superficie, nunca por sombra (regla del doc de estilo).
export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 ${className}`}
      {...props}
    />
  );
}
