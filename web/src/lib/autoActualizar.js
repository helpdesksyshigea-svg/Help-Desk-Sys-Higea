// Revisa cada minuto si Render ya desplegó un build nuevo (comparando el
// archivo JS servido en "/" contra el que está cargado) y recarga la
// página sola en cuanto detecta el cambio, para no depender de que cada
// usuario refresque manualmente después de un deploy.
const INTERVALO_MS = 60_000;

function scriptActualSrc() {
  const script = Array.from(document.querySelectorAll("script[src]")).find((s) =>
    s.src.includes("/assets/index-")
  );
  return script?.src || null;
}

export function iniciarAutoActualizacion() {
  const actual = scriptActualSrc();
  if (!actual) return;

  setInterval(async () => {
    try {
      const res = await fetch("/", { cache: "no-store" });
      const html = await res.text();
      const match = html.match(/\/assets\/index-[\w-]+\.js/);
      if (match && !actual.includes(match[0])) {
        window.location.reload();
      }
    } catch {
      // sin conexión o Render reiniciando: se reintenta en el próximo ciclo
    }
  }, INTERVALO_MS);
}
