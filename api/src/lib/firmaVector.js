import { Potrace } from "potrace";

/**
 * Convierte una imagen escaneada de una firma en un trazo vectorial (un path
 * SVG), igual que "Image Trace" en Illustrator. Se hace una sola vez, al
 * subir la firma en "Mi firma" — nunca al generar el oficio — porque el
 * resultado (el path) es lo que se guarda: un texto de unos cientos de bytes,
 * en vez de una imagen de tamaño variable según cómo haya quedado el escaneo.
 * pdf-lib dibuja ese path directamente como vector (sin rasterizar), así que
 * toda firma sale exactamente del mismo tamaño en el oficio sin importar la
 * resolución o el peso de la foto original.
 */
export async function vectorizarFirma(buffer) {
  const trace = new Potrace({ color: "black", background: "transparent" }); // threshold/blackOnWhite: auto
  await new Promise((resolve, reject) => {
    trace.loadImage(buffer, (err) => (err ? reject(err) : resolve()));
  });
  const svg = trace.getSVG();
  const pathMatch = svg.match(/<path d="([^"]+)"/);
  const viewBoxMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!pathMatch) {
    throw new Error("No se detectó ningún trazo en la imagen. Prueba con una foto de la firma con mejor contraste.");
  }
  return {
    path: pathMatch[1],
    ancho: viewBoxMatch ? parseFloat(viewBoxMatch[1]) : 1,
    alto: viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 1,
  };
}
