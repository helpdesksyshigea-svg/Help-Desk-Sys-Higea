import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { IconDownload } from "./icons";

const API_URL = import.meta.env.VITE_API_URL;
const ETIQUETAS_KIND = { oficio: "Oficio firmado", soporte: "Soporte", evidencia: "Evidencia HIGEA" };

function kb(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function Adjuntos({ ticketId, kindsPermitidos = ["oficio", "soporte", "evidencia"] }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [subiendo, setSubiendo] = useState(null); // kind que se está subiendo, o null
  const [error, setError] = useState(null);
  const inputs = useRef({});

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
    setSubiendo(kind);
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
    setSubiendo(null);
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
      <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Documentos</h3>

      {adjuntos.length === 0 && <p className="text-sm text-[var(--color-muted)]">Sin documentos adjuntos.</p>}

      {adjuntos.length > 0 && (
        <ul className="grid gap-2">
          {adjuntos.map((a) => {
            const esPdf = a.tipo_mime === "application/pdf";
            return (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] px-3 py-2"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                    esPdf ? "bg-[#f8e0dc] text-[#b3362a]" : "bg-[var(--color-ink)]/10 text-[var(--color-muted)]"
                  }`}
                >
                  {esPdf ? "PDF" : "IMG"}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => abrir(a.id)}
                    className="truncate text-sm font-medium text-[var(--color-ink)] underline-offset-2 hover:underline"
                  >
                    {a.nombre_original}
                  </button>
                  <div className="text-xs text-[var(--color-muted)]">
                    {ETIQUETAS_KIND[a.kind] || a.kind} · {kb(a.tamano_bytes)} · subido por {a.subido_por_usuario?.nombre || "—"}{" "}
                    el {new Date(a.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                  </div>
                </div>
                <button
                  onClick={() => abrir(a.id)}
                  aria-label={`Descargar ${a.nombre_original}`}
                  className="shrink-0 rounded p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
                >
                  <IconDownload size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {kindsPermitidos.map((kind) => (
          <div key={kind}>
            <input
              ref={(el) => (inputs.current[kind] = el)}
              type="file"
              data-kind={kind}
              accept="application/pdf,image/png,image/jpeg,image/webp"
              disabled={!!subiendo}
              onChange={subir}
              className="hidden"
            />
            <button
              type="button"
              disabled={!!subiendo}
              onClick={() => inputs.current[kind]?.click()}
              className="inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-[var(--color-ink)]/20 px-3 py-1.5 text-sm font-medium text-[var(--color-ink)] hover:border-[var(--color-ink)]/40 disabled:opacity-50"
            >
              {subiendo === kind ? "Subiendo…" : `Adjuntar ${ETIQUETAS_KIND[kind]}`}
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}
    </div>
  );
}
