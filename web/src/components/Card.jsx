// Elevación solo por color de superficie, nunca por sombra (regla explícita del
// doc de estilo: "Never add box-shadow to cards" — el contraste entre
// --color-surface y --color-canvas es lo que separa la tarjeta del fondo).
export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 ${className}`}
      {...props}
    />
  );
}
