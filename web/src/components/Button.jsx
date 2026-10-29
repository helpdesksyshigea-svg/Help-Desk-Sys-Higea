const VARIANTS = {
  // Único uso del lima: la acción principal de la pantalla. Nunca dos botones
  // "accent" visibles a la vez (regla del doc de estilo: el acento vale por aislamiento).
  accent: "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border-[var(--color-accent)] hover:brightness-[0.95]",
  ghost: "bg-transparent text-[var(--color-ink)] border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.03]",
  danger: "bg-transparent text-[var(--color-danger)] border-[var(--color-danger)]/30 hover:bg-[var(--color-danger-bg)]",
};

export function Button({ variant = "ghost", className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-[var(--radius-button)] border px-4 py-2 text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      style={{ fontWeight: 510 }}
      {...props}
    />
  );
}
