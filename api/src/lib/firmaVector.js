import Jimp from "jimp";
import { Potrace } from "potrace";
import sharp from "sharp";

// Convierte una foto o escaneo de una firma en un trazo limpio, una sola vez,
// al subirla en "Mi firma" (nunca al generar el oficio). El resultado se
// guarda como un PNG pequeño y de tamaño fijo — así toda firma sale igual en
// el oficio, sin importar la resolución del original, y sin el fondo/sombra
// del papel o la foto.
//
// Un umbral de blanco/negro único (fijo o automático) no generaliza: una
// firma fotografiada con buena luz necesita un corte distinto al de un
// escaneo con viñeta o sombra en los bordes. En su lugar se usa un umbral
// ADAPTATIVO — cada píxel se compara contra el promedio de su zona cercana
// (una versión desenfocada de la misma imagen), no contra un número fijo —
// la misma técnica que usan los escáneres de documentos para manejar luz
// despareja.
//
// Sobre el ruido de borde (viñetas, sombras del papel): se prueban dos
// defensas juntas.
//  1. Un recorte de margen fijo, que elimina la mayoría de las viñetas.
//  2. Una limpieza fina por erosión: se "encoge" la máscara un par de
//     píxeles para romper conexiones delgadas y accidentales con el borde,
//     se identifica qué queda tocando el borde ya encogido, y SOLO eso se
//     quita del original (crecido de vuelta). Nunca se hace un relleno por
//     inundación directo sobre la máscara sin encoger: una sola conexión
//     delgada y falsa con el borde puede comerse la firma completa (se
//     probó y pasó).
// Se probó hacer el margen adaptativo (detectar viñeta midiendo el borde y
// solo ahí recortar más), pero la transición de una viñeta real no siempre
// está pegada al borde — a veces empieza bastante más adentro (fondo de
// mesa, sombra del papel) — así que medir una franja delgada no la detecta
// de forma confiable. Un margen fijo, combinado con la limpieza por
// erosión de abajo, dio el resultado más consistente en la práctica.
const MARGEN_RECORTE = 0.06; // % del borde que se descarta antes de procesar
const RADIO_DESENFOQUE = 20; // px — define qué tan "local" es el promedio de fondo
const CONTRASTE_MINIMO = 15; // cuánto más oscuro que su entorno debe ser un píxel para contar como tinta
const RADIO_EROSION = 3; // px — grosor de conexión que se considera "accidental"
const ALTO_DESTINO = 160;
const ANCHO_MAXIMO = 420;

function erosionar(bits, ancho, alto, r) {
  const salida = new Uint8Array(bits.length);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!bits[y * ancho + x]) continue;
      let completo = true;
      for (let dy = -r; dy <= r && completo; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= alto) {
          completo = false;
          break;
        }
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= ancho || !bits[ny * ancho + nx]) {
            completo = false;
            break;
          }
        }
      }
      if (completo) salida[y * ancho + x] = 1;
    }
  }
  return salida;
}

function dilatar(bits, ancho, alto, r) {
  const salida = new Uint8Array(bits.length);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (bits[y * ancho + x]) {
        salida[y * ancho + x] = 1;
        continue;
      }
      let encontrado = false;
      for (let dy = -r; dy <= r && !encontrado; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= alto) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= ancho) continue;
          if (bits[ny * ancho + nx]) {
            encontrado = true;
            break;
          }
        }
      }
      if (encontrado) salida[y * ancho + x] = 1;
    }
  }
  return salida;
}

function componenteConectadaAlBorde(bits, ancho, alto) {
  const visitado = new Uint8Array(bits.length);
  const pila = [];
  for (let x = 0; x < ancho; x++) {
    if (bits[x]) pila.push(x);
    if (bits[x + (alto - 1) * ancho]) pila.push(x + (alto - 1) * ancho);
  }
  for (let y = 0; y < alto; y++) {
    if (bits[y * ancho]) pila.push(y * ancho);
    if (bits[y * ancho + ancho - 1]) pila.push(y * ancho + ancho - 1);
  }
  while (pila.length) {
    const idx = pila.pop();
    if (visitado[idx]) continue;
    visitado[idx] = 1;
    const x = idx % ancho;
    const y = (idx / ancho) | 0;
    if (x > 0 && bits[idx - 1] && !visitado[idx - 1]) pila.push(idx - 1);
    if (x < ancho - 1 && bits[idx + 1] && !visitado[idx + 1]) pila.push(idx + 1);
    if (y > 0 && bits[idx - ancho] && !visitado[idx - ancho]) pila.push(idx - ancho);
    if (y < alto - 1 && bits[idx + ancho] && !visitado[idx + ancho]) pila.push(idx + ancho);
  }
  return visitado;
}

async function binarizarAdaptativo(buffer) {
  const img = await Jimp.read(buffer);
  const mx = Math.round(img.bitmap.width * MARGEN_RECORTE);
  const my = Math.round(img.bitmap.height * MARGEN_RECORTE);
  img.crop(mx, my, img.bitmap.width - 2 * mx, img.bitmap.height - 2 * my);
  img.greyscale();

  const fondo = img.clone().blur(RADIO_DESENFOQUE);
  const { width: ancho, height: alto } = img.bitmap;
  const bits = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const valor = (img.getPixelColor(x, y) >>> 24) & 0xff;
      const local = (fondo.getPixelColor(x, y) >>> 24) & 0xff;
      if (local - valor > CONTRASTE_MINIMO) bits[y * ancho + x] = 1;
    }
  }

  const core = erosionar(bits, ancho, alto, RADIO_EROSION);
  const ruidoCore = componenteConectadaAlBorde(core, ancho, alto);
  const ruido = dilatar(ruidoCore, ancho, alto, RADIO_EROSION);
  const limpio = Buffer.alloc(ancho * alto);
  for (let i = 0; i < bits.length; i++) limpio[i] = bits[i] && !ruido[i] ? 0 : 255;

  return sharp(limpio, { raw: { width: ancho, height: alto, channels: 1 } }).png().toBuffer();
}

export async function vectorizarFirma(buffer) {
  const binaria = await binarizarAdaptativo(buffer);

  const trace = new Potrace({ color: "black", background: "transparent", threshold: 128, turdSize: 2 });
  await new Promise((resolve, reject) => {
    trace.loadImage(binaria, (err) => (err ? reject(err) : resolve()));
  });
  const svg = trace.getSVG();
  if (!/<path /.test(svg)) {
    throw new Error("No se detectó ningún trazo en la imagen. Prueba con una foto de la firma con mejor contraste.");
  }

  // Se deja que una librería real (sharp) rasterice el SVG a tamaño fijo —
  // resolver el fill-rule="evenodd" de potrace a mano resultó frágil (con
  // ciertas firmas desaparecía por completo), así que es mejor no reinventar
  // un motor de relleno SVG.
  const png = await sharp(Buffer.from(svg))
    .resize({ height: ALTO_DESTINO, width: ANCHO_MAXIMO, fit: "inside" })
    .png()
    .toBuffer();
  const { width, height } = await sharp(png).metadata();

  return { png: png.toString("base64"), ancho: width, alto: height };
}
