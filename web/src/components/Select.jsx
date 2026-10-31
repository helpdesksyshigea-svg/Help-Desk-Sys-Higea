import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "./icons";

function normalizarOpciones(options) {
  return (options || []).map((o) =>
    typeof o === "string" || typeof o === "number" ? { value: o, label: String(o) } : o
  );
}

/**
 * Select de un solo valor, estilizado a mano (sin librería de UI) para reemplazar
 * el <select> nativo en toda la app. Controlado: value/onChange(newValue) —
 * a diferencia del <select> nativo, onChange recibe el valor directamente, no un evento.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder = "Seleccionar…",
  required = false,
  label,
  disabled = false,
  className = "",
  name,
}) {
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(-1);
  const raizRef = useRef(null);
  const listaRef = useRef(null);

  const opciones = normalizarOpciones(options);
  const seleccionada = opciones.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function alClicFuera(e) {
      if (raizRef.current && !raizRef.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const idx = opciones.findIndex((o) => String(o.value) === String(value));
    setResaltado(idx >= 0 ? idx : 0);
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!abierto || resaltado < 0 || !listaRef.current) return;
    const el = listaRef.current.children[resaltado];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [abierto, resaltado]);

  function elegir(opcion) {
    onChange?.(opcion.value);
    setAbierto(false);
  }

  function alTeclado(e) {
    if (disabled) return;
    if (!abierto) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setAbierto(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((r) => Math.min(r + 1, opciones.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((r) => Math.max(r - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (opciones[resaltado]) elegir(opciones[resaltado]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAbierto(false);
    } else if (e.key === "Tab") {
      setAbierto(false);
    }
  }

  const campo = (
    <div ref={raizRef} className={`relative ${className}`}>
      <button
        type="button"
        name={name}
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        onKeyDown={alTeclado}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius-input)] border bg-[var(--color-ink)]/5 px-3 py-2 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          abierto ? "border-b-2 border-[var(--color-accent)]" : "border-[var(--color-ink)]/20"
        }`}
      >
        <span className={seleccionada ? "" : "text-[var(--color-muted)]"}>
          {seleccionada ? seleccionada.label : placeholder}
        </span>
        <IconChevronDown size={14} className="shrink-0 text-[var(--color-muted)]" />
      </button>
      {abierto && (
        <ul
          ref={listaRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-lg"
        >
          {opciones.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={String(o.value) === String(value)}
              onMouseEnter={() => setResaltado(i)}
              onClick={() => elegir(o)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === resaltado ? "bg-[var(--color-surface-hover)]" : ""
              }`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (!label) return campo;

  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {campo}
    </label>
  );
}
