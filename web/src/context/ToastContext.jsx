import { createContext, useCallback, useContext, useState } from "react";
import { IconCheck, IconAlert } from "../components/icons";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const mostrar = useCallback((mensaje, tipo = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ exito: (m) => mostrar(m, "ok"), fallo: (m) => mostrar(m, "error") }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 grid gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-center gap-2 rounded-[var(--radius-button)] border px-4 py-2.5 text-sm font-medium shadow-[0_4px_12px_rgba(17,17,13,0.12)] ${
              t.tipo === "ok"
                ? "border-[var(--color-state-cerrado)]/30 bg-[var(--color-state-cerrado-bg)] text-[var(--color-state-cerrado)]"
                : "border-[#b3362a]/30 bg-[#f8e0dc] text-[#b3362a]"
            }`}
          >
            {t.tipo === "ok" ? <IconCheck size={16} /> : <IconAlert size={16} />}
            {t.mensaje}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
