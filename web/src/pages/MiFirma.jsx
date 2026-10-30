import { useEffect, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { useToast } from "../context/ToastContext";
import { IconUpload } from "../components/icons";

export function MiFirma() {
  const [identificacion, setIdentificacion] = useState("");
  const [cargo, setCargo] = useState("");
  const [firmaUrl, setFirmaUrl] = useState(null);
  const [tieneFirma, setTieneFirma] = useState(false);
  const [firmaNueva, setFirmaNueva] = useState(null);
  const [previewNueva, setPreviewNueva] = useState(null);
  const [previewVectorizada, setPreviewVectorizada] = useState(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [errorPreview, setErrorPreview] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [recortando, setRecortando] = useState(false);
  const [seleccion, setSeleccion] = useState(null); // {x, y, w, h} en px sobre la imagen MOSTRADA
  const inicioArrastre = useRef(null);
  const imgRef = useRef(null);
  const inputFirma = useRef(null);
  const { exito, fallo } = useToast();

  useEffect(() => {
    apiFetch("/perfil")
      .then((data) => {
        setIdentificacion(data.identificacion || "");
        setCargo(data.cargo || "");
        setFirmaUrl(data.firmaUrl || null);
        setTieneFirma(!!data.tieneFirma);
      })
      .catch((e) => fallo(e.message))
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function elegirFirma(archivo) {
    if (!archivo) return;
    setFirmaNueva(archivo);
    setPreviewNueva(URL.createObjectURL(archivo));
    setPreviewVectorizada(null);
    setErrorPreview(null);
    setCargandoPreview(true);
    try {
      const form = new FormData();
      form.append("firma", archivo);
      const blob = await apiFetchBlob("/perfil/preview-firma", { method: "POST", body: form });
      setPreviewVectorizada(URL.createObjectURL(blob));
    } catch (e) {
      setErrorPreview(e.message);
    } finally {
      setCargandoPreview(false);
    }
  }

  function empezarArrastre(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    inicioArrastre.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, rect };
    setSeleccion({ x: e.clientX - rect.left, y: e.clientY - rect.top, w: 0, h: 0 });
  }
  function seguirArrastre(e) {
    if (!inicioArrastre.current) return;
    const { x: x0, y: y0, rect } = inicioArrastre.current;
    const x1 = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const y1 = Math.min(Math.max(e.clientY - rect.top, 0), rect.height);
    setSeleccion({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
  }
  function terminarArrastre() {
    inicioArrastre.current = null;
  }

  // La imagen se muestra con object-contain: si su proporción no coincide
  // con la del recuadro, queda una franja vacía arriba/abajo o a los lados
  // (clientWidth/clientHeight son del RECUADRO completo, no del área donde
  // realmente se dibuja la foto) — sin esto, el recorte calculado no
  // corresponde a lo que la persona efectivamente seleccionó con el mouse.
  function areaRenderizada(img) {
    const cajaW = img.clientWidth;
    const cajaH = img.clientHeight;
    const relImg = img.naturalWidth / img.naturalHeight;
    const relCaja = cajaW / cajaH;
    if (relImg > relCaja) {
      const alto = cajaW / relImg;
      return { x: 0, y: (cajaH - alto) / 2, w: cajaW, h: alto };
    }
    const ancho = cajaH * relImg;
    return { x: (cajaW - ancho) / 2, y: 0, w: ancho, h: cajaH };
  }

  async function aplicarRecorte() {
    const img = imgRef.current;
    if (!img || !seleccion || seleccion.w < 8 || seleccion.h < 8) {
      fallo("Dibuja un recuadro sobre la parte de la firma que quieres conservar");
      return;
    }
    const area = areaRenderizada(img);
    const escala = img.naturalWidth / area.w; // == naturalHeight / area.h
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const sx = clamp((seleccion.x - area.x) * escala, img.naturalWidth);
    const sy = clamp((seleccion.y - area.y) * escala, img.naturalHeight);
    const sw = clamp(seleccion.w * escala, img.naturalWidth - sx);
    const sh = clamp(seleccion.h * escala, img.naturalHeight - sy);
    if (sw < 4 || sh < 4) {
      fallo("El recuadro cae fuera de la foto — dibújalo sobre la firma");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    setRecortando(false);
    setSeleccion(null);
    await elegirFirma(new File([blob], "firma-recortada.png", { type: "image/png" }));
  }

  async function guardar(e) {
    e.preventDefault();
    if (!identificacion.trim() || !cargo.trim()) {
      fallo("Identificación y cargo son obligatorios");
      return;
    }
    if (!tieneFirma && !firmaNueva) {
      fallo("Debes subir una imagen de tu firma");
      return;
    }
    if (errorPreview) {
      fallo("La firma que subiste no se pudo procesar — sube otra foto antes de guardar");
      return;
    }
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
        setTieneFirma(!!actualizado.tieneFirma);
        setFirmaNueva(null);
        setPreviewNueva(null);
        setPreviewVectorizada(null);
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
            <span className="mb-1 block font-medium">Identificación *</span>
            <input
              value={identificacion}
              onChange={(e) => setIdentificacion(e.target.value)}
              required
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]"
              placeholder="Número de cédula"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Cargo *</span>
            <input
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              required
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]"
              placeholder="Ej. Facturadora, Supervisora de Facturación"
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium">Firma escaneada *</span>
            <input
              ref={inputFirma}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => elegirFirma(e.target.files[0] || null)}
              className="hidden"
            />
            {previewNueva || firmaUrl ? (
              <div className="grid gap-3 rounded-[var(--radius-input)] border border-[var(--color-border)] p-3">
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-[var(--color-muted)]">Foto subida</span>
                  <div
                    className="relative h-48 w-full select-none overflow-hidden rounded bg-[var(--color-ink)]/5"
                    onMouseDown={recortando ? empezarArrastre : undefined}
                    onMouseMove={recortando ? seguirArrastre : undefined}
                    onMouseUp={recortando ? terminarArrastre : undefined}
                    onMouseLeave={recortando ? terminarArrastre : undefined}
                    style={recortando ? { cursor: "crosshair" } : undefined}
                  >
                    <img
                      ref={imgRef}
                      src={previewNueva || firmaUrl}
                      alt="Firma"
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                    {recortando && seleccion && (
                      <div
                        className="pointer-events-none absolute border-2 border-[var(--color-accent)] bg-[var(--color-accent)]/20"
                        style={{ left: seleccion.x, top: seleccion.y, width: seleccion.w, height: seleccion.h }}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" onClick={() => inputFirma.current?.click()}>
                    Cambiar firma
                  </Button>
                  {previewNueva && !recortando && (
                    <Button type="button" variant="ghost" onClick={() => setRecortando(true)}>
                      Recortar imagen
                    </Button>
                  )}
                  {recortando && (
                    <>
                      <Button type="button" variant="accent" onClick={aplicarRecorte}>
                        Aplicar recorte
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setRecortando(false);
                          setSeleccion(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
                {recortando && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Dibuja con el mouse un recuadro sobre la parte de la firma que quieres conservar, luego "Aplicar recorte".
                  </p>
                )}
                {previewNueva && (
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <span className="mb-1.5 block text-xs font-medium text-[var(--color-muted)]">Así se verá en el oficio</span>
                    {cargandoPreview && <p className="text-xs text-[var(--color-muted)]">Procesando…</p>}
                    {errorPreview && <p className="text-xs text-[#b3362a]">{errorPreview} Prueba con otra foto.</p>}
                    {previewVectorizada && (
                      <img
                        src={previewVectorizada}
                        alt="Vista previa de la firma vectorizada"
                        className="h-48 w-full rounded border border-[var(--color-border)] bg-white object-contain p-2"
                      />
                    )}
                  </div>
                )}
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
        <Button type="submit" variant="accent" className="justify-self-start" disabled={guardando || cargandoPreview || !!errorPreview}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </form>
    </div>
  );
}
