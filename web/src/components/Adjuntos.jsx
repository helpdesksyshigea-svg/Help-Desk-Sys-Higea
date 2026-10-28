import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL;
const ETIQUETAS_KIND = { oficio: "Oficio firmado", soporte: "Soporte", evidencia: "Evidencia HIGEA" };

export function Adjuntos({ ticketId, kindsPermitidos = ["oficio", "soporte", "evidencia"] }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);

  async function cargar() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAdjuntos(await res.json());
  }

  useEffect(() => {
    cargar();
  }, [ticketId]);

  async function subir(e) {
    const archivo = e.target.files[0];
    const kind = e.target.dataset.kind;
    if (!archivo) return;
    setSubiendo(true);
    setError(null);

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const form = new FormData();
    form.append("archivo", archivo);
    form.append("kind", kind);

    const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo subir el archivo");
    } else {
      await cargar();
    }
    setSubiendo(false);
    e.target.value = "";
  }

  async function abrir(adjuntoId) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos/${adjuntoId}/url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
        Documentos
      </h3>

      {adjuntos.length === 0 && (
        <p className="text-sm text-[var(--color-muted)]">Sin documentos adjuntos.</p>
      )}

      <ul className="grid gap-2">
        {adjuntos.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2"
          >
            <div>
              <button
                onClick={() => abrir(a.id)}
                className="text-sm font-medium text-[var(--color-ink)] underline-offset-2 hover:underline"
              >
                {a.nombre_original}
              </button>
              <div className="text-xs text-[var(--color-muted)]">
                {ETIQUETAS_KIND[a.kind] || a.kind} · {(a.tamano_bytes / 1024).toFixed(0)} KB
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        {kindsPermitidos.map((kind) => (
          <label key={kind} className="text-sm font-medium text-[var(--color-ink)]">
            <span className="mb-1 block text-xs text-[var(--color-muted)]">
              Adjuntar {ETIQUETAS_KIND[kind]}
            </span>
            <input
              type="file"
              data-kind={kind}
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={subiendo}
              onChange={subir}
              className="text-xs"
            />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}
    </div>
  );
}
