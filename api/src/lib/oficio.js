import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "../assets/logo-hospital-nit.png");
const SELLO_PATH = join(__dirname, "../assets/sello-vigilado-supersalud.png");
// El oficio de referencia del hospital (generado en Word) usa Arial. Arial
// es una fuente con licencia de Monotype — no se puede redistribuir su
// archivo en este repo ni en el servidor. Arimo es la alternativa libre
// (Apache 2.0) diseñada para ser métricamente compatible con Arial: mismo
// ancho de carácter, mismo interlineado, visualmente casi idéntica.
const FUENTE_REGULAR_PATH = join(__dirname, "../assets/fonts/Arimo-Regular.ttf");
const FUENTE_NEGRITA_PATH = join(__dirname, "../assets/fonts/Arimo-Bold.ttf");

const PAGINA = { ancho: 612, alto: 792 }; // carta, en puntos — igual al oficio de referencia en Word
const MARGEN = 72; // 1 pulgada, igual al margen del oficio de referencia
const ANCHO_UTIL = PAGINA.ancho - MARGEN * 2;
const NEGRO = rgb(0.03, 0.15, 0.14); // aprox --color-ink
const GRIS = rgb(0.36, 0.42, 0.41); // aprox --color-muted
// Verde lima institucional (#92D050, el mismo "Lime" estándar de Office) —
// medido por color de píxel directo del oficio de referencia real, no es el
// verde más oscuro que se usó en un primer intento.
const VERDE = rgb(146 / 255, 208 / 255, 80 / 255);

