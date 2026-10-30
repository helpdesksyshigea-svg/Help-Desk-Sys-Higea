import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetchBlob } from "../lib/api";
import { Button } from "./Button";
import { IconClose } from "./icons";

/**
 * Modal de confirmación de firma, compartido entre "Radicar ticket" y
 * "Aprobar y enviar a SYS HIGEA" (beta). La firma nunca se estampa sola: el
 * botón "Firmar y continuar" es el único punto donde se confirma, y queda un
 * evento propio en el historial del ticket — esto se decidió explícitamente
 * con el usuario, no es un detalle incidental.
 *
 * `cargarPreview` es una función async que devuelve un Blob de PDF (vista
 * previa al radicar, o el oficio ya generado al aprobar).
 */
export function ModalFirmarOficio({ titulo, cargarPreview, onConfirmar, onCancelar, confirmando }) {
  const { perfil } = useAuth();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const faltaFirma = !perfil?.tieneFirma;

  useEffect(() => {
    if (faltaFirma) {
      setCargando(false);
      return;
    }
    let cancelado = false;
    cargarPreview()
      .then((blob) => {
        if (cancelado) return;
        setUrl(URL.createObjectURL(blob));
      })
      .catch((e) => !cancelado && setError(e.message))
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltaFirma]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onCancelar}>
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-2.5">
          <p className="text-sm font-medium">{titulo}</p>
          <button onClick={onCancelar} aria-label="Cerrar" className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-ink)]/[0.06] hover:text-[var(--color-ink)]">
            <IconClose size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-[var(--color-ink)]/[0.03] p-2" style={{ minHeight: 320 }}>
          {faltaFirma && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-medium">Todavía no has registrado tu firma.</p>
              <p className="max-w-sm text-sm text-[var(--color-muted)]">
                Para confirmar tu firma en este oficio primero debes cargar tu nombre, identificación, cargo y una imagen de tu firma en "Mi firma".
              </p>
              <Link to="/mi-firma" className="text-sm font-medium underline">
                Ir a Mi firma
              </Link>
            </div>
          )}
          {!faltaFirma && cargando && <p className="p-8 text-center text-sm text-[var(--color-muted)]">Generando vista previa…</p>}
          {!faltaFirma && error && <p className="p-8 text-center text-sm text-[#b3362a]">{error}</p>}
          {!faltaFirma && !cargando && !error && url && (
            <iframe src={url} title="Vista previa del oficio" className="h-[70vh] w-full rounded" />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
          <Button variant="ghost" onClick={onCancelar} disabled={confirmando}>
            Cancelar
          </Button>
          {!faltaFirma && (
            <Button variant="accent" onClick={onConfirmar} disabled={cargando || !!error || confirmando}>
              {confirmando ? "Firmando…" : "Firmar y continuar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Helper compartido: pide el PDF de vista previa al radicar (ticket aún no existe). */
export function previewOficioAlRadicar(payload) {
  return apiFetchBlob("/tickets/preview-oficio", { method: "POST", body: JSON.stringify(payload) });
}

/** Helper compartido: pide el PDF ya generado de un ticket existente. */
export function oficioGeneradoDe(ticketId) {
  return apiFetchBlob(`/tickets/${ticketId}/oficio-generado.pdf`);
}
