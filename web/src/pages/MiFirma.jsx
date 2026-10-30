import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { useToast } from "../context/ToastContext";
import { IconUpload } from "../components/icons";

export function MiFirma() {
  const [identificacion, setIdentificacion] = useState("");
  const [cargo, setCargo] = useState("");
  const [firmaUrl, setFirmaUrl] = useState(null);
  const [firmaNueva, setFirmaNueva] = useState(null);
  const [previewNueva, setPreviewNueva] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const inputFirma = useRef(null);
  const { exito, fallo } = useToast();

  useEffect(() => {
    apiFetch("/perfil")
      .then((data) => {
        setIdentificacion(data.identificacion || "");
        setCargo(data.cargo || "");
        setFirmaUrl(data.firmaUrl || null);
      })
      .catch((e) => fallo(e.message))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegirFirma(archivo) {
    if (!archivo) return;
    setFirmaNueva(archivo);
    setPreviewNueva(URL.createObjectURL(archivo));
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    try {
      const form = new FormData();
      form.append("identificacion", identificacion);
      form.append("cargo", cargo);
      if (firmaNueva) form.append("firma", firmaNueva);
      await apiFetch("/perfil", { method: "PATCH", body: form });
      exito("Datos guardados");
      if (firmaNueva) {
        const actualizado = await apiFetch("/perfil");
        setFirmaUrl(actualizado.firmaUrl || null);
        setFirmaNueva(null);
        setPreviewNueva(null);
      }
    } catch (e) {
      fallo(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-[var(--color-muted)]">Cargando…</p>;

  return (
    <div className="grid max-w-xl gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Mi firma</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Estos datos y esta imagen son los que se estampan en el oficio generado cuando confirmas tu firma al radicar o aprobar un ticket.
        </p>
      </div>
      <form onSubmit={guardar} className="grid gap-4">
        <Card className="grid gap-4">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Identificación</span>
            <input
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]"
              placeholder="Número de cédula"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Cargo</span>
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]"
              placeholder="Ej. Facturadora, Supervisora de Facturación"
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium">Firma escaneada</span>
            <input
              ref={inputFirma}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => elegirFirma(e.target.files[0] || null)}
              className="hidden"
            />
            {previewNueva || firmaUrl ? (
              <div className="flex items-center gap-4 rounded-[var(--radius-input)] border border-[var(--color-border)] p-3">
                <img src={previewNueva || firmaUrl} alt="Firma" className="h-16 max-w-[220px] object-contain" />
                <Button type="button" variant="ghost" onClick={() => inputFirma.current?.click()}>
                  Cambiar firma
                </Button>
              </div>
            ) : (
              <div
                onClick={() => inputFirma.current?.click()}
                role="button"
                tabIndex={0}
                className="grid cursor-pointer place-items-center gap-2 rounded-[var(--radius-input)] border-2 border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center transition-colors hover:border-[var(--color-ink)]/40"
              >
                <IconUpload size={22} className="text-[var(--color-muted)]" />
                <p className="text-sm font-medium">Sube una imagen de tu firma</p>
                <p className="text-xs text-[var(--color-muted)]">PNG, JPEG o WebP, idealmente con fondo transparente</p>
              </div>
            )}
          </div>
        </Card>
        <Button type="submit" variant="accent" className="justify-self-start" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </div>
  );
}