const ITEM_CAMPOS = [
  { clave: "factura", etiqueta: "Factura", ancho: 0.15 },
  { clave: "paciente", etiqueta: "Paciente", ancho: 0.22 },
  { clave: "documento", etiqueta: "Documento", ancho: 0.13 },
  { clave: "cups", etiqueta: "CUPS", ancho: 0.1 },
  { clave: "fecha", etiqueta: "Fecha", ancho: 0.12 },
  { clave: "motivo", etiqueta: "Motivo", ancho: 0.28 },
];

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function fechaCorta(iso) {
  if (!iso) return "—";
  // Un campo "solo fecha" (ej. item.fecha) no lleva hora/zona: construirlo con
  // `new Date()` y luego formatearlo lo interpreta como medianoche UTC, que el
  // servidor (en UTC en Render) o cualquier huso detrás de UTC corre un día
  // atrás. Se arma el texto directo del string, sin pasar por Date.
  if (SOLO_FECHA.test(iso)) {
    const [anio, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${anio}`;
  }
  return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Bogota" });
}

function fechaLarga(iso) {
  const d = iso ? new Date(iso) : new Date();
  const texto = d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
  return `Orito, Putumayo, ${texto}`;
}

function reemplazarMarcadores(plantilla, datos) {
  return (plantilla || "").replace(/\{\{(\w+)\}\}/g, (_, clave) => (datos[clave] != null && datos[clave] !== "" ? String(datos[clave]) : ""));
}

// {{firmante}} y {{cargo}} van en MAYÚSCULA y negrita dentro del cuerpo (pedido
// explícito del usuario, para que el nombre y el cargo de quien firma resalten
// en medio del párrafo) — el resto de marcadores se sustituyen como texto
// normal. Se marca el tramo resaltado con un centinela invisible (U+0001,
// nunca aparece en texto real) para que tokenizarConEstilo() sepa dónde
// empieza y termina la negrita sin tener que parsear HTML/Markdown.
const CENTINELA = "\u0001";

function reemplazarMarcadoresConEstilo(plantilla, datos) {
  // Primera pasada: todos los marcadores EXCEPTO firmante/cargo (que deben
  // quedar como el literal "{{firmante}}"/"{{cargo}}" para resolverse en la
  // segunda pasada con su resaltado) — reemplazarMarcadores() blanquea
  // cualquier marcador sin valor, así que no sirve pasarle firmante/cargo en
  // `undefined`: hay que ocultárselos del regex por completo.
  let texto = String(plantilla || "");
  texto = texto.replace(/\{\{(\w+)\}\}/g, (m, clave) => {
    if (clave === "firmante" || clave === "cargo") return m;
    return datos[clave] != null && datos[clave] !== "" ? String(datos[clave]) : "";
  });
  for (const clave of ["firmante", "cargo"]) {
    const valor = datos[clave];
    texto = texto.replaceAll(`{{${clave}}}`, valor ? `${CENTINELA}${String(valor).toUpperCase()}${CENTINELA}` : "");
  }
  return texto;
}

// Tokeniza preservando párrafos (\n) y, dentro de cada uno, qué palabras caen
// en un tramo marcado con CENTINELA (ver reemplazarMarcadoresConEstilo). Una
// palabra se considera en negrita si el párrafo ya estaba "dentro" de un
// tramo resaltado al llegar a ella, o si ella misma contiene un centinela
// (así un nombre de una sola palabra, que abre y cierra en el mismo token,
// igual queda marcado).
function tokenizarConEstilo(texto) {
  const parrafos = [];
  for (const parrafo of String(texto || "").split("\n")) {
    if (!parrafo.trim()) {
      parrafos.push([]);
      continue;
    }
    const tokens = [];
    let enNegrita = false;
    for (const crudo of parrafo.split(/\s+/)) {
      if (!crudo) continue;
      const partes = crudo.split(CENTINELA);
      const negrita = enNegrita || partes.length > 1;
      if ((partes.length - 1) % 2 === 1) enNegrita = !enNegrita;
      tokens.push({ palabra: partes.join(""), negrita });
    }
    parrafos.push(tokens);
  }
  return parrafos;
}

// Reparte en líneas que caben en `anchoMax` un texto ya tokenizado por
// tokenizarConEstilo() (palabras con su propio ancho según negrita/regular).
// Cada línea resultante es { tokens: [{palabra, negrita}], ultima } —
// `ultima` marca la última línea de cada párrafo (incluido un párrafo vacío,
// que es una línea en blanco): el cuerpo del oficio va justificado como en
// el .docx real (w:jc="both"), pero la última línea de un párrafo NUNCA se
// estira para llenar el ancho — es la convención tipográfica estándar, y
// además evita separaciones absurdas en líneas cortas de cierre.
function partirEnLineasConEstilo(parrafosConEstilo, fuente, fuenteNegrita, tamano, anchoMax) {
  const anchoEspacio = fuente.widthOfTextAtSize(" ", tamano);
  const lineas = [];
  for (const parrafo of parrafosConEstilo) {
    if (parrafo.length === 0) {
      lineas.push({ tokens: [], ultima: true });
      continue;
    }
    let actual = [];
    let anchoActual = 0;
    for (const tok of parrafo) {
      const f = tok.negrita ? fuenteNegrita : fuente;
      const anchoPalabra = f.widthOfTextAtSize(tok.palabra, tamano);
      const espacio = actual.length ? anchoEspacio : 0;
      if (actual.length && anchoActual + espacio + anchoPalabra > anchoMax) {
        lineas.push({ tokens: actual, ultima: false });
        actual = [];
        anchoActual = 0;
      }
      actual.push(tok);
      anchoActual += (actual.length > 1 ? anchoEspacio : 0) + anchoPalabra;
    }
    if (actual.length) lineas.push({ tokens: actual, ultima: true });
  }
  return lineas;
}

// Parte un texto plano (sin negrita) en líneas con la misma forma que
// partirEnLineasConEstilo, para que ambas rutas de dibujo del cuerpo
// (con/sin plantilla) compartan un solo renderer justificado.
function partirEnLineas(texto, fuente, tamano, anchoMax) {
  const parrafos = String(texto || "")
    .split("\n")
    .map((p) => (p.trim() ? p.split(/\s+/).filter(Boolean).map((palabra) => ({ palabra, negrita: false })) : []));
  return partirEnLineasConEstilo(parrafos, fuente, fuente, tamano, anchoMax);
}

// Dibuja una línea del cuerpo justificando el espacio entre palabras para
// que llegue exacto a `anchoMax` — salvo la última línea de cada párrafo,
// que se deja alineada a la izquierda sin estirar (ver partirEnLineasConEstilo).
function dibujarLineaJustificada(pagina, linea, x, y, fuente, fuenteNegrita, tamano, anchoMax, color) {
  const { tokens, ultima } = linea;
  if (tokens.length === 0) return;
  const anchoEspacioNormal = fuente.widthOfTextAtSize(" ", tamano);
  const anchosPalabras = tokens.map((t) => (t.negrita ? fuenteNegrita : fuente).widthOfTextAtSize(t.palabra, tamano));
  const anchoTotalPalabras = anchosPalabras.reduce((a, b) => a + b, 0);
  const huecos = tokens.length - 1;
  const anchoEspacio =
    !ultima && huecos > 0 ? Math.max(0, (anchoMax - anchoTotalPalabras) / huecos) : anchoEspacioNormal;

  let cursor = x;
  tokens.forEach((tok, i) => {
    const f = tok.negrita ? fuenteNegrita : fuente;
    pagina.drawText(tok.palabra, { x: cursor, y, size: tamano, font: f, color });
    cursor += anchosPalabras[i] + (i < tokens.length - 1 ? anchoEspacio : 0);
  });
}

function truncar(fuente, tamano, texto, anchoMax) {
  let t = String(texto ?? "—");
  if (fuente.widthOfTextAtSize(t, tamano) <= anchoMax) return t;
  while (t.length > 1 && fuente.widthOfTextAtSize(t + "…", tamano) > anchoMax) t = t.slice(0, -1);
  return t + "…";
}

function centrado(pagina, texto, y, fuente, tamano, color) {
  const ancho = fuente.widthOfTextAtSize(texto, tamano);
  pagina.drawText(texto, { x: (PAGINA.ancho - ancho) / 2, y, size: tamano, font: fuente, color });
}

// Dos líneas verde lima finas y pegadas — el mismo detalle que usa el
// membrete real del hospital para separar el encabezado/pie del cuerpo del
// oficio. No van de borde a borde de la página: el oficio real las corta a
// un ancho específico (medido por escaneo de píxeles), distinto bajo el
// logo (más ancho) que sobre el pie de página (más angosto).
function lineasDobles(pagina, y, x1, x2) {
  pagina.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 1.5, color: VERDE });
  pagina.drawLine({ start: { x: x1, y: y - 3 }, end: { x: x2, y: y - 3 }, thickness: 1.5, color: VERDE });
}

/**
 * Genera el PDF del oficio al vuelo (nunca se persiste en Storage — eso es lo
 * que ahorra espacio frente al adjunto manual escaneado), replicando el
 * formato del membrete oficial del hospital: logo con NIT centrado, doble
 * línea verde bajo el encabezado y sobre el pie de página, datos de contacto
 * centrados al final, y el sello "Vigilado Supersalud" en el margen
 * izquierdo. Si `solicitante`/`aprobador` no tienen firma confirmada aún, esa
 * sección del documento simplemente queda sin estampar: el mismo endpoint se
 * puede volver a pedir más adelante y traerá las firmas que ya se hayan
 * confirmado para entonces.
 */
const CONFIG_OFICIO_DEFAULT = {
  destinatario_nombre: "SOPORTE TÉCNICO SYS HIGEA",
  destinatario_ciudad: "Pasto, Nariño",
  texto_cierre: "Agradezco de antemano su valiosa colaboración.",
  texto_despedida: "Atentamente,",
};

export async function construirOficioPdf({ ticket, tipoEtiqueta, plantilla, items, solicitante, aprobador, configOficio }) {
  // Si no llega (p.ej. falló la consulta a config_oficio), el oficio igual se
  // genera con el texto de siempre — nunca bloquea la generación del PDF.
  const config = { ...CONFIG_OFICIO_DEFAULT, ...configOficio };
  const pdf = await PDFDocument.create();
  let pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
  pdf.registerFontkit(fontkit);
  // subset: false — con esta fuente el subsetter de pdf-lib pierde glifos
  // (letras con tilde quedaban en blanco, probado y descartado). Sin subset
  // el PDF pesa ~550KB en vez de unos pocos KB, pero sigue siendo mucho más
  // liviano que el adjunto escaneado manual que reemplaza.
  const fuente = await pdf.embedFont(readFileSync(FUENTE_REGULAR_PATH), { subset: false });
  const fuenteNegrita = await pdf.embedFont(readFileSync(FUENTE_NEGRITA_PATH), { subset: false });

  let y = PAGINA.alto - 33.1; // tope del logo medido en el oficio de referencia

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y - alturaNecesaria < MARGEN + 70) {
      pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
      y = PAGINA.alto - 33.1;
    }
  }

  // Encabezado: logo con NIT, centrado, + doble línea verde. Medidas exactas
  // tomadas del oficio de referencia real (pdftoppm + escaneo de píxeles):
  // logo ≈146×39pt, centrado; línea doble a y≈712-714pt (origen abajo).
  try {
    const logo = await pdf.embedPng(readFileSync(LOGO_PATH));
    const logoAncho = 146;
    const logoAlto = (logo.height / logo.width) * logoAncho;
    pagina.drawImage(logo, { x: (PAGINA.ancho - logoAncho) / 2, y: y - logoAlto, width: logoAncho, height: logoAlto });
    y -= logoAlto;
  } catch {
    y -= 39;
  }
  lineasDobles(pagina, 712.3, 53, 560);

  // Sello "Vigilado Supersalud" en el margen izquierdo. La imagen fuente es
  // horizontal (extraída directa del PDF real: Word también la inserta como
  // imagen, no como vector) — en el oficio va rotada 90° para leerse de
  // abajo hacia arriba, igual que el original.
  try {
    const sello = await pdf.embedPng(readFileSync(SELLO_PATH));
    const altoDestino = 48; // ancho final de la franja ya rotada
    const anchoDestino = (sello.width / sello.height) * altoDestino; // alto final ya rotado
    const x0 = 12;
    const y0 = 330;
    pagina.drawImage(sello, {
      x: x0 + altoDestino,
      y: y0,
      width: anchoDestino,
      height: altoDestino,
      rotate: degrees(90),
    });
  } catch {
    // Si el sello no está disponible, el oficio igual se genera sin él.
  }

  // Fecha, destinatario fijo (SYS HIGEA) y asunto — posiciones y espaciados
  // medidos del oficio de referencia (pdftotext -bbox-layout).
  y = 792 - 100.58;
  pagina.drawText(fechaLarga(ticket.created_at), { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y = 792 - 134.348;
  pagina.drawText("Señores:", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 15.84;
  pagina.drawText(config.destinatario_nombre, { x: MARGEN, y, size: 10.5, font: fuenteNegrita, color: NEGRO });
  y -= 15.84;
  pagina.drawText(config.destinatario_ciudad, { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y = 792 - 211.46;

  const refTexto = `ticket ${ticket.code} - ${tipoEtiqueta}`;
  const anchoRefLabel = fuenteNegrita.widthOfTextAtSize("Ref:", 10.5);
  pagina.drawText("Ref:", { x: MARGEN, y, size: 10.5, font: fuenteNegrita, color: NEGRO });
  pagina.drawText(refTexto, { x: MARGEN + anchoRefLabel + 4, y, size: 10.5, font: fuente, color: NEGRO });
  y = 792 - 229.388;
  pagina.drawText("Cordial saludo,", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y = 792 - 258.218;

  // Cuerpo: plantilla del tipo de solicitud con los marcadores reemplazados.
  // {{firmante}} y {{cargo}} salen en MAYÚSCULA y negrita (ver
  // reemplazarMarcadoresConEstilo) — el resto del texto va normal.
  const datosPlantilla = {
    tipo: tipoEtiqueta,
    firmante: ticket.firmante,
    observacion: ticket.observacion || "",
    codigo: ticket.code,
    fecha: fechaCorta(ticket.created_at),
    cargo: solicitante?.cargo || "",
    factura: items?.[0]?.factura || "",
  };

  const tamanoCuerpo = 10.5;
  const interlineaCuerpo = 15.84; // medido en el oficio de referencia

  // Justificado ("both" en el .docx original) salvo la última línea de cada
  // párrafo, que no se estira (ver dibujarLineaJustificada).
  const lineasCuerpo =
    plantilla && plantilla.trim()
      ? partirEnLineasConEstilo(tokenizarConEstilo(reemplazarMarcadoresConEstilo(plantilla, datosPlantilla)), fuente, fuenteNegrita, tamanoCuerpo, ANCHO_UTIL)
      : partirEnLineas(
          `Por medio del presente se radica una solicitud de "${tipoEtiqueta}" ante SYS HIGEA, con los registros detallados a continuación.`,
          fuente,
          tamanoCuerpo,
          ANCHO_UTIL,
        );
  for (const linea of lineasCuerpo) {
    nuevaPaginaSiHaceFalta(interlineaCuerpo);
    dibujarLineaJustificada(pagina, linea, MARGEN, y, fuente, fuenteNegrita, tamanoCuerpo, ANCHO_UTIL, NEGRO);
    y -= interlineaCuerpo;
  }

  // Tabla de registros.
  y -= 10;
  nuevaPaginaSiHaceFalta(40);
  pagina.drawText(`Registros (${items.length})`, { x: MARGEN, y, size: 10, font: fuenteNegrita, color: NEGRO });
  y -= 16;
  nuevaPaginaSiHaceFalta(18);
  let x = MARGEN;
  for (const campo of ITEM_CAMPOS) {
    pagina.drawText(campo.etiqueta, { x, y, size: 8, font: fuenteNegrita, color: GRIS });
    x += ANCHO_UTIL * campo.ancho;
  }
  y -= 4;
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: PAGINA.ancho - MARGEN, y }, thickness: 0.5, color: GRIS });
  y -= 14;

  for (const item of items) {
    nuevaPaginaSiHaceFalta(16);
    x = MARGEN;
    for (const campo of ITEM_CAMPOS) {
      const anchoCelda = ANCHO_UTIL * campo.ancho - 6;
      const valor = campo.clave === "fecha" ? fechaCorta(item.fecha) : item[campo.clave];
      pagina.drawText(truncar(fuente, 8.5, valor || "—", anchoCelda), { x, y, size: 8.5, font: fuente, color: NEGRO });
      x += ANCHO_UTIL * campo.ancho;
    }
    y -= 16;
  }

  // Cierre y firmas: solicitante y, si ya está confirmada, la de quien aprueba.
  // Espaciados medidos en el oficio de referencia (interlínea ≈15.84pt entre
  // "Agradezco..." y "Atentamente,", ≈34.3pt; firma/nombre ≈25.7pt bajo
  // "Atentamente,").
  y -= 20;
  nuevaPaginaSiHaceFalta(120);
  pagina.drawText(config.texto_cierre, { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 15.84;
  y -= 34.3;
  pagina.drawText(config.texto_despedida, { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 25.73;

  const colAncho = ANCHO_UTIL / 2 - 10;
  await dibujarFirma(pdf, pagina, {
    x: MARGEN,
    y,
    ancho: colAncho,
    titulo: "Solicita",
    persona: solicitante,
    confirmadaEn: ticket.firma_solicitante_at,
    fuente,
    fuenteNegrita,
  });
  await dibujarFirma(pdf, pagina, {
    x: MARGEN + colAncho + 20,
    y,
    ancho: colAncho,
    titulo: "Aprueba",
    persona: aprobador,
    confirmadaEn: ticket.firma_aprobador_at,
    fuente,
    fuenteNegrita,
  });

  dibujarPie(pagina, fuente);

  return Buffer.from(await pdf.save());
}

const PIE_LINEAS = [
  "CALLE 9 NO 3-50 BARRIO EL VERGEL - ORITO PUTUMAYO (COLOMBIA)",
  "Teléfonos: SECRETARIA GERENCIA: 3152484464",
  "E-mail: secretariadegerencia@esehospitalorito.gov.co – gerencia@esehospitalorito.gov.co",
  "https://ese-hospital-orito.micolombiadigital.gov.co/",
];

// Pie de página fijo — doble línea verde + datos de contacto centrados,
// igual que el membrete real. Se dibuja en la última página usada, sin
// importar cuánto contenido haya arriba.
function dibujarPie(pagina, fuente) {
  // Posiciones y color medidos directo del oficio de referencia: texto negro
  // (no gris), con más aire entre la línea verde y la primera línea de texto
  // que lo que había antes — ambos detalles eran la diferencia visible
  // frente al .docx original.
  lineasDobles(pagina, 76.3, 72, 553);
  let y = 63.1;
  for (const linea of PIE_LINEAS) {
    centrado(pagina, linea, y, fuente, 7.5, NEGRO);
    y -= 10.3;
  }
}

async function dibujarFirma(pdf, pagina, { x, y, ancho, titulo, persona, confirmadaEn, fuente, fuenteNegrita }) {
  let yFirma = y;
  // La firma es un PNG normalizado (ver lib/firmaVector.js: se vectoriza y
  // rasteriza una sola vez, al subir la firma, a un tamaño fijo) — no la
  // foto original, así toda firma sale del mismo tamaño en el oficio sin
  // importar la resolución del escaneo.
  if (persona?.firma_svg?.png && confirmadaEn) {
    try {
      const imagen = await pdf.embedPng(Buffer.from(persona.firma_svg.png, "base64"));
      const altoDestino = 42;
      const anchoMax = Math.min(ancho, 160);
      const escala = Math.min(altoDestino / persona.firma_svg.alto, anchoMax / persona.firma_svg.ancho);
      const anchoDibujo = persona.firma_svg.ancho * escala;
      const altoDibujo = persona.firma_svg.alto * escala;
      pagina.drawImage(imagen, { x, y: yFirma - altoDibujo + 8, width: anchoDibujo, height: altoDibujo });
      yFirma -= altoDibujo - 2;
    } catch {
      yFirma -= 36;
    }
  } else {
    yFirma -= 36;
  }
  pagina.drawLine({ start: { x, y: yFirma }, end: { x: x + ancho, y: yFirma }, thickness: 0.75, color: GRIS });
  yFirma -= 13;
  if (confirmadaEn && persona) {
    pagina.drawText(persona.nombre || "—", { x, y: yFirma, size: 9.5, font: fuenteNegrita, color: NEGRO });
    yFirma -= 12;
    const linea2 = [persona.identificacion ? `C.C. ${persona.identificacion}` : null, persona.cargo].filter(Boolean).join(" · ");
    if (linea2) {
      pagina.drawText(linea2, { x, y: yFirma, size: 8.5, font: fuente, color: GRIS });
      yFirma -= 12;
    }
    pagina.drawText(`Firmado el ${fechaCorta(confirmadaEn)}`, { x, y: yFirma, size: 8, font: fuente, color: GRIS });
  } else {
    pagina.drawText("Firma pendiente de confirmación", { x, y: yFirma, size: 8.5, font: fuente, color: GRIS });
  }
  pagina.drawText(titulo.toUpperCase(), { x, y: y + 4, size: 7.5, font: fuenteNegrita, color: GRIS });
}
