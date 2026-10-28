import { useState } from "react";
import { Card } from "./Card";
import { Button } from "./Button";

export const TIPOS = {
  lab: "Eliminación de laboratorio (código y resultado)",
  factura: "Eliminación completa de factura",
  hc: "Eliminación o anulación de historia clínica",
  otro: "Otro ajuste en el sistema",
};
export const MOTIVOS = {
  arl_vencida: "Autorización ARL/EPS vencida",
  doble: "Doble facturación",
  no_corresponde: "Servicio no corresponde a lo prestado",
  registro: "Error de registro o paciente equivocado",
  hc_error: "Historia clínica abierta por error",
  otro: "Otro motivo",
};
export const PRIORIDADES = { alta: "Alta (1 día hábil)", normal: "Normal (2 días hábiles)", baja: "Baja (5 días hábiles)" };

const ITEM_VACIO = { factura: "", paciente: "", documento: "", cups: "", descripcion: "", fecha: "", motivo: "" };

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]";

/**
 * Formulario compartido para radicar (modo="crear") y corregir (modo="editar") un ticket.
 * El oficio firmado es obligatorio al crear; al editar es opcional (se puede reemplazar o dejar el que ya está).
 */
export function TicketForm({ modo, inicial, onSubmit, submitLabel }) {
  const [tipo, setTipo] = useState(inicial?.tipo || "lab");
  const [prioridad, setPrioridad] = useState(inicial?.prioridad || "normal");
  const [firmante, setFirmante] = useState(inicial?.firmante || "");
  const [observacion, setObservacion] = useState(inicial?.observacion || "");
  const [items, setItems] = useState(
    inicial?.items?.length ? inicial.items.map(({ id, ticket_id, ...rest }) => rest) : [{ ...ITEM_VACIO }]
  );
  const [oficio, setOficio] = useState(null);
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

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
      <Card className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Tipo de solicitud</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
            {Object.entries(TIPOS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
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
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Registros a eliminar
        </h3>
        {items.map((item, i) => (
          <Card key={i} className="grid gap-3 sm:grid-cols-3">
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
                {Object.entries(MOTIVOS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
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
          + Agregar otro registro
        </Button>
      </div>

      <Card className="grid gap-2">
        <span className="text-sm font-medium">
          Oficio firmado {modo === "crear" ? <span className="text-[var(--color-ink)]/60">(obligatorio)</span> : "(opcional: reemplaza el actual)"}
        </span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => setOficio(e.target.files[0] || null)}
          className="text-xs"
        />
      </Card>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}

      <div>
        <Button type="submit" variant="accent" disabled={enviando}>
          {enviando ? "Enviando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
