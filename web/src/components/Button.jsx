const VARIANTS = {
  // Único uso del lima: la acción principal de la pantalla. Nunca dos botones
  // "accent" visibles a la vez (regla del doc de estilo: el acento vale por aislamiento).
  accent: "bg-[var(--color-accent)] text-[var(--color-accent-ink)] border-[var(--color-accent)] hover:brightness-[0.97]",
  ghost: "bg-transparent text-[var(--color-ink)] border-[var(--color-ink)]/20 hover:border-[var(--color-ink)]/40 hover:bg-[var(--color-ink)]/[0.03]",
  danger: "bg-transparent text-[#b3362a] border-[#b3362a]/30 hover:bg-[#f8e0dc]",
};

export function Button({ variant = "ghost", className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-[var(--radius-button)] border px-4 py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
