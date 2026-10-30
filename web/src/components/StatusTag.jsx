const ESTADOS = {
  pendiente: "Pendiente de aprobación",
  devuelto: "Devuelto al facturador",
  aprobado: "Enviado a SYS HIGEA",
  en_proceso: "En gestión SYS HIGEA",
  requiere_info: "SYS HIGEA requiere información",
  cerrado: "Realizado y cerrado",
};

export function StatusTag({ estado }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--radius-tag)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        color: `var(--color-state-${estado})`,
        backgroundColor: `var(--color-state-${estado}-bg)`,
      }}
    >
      {ESTADOS[estado] || estado}
    </span>
  );
}
