import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card } from "./Card";
import { Button } from "./Button";
import { IconUpload, IconPlus } from "./icons";

export const PRIORIDADES = { alta: "Alta (1 día hábil)", normal: "Normal (2 días hábiles)", baja: "Baja (5 días hábiles)" };

const ITEM_VACIO = { factura: "", paciente: "", documento: "", cups: "", descripcion: "", fecha: "", motivo: "" };

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]";

/**
 * Formulario compartido para radicar (modo="crear") y corregir (modo="editar") un ticket.
 * El oficio firmado es obligatorio al crear; al editar es opcional (se puede reemplazar o dejar el que ya está).
 */
export function TicketForm({ modo, inicial, onSubmit, submitLabel }) {
  const [tipos, setTipos] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [tipo, setTipo] = useState(inicial?.tipo || "");
  const [prioridad, setPrioridad] = useState(inicial?.prioridad || "normal");
  const [firmante, setFirmante] = useState(inicial?.firmante || "");
  const [observacion, setObservacion] = useState(inicial?.observacion || "");
  const [items, setItems] = useState(
    inicial?.items?.length ? inicial.items.map(({ id, ticket_id, ...rest }) => rest) : [{ ...ITEM_VACIO }]
  );
  const [oficio, setOficio] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const oficioInput = useRef(null);

  function kb(bytes) {
    return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  useEffect(() => {
    apiFetch("/catalogos/tipos").then((data) => {
      setTipos(data);
      if (!inicial?.tipo && data[0]) setTipo(data[0].clave);
    });
    apiFetch("/catalogos/motivos").then(setMotivos);
  }, []);

  function actualizarItem(i, campo, valor) {
    setItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, [campo]: valor } : item)));
  }
  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_VACIO }]);
  }
  function quitarItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    if (!firmante.trim()) {
      setError("Indique el nombre de quien firma el oficio");
      return;
    }
    if (items.some((item) => !item.motivo)) {
      setError("Cada registro requiere un motivo");
      return;
    }
    if (modo === "crear" && !oficio) {
      setError("Debe adjuntar el oficio firmado para radicar");
      return;
    }

    const form = new FormData();
    form.append("data", JSON.stringify({ tipo, prioridad, firmante, observacion, items }));
    if (oficio) form.append("oficio", oficio);

    setEnviando(true);
    try {
      await onSubmit(form);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="grid gap-6">
      <h3 className="-mb-3 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
        1. Datos de la solicitud
      </h3>
      <Card className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Tipo de solicitud</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
            {tipos.map((t) => (
              <option key={t.clave} value={t.clave}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm">
          <span className="mb-1 block font-medium">Prioridad</span>
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className={inputClass}>
            {Object.entries(PRIORIDADES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Solicita (nombre de quien firma el oficio)</span>
          <input value={firmante} onChange={(e) => setFirmante(e.target.value)} className={inputClass} required />
        </label>

        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">Observación general (opcional)</span>
          <textarea value={observacion} onChange={(e) => setObservacion(e.target.value)} className={inputClass} />
        </label>
      </Card>

      <div className="grid gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
            2. Registros a eliminar
          </h3>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Uno por cada factura, resultado o registro que debe corregirse.
          </p>
        </div>
        {items.map((item, i) => (
          <Card key={i} className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3 -mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-xs font-semibold text-[var(--color-ink)]">
              {i + 1}
            </div>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Factura</span>
              <input
                value={item.factura || ""}
                onChange={(e) => actualizarItem(i, "factura", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Paciente</span>
              <input
                value={item.paciente || ""}
                onChange={(e) => actualizarItem(i, "paciente", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Documento</span>
              <input
                value={item.documento || ""}
                onChange={(e) => actualizarItem(i, "documento", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">CUPS / folio (si es HC)</span>
              <input
                value={item.cups || ""}
                onChange={(e) => actualizarItem(i, "cups", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Fecha</span>
              <input
                type="date"
                value={item.fecha || ""}
                onChange={(e) => actualizarItem(i, "fecha", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Motivo</span>
              <select
                value={item.motivo || ""}
                onChange={(e) => actualizarItem(i, "motivo", e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Seleccione…</option>
                {motivos.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-3">
              <span className="mb-1 block font-medium">Descripción</span>
              <textarea
                value={item.descripcion || ""}
                onChange={(e) => actualizarItem(i, "descripcion", e.target.value)}
                className={inputClass}
              />
            </label>
            {items.length > 1 && (
              <Button type="button" variant="danger" className="justify-self-start" onClick={() => quitarItem(i)}>
                Quitar registro
              </Button>
            )}
          </Card>
        ))}
        <Button type="button" variant="ghost" className="justify-self-start" onClick={agregarItem}>
          <IconPlus size={15} />
          Agregar otro registro
        </Button>
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          3. Oficio firmado
        </h3>
        <Card className="grid gap-3">
          <p className="text-sm">
            {modo === "crear"
              ? "Adjunta el oficio con firma y VoBo. Es obligatorio: no se puede radicar la solicitud sin él."
              : "Puedes dejar el oficio que ya está adjunto, o reemplazarlo subiendo uno nuevo."}
          </p>
          <input
            ref={oficioInput}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            onChange={(e) => setOficio(e.target.files[0] || null)}
            className="hidden"
          />
          {oficio ? (
            <div className="flex items-center justify-between rounded-[var(--radius-input)] border border-[var(--color-state-cerrado)]/30 bg-[var(--color-state-cerrado-bg)] px-3 py-2 text-sm">
              <span className="truncate text-[var(--color-state-cerrado)]">
                {oficio.name} · {kb(oficio.size)}
              </span>
              <button
                type="button"
                onClick={() => {
                  setOficio(null);
                  if (oficioInput.current) oficioInput.current.value = "";
                }}
                className="shrink-0 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Quitar
              </button>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="justify-self-start" onClick={() => oficioInput.current?.click()}>
              <IconUpload size={15} />
              Seleccionar archivo (PDF o imagen)
            </Button>
          )}
        </Card>
      </div>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}

      <div>
        <Button type="submit" variant="accent" disabled={enviando}>
          {enviando ? "Enviando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
