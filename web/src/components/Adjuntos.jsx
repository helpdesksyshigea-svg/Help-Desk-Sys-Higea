import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { IconDownload, IconEye, IconClose } from "./icons";
import { fechaCorta } from "../lib/fecha";

const API_URL = import.meta.env.VITE_API_URL;
const ETIQUETAS_KIND = { oficio: "Oficio firmado", soporte: "Soporte", evidencia: "Evidencia SYS HIGEA" };

function kb(bytes) {
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
}

export function Adjuntos({ ticketId, kindsPermitidos = ["oficio", "soporte", "evidencia"] }) {
  const [adjuntos, setAdjuntos] = useState([]);
  const [subiendo, setSubiendo] = useState(null); // kind que se está subiendo, o null
  const [error, setError] = useState(null);
  const [vista, setVista] = useState(null); // { nombre, tipo, url } o null
  const [cargandoVista, setCargandoVista] = useState(null); // adjuntoId que está cargando la vista previa
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const inputs = useRef({});

  async function cargar() {
    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;
    const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "No se pudieron cargar los documentos");
    }
    const data = await res.json();
    setAdjuntos(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    cargar().catch((e) => setError(e.message));
  }, [ticketId]);

  async function subirArchivo(archivo, kind) {
    if (!archivo) return;
    setSubiendo(kind);
    setError(null);

    try {
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
        throw new Error(body.error || "No se pudo subir el archivo");
      }
      await cargar();
    } catch (e) {
      setError(e.message || "No se pudo subir el archivo. Verifique su conexión e inténtelo de nuevo.");
    } finally {
      setSubiendo(null);
    }
  }

  function subir(e) {
    const archivo = e.target.files[0];
    const kind = e.target.dataset.kind;
    subirArchivo(archivo, kind).finally(() => {
      e.target.value = "";
    });
  }

  function pegar(e) {
    const imagen = [...(e.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
    if (!imagen || subiendo) return;
    e.preventDefault();
    const kindPegado = kindsPermitidos.includes("evidencia") ? "evidencia" : kindsPermitidos[0];
    if (!kindPegado) return;
    const archivo = imagen.getAsFile();
    subirArchivo(archivo, kindPegado);
  }

  async function obtenerUrl(adjuntoId) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos/${adjuntoId}/url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "No se pudo abrir el documento");
    }
    const body = await res.json();
    if (!body.url) throw new Error("No se pudo abrir el documento");
    return body.url;
  }

  async function descargar(adjuntoId) {
    try {
      window.open(await obtenerUrl(adjuntoId), "_blank", "noopener");
    } catch (e) {
      setError(e.message || "No se pudo abrir el documento. Verifique su conexión e inténtelo de nuevo.");
    }
  }

  async function previsualizar(adjunto) {
    setCargandoVista(adjunto.id);
    setError(null);
    try {
      const url = await obtenerUrl(adjunto.id);
      setVista({ nombre: adjunto.nombre_original, tipo: adjunto.tipo_mime, url });
    } catch (e) {
      setError(e.message || "No se pudo abrir la vista previa. Verifique su conexión e inténtelo de nuevo.");
    } finally {
      setCargandoVista(null);
    }
  }

  function empezarRenombrar(adjunto) {
    setEditandoId(adjunto.id);
    setNombreEditado(adjunto.nombre_original);
  }

  async function confirmarRenombrar(adjuntoId) {
    const nombre = nombreEditado.trim();
    setEditandoId(null);
    if (!nombre) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${API_URL}/tickets/${ticketId}/adjuntos/${adjuntoId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ nombre_original: nombre }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo renombrar el archivo");
      }
      await cargar();
    } catch (e) {
      setError(e.message || "No se pudo renombrar el archivo. Verifique su conexión e inténtelo de nuevo.");
    }
  }

  return (
    <div className="grid gap-3 rounded-[var(--radius-card)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]" tabIndex={0} onPaste={pegar}>
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
                  {editandoId === a.id ? (
                    <input
                      autoFocus
                      value={nombreEditado}
                      onChange={(e) => setNombreEditado(e.target.value)}
                      onBlur={() => confirmarRenombrar(a.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.target.blur();
                        if (e.key === "Escape") setEditandoId(null);
                      }}
                      className="w-full rounded border border-[var(--color-ink)]/30 bg-[var(--color-surface)] px-1.5 py-0.5 text-sm font-medium outline-none focus:border-[var(--color-ink)]"
                    />
                  ) : (
                    <button
                      onClick={() => empezarRenombrar(a)}
                      title="Clic para renombrar"
                      className="block w-full truncate text-left text-sm font-medium text-[var(--color-ink)] hover:underline"
                    >
                      {a.nombre_original}
                    </button>
                  )}
                  <div className="text-xs text-[var(--color-muted)]">
                    {ETIQUETAS_KIND[a.kind] || a.kind} · {kb(a.tamano_bytes)} · subido por {a.subido_por_usuario?.nombre || "—"}{" "}
                    el {fechaCorta(a.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => previsualizar(a)}
                  disabled={cargandoVista === a.id}
                  aria-label={`Vista previa de ${a.nombre_original}`}
                  title="Vista previa"
                  className="shrink-0 rounded p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)] disabled:opacity-50"
                >
                  <IconEye size={16} />
                </button>
                <button
                  onClick={() => descargar(a.id)}
                  aria-label={`Descargar ${a.nombre_original}`}
                  title="Descargar"
                  className="shrink-0 rounded p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
                >
                  <IconDownload size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {kindsPermitidos.includes("evidencia") && (
        <p className="text-xs text-[var(--color-muted)]">
          <strong className="font-medium text-[var(--color-ink)]">Obligatoria para cerrar:</strong> suba como "Evidencia SYS
          HIGEA" un pantallazo del sistema de SYS HIGEA mostrando la solución aplicada. Puede pegarlo directamente con
          Ctrl+V (o Cmd+V) sobre esta tarjeta, sin necesidad de guardarlo primero.
        </p>
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

      {vista && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setVista(null)}
        >
          <div
            className={`flex max-h-full w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] ${
              vista.tipo === "application/pdf" ? "max-w-6xl" : "max-w-3xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
              <p className="truncate text-sm font-medium">{vista.nombre}</p>
              <button
                onClick={() => setVista(null)}
                aria-label="Cerrar vista previa"
                className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]"
              >
                <IconClose size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-[var(--color-ink)]/[0.03] p-2">
              {vista.tipo === "application/pdf" ? (
                <iframe src={vista.url} title={vista.nombre} className="h-[90vh] w-full rounded" />
              ) : (
                <img src={vista.url} alt={vista.nombre} className="mx-auto max-h-[75vh] rounded" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
