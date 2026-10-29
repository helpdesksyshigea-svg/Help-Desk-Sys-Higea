// Elevación por borde de 1px (hairline) y color de superficie, nunca por sombra —
// regla explícita del doc Linear: "use hairline borders instead of shadows".
export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 ${className}`}
      {...props}
    />
  );
}
