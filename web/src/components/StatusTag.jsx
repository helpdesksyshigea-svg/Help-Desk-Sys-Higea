const ESTADOS = {
  pendiente: "Pendiente de aprobación",
  devuelto: "Devuelto al facturador",
  aprobado: "Enviado a HIGEA",
  en_proceso: "En gestión HIGEA",
  requiere_info: "HIGEA requiere información",
  cerrado: "Realizado y cerrado",
};

export function StatusTag({ estado }) {
  return (
    <span
      className="inline-flex items-center rounded-[var(--radius-tag)] px-2 py-0.5 text-xs font-semibold"
      style={{
        color: `var(--color-state-${estado})`,
        backgroundColor: `var(--color-state-${estado}-bg)`,
      }}
    >
      {ESTADOS[estado] || estado}
    </span>
  );
}
