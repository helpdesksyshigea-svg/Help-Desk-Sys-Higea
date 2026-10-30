import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "../assets/logo-hospital-nit.png");
const SELLO_PATH = join(__dirname, "../assets/sello-vigilado-supersalud.png");

const PAGINA = { ancho: 612, alto: 792 }; // carta, en puntos
const MARGEN = 60; // deja espacio a la izquierda para el sello "Vigilado Supersalud"
const ANCHO_UTIL = PAGINA.ancho - MARGEN * 2;
const NEGRO = rgb(0.03, 0.15, 0.14); // aprox --color-ink
const GRIS = rgb(0.36, 0.42, 0.41); // aprox --color-muted
const VERDE = rgb(0.29, 0.62, 0.2); // verde institucional de las líneas del membrete

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
  return `Orito putumayo, ${texto}`;
}

function reemplazarMarcadores(plantilla, datos) {
  return (plantilla || "").replace(/\{\{(\w+)\}\}/g, (_, clave) => (datos[clave] != null && datos[clave] !== "" ? String(datos[clave]) : ""));
}

// Parte un texto en líneas que caben en `anchoMax`, respetando los saltos de
// párrafo (\n) ya presentes en la plantilla — pdf-lib no hace wrap automático.
function partirEnLineas(texto, fuente, tamano, anchoMax) {
  const lineas = [];
  for (const parrafo of String(texto || "").split("\n")) {
    if (!parrafo.trim()) {
      lineas.push("");
      continue;
    }
    const palabras = parrafo.split(/\s+/);
    let actual = "";
    for (const palabra of palabras) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(prueba, tamano) > anchoMax && actual) {
        lineas.push(actual);
        actual = palabra;
      } else {
        actual = prueba;
      }
    }
    if (actual) lineas.push(actual);
  }
  return lineas;
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

// Dos líneas verdes finas y pegadas — el mismo detalle que usa el membrete
// real del hospital para separar el encabezado/pie del cuerpo del oficio.
function lineasDobles(pagina, y) {
  pagina.drawLine({ start: { x: 0, y }, end: { x: PAGINA.ancho, y }, thickness: 1.5, color: VERDE });
  pagina.drawLine({ start: { x: 0, y: y - 3 }, end: { x: PAGINA.ancho, y: y - 3 }, thickness: 1.5, color: VERDE });
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
export async function construirOficioPdf({ ticket, tipoEtiqueta, plantilla, items, solicitante, aprobador }) {
  const pdf = await PDFDocument.create();
  let pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = PAGINA.alto - 36;

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y - alturaNecesaria < MARGEN + 70) {
      pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
      y = PAGINA.alto - 36;
    }
  }

  // Encabezado: logo con NIT, centrado, + doble línea verde.
  try {
    const logo = await pdf.embedPng(readFileSync(LOGO_PATH));
    const logoAncho = 230;
    const logoAlto = (logo.height / logo.width) * logoAncho;
    pagina.drawImage(logo, { x: (PAGINA.ancho - logoAncho) / 2, y: y - logoAlto, width: logoAncho, height: logoAlto });
    y -= logoAlto + 10;
  } catch {
    y -= 60;
  }
  lineasDobles(pagina, y);
  y -= 30;

  // Sello "Vigilado Supersalud" en el margen izquierdo, girado verticalmente
  // — igual que en el membrete real. Se ancla cerca del pie de página (no al
  // centro vertical) para no toparse con el cierre/firmas en un oficio corto
  // de una sola página.
  try {
    const sello = await pdf.embedPng(readFileSync(SELLO_PATH));
    const selloAncho = 20;
    const selloAlto = (sello.height / sello.width) * selloAncho;
    pagina.drawImage(sello, {
      x: 16,
      y: 250,
      width: selloAncho,
      height: selloAlto,
      rotate: degrees(-90),
    });
  } catch {
    // Si el sello no está disponible, el oficio igual se genera sin él.
  }

  // Fecha, destinatario fijo (SYS HIGEA) y asunto — misma estructura que el
  // oficio en papel que ya usaba Facturación.
  pagina.drawText(fechaLarga(ticket.created_at), { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 30;
  pagina.drawText("Señores:", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 15;
  pagina.drawText("SYS SOFTWARE Y SOLUCIONES LTDA", { x: MARGEN, y, size: 10.5, font: fuenteNegrita, color: NEGRO });
  y -= 15;
  pagina.drawText("Pasto Nariño", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 26;

  const asuntoTexto = `Asunto: ${tipoEtiqueta} — ticket ${ticket.code}.`;
  const anchoAsuntoLabel = fuenteNegrita.widthOfTextAtSize("Asunto:", 10.5);
  pagina.drawText("Asunto:", { x: MARGEN, y, size: 10.5, font: fuenteNegrita, color: NEGRO });
  pagina.drawText(asuntoTexto.replace("Asunto:", "").trim(), { x: MARGEN + anchoAsuntoLabel + 4, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 26;
  pagina.drawText("Cordial saludo,", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 24;

  // Cuerpo: plantilla del tipo de solicitud con los marcadores reemplazados.
  const datosPlantilla = {
    tipo: tipoEtiqueta,
    firmante: ticket.firmante,
    observacion: ticket.observacion || "",
    codigo: ticket.code,
    fecha: fechaCorta(ticket.created_at),
  };
  const textoBase =
    plantilla && plantilla.trim()
      ? reemplazarMarcadores(plantilla, datosPlantilla)
      : `Por medio del presente se radica una solicitud de "${tipoEtiqueta}" ante SYS HIGEA, con los registros detallados a continuación.`;

  const tamanoCuerpo = 10.5;
  for (const linea of partirEnLineas(textoBase, fuente, tamanoCuerpo, ANCHO_UTIL)) {
    nuevaPaginaSiHaceFalta(16);
    if (linea) pagina.drawText(linea, { x: MARGEN, y, size: tamanoCuerpo, font: fuente, color: NEGRO });
    y -= 16;
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
  y -= 24;
  nuevaPaginaSiHaceFalta(120);
  pagina.drawText("Agradezco de antemano su valiosa colaboración.", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 30;
  pagina.drawText("Atentamente,", { x: MARGEN, y, size: 10.5, font: fuente, color: NEGRO });
  y -= 14;

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
  lineasDobles(pagina, 54);
  let y = 42;
  for (const linea of PIE_LINEAS) {
    centrado(pagina, linea, y, fuente, 7.5, GRIS);
    y -= 10;
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
