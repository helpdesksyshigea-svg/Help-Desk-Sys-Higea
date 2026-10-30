import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "../assets/logo-hospital.png");

const PAGINA = { ancho: 612, alto: 792 }; // carta, en puntos
const MARGEN = 50;
const ANCHO_UTIL = PAGINA.ancho - MARGEN * 2;
const NEGRO = rgb(0.03, 0.15, 0.14); // aprox --color-ink
const GRIS = rgb(0.36, 0.42, 0.41); // aprox --color-muted

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

/**
 * Genera el PDF del oficio al vuelo (nunca se persiste en Storage — eso es lo
 * que ahorra espacio frente al adjunto manual escaneado). Si `solicitante`/
 * `aprobador` no tienen firma confirmada aún, esa sección del documento
 * simplemente queda sin estampar: el mismo endpoint se puede volver a pedir
 * más adelante y traerá las firmas que ya se hayan confirmado para entonces.
 */
export async function construirOficioPdf({ ticket, tipoEtiqueta, plantilla, items, solicitante, aprobador }) {
  const pdf = await PDFDocument.create();
  let pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const fuenteNegrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = PAGINA.alto - MARGEN;

  function nuevaPaginaSiHaceFalta(alturaNecesaria) {
    if (y - alturaNecesaria < MARGEN) {
      pagina = pdf.addPage([PAGINA.ancho, PAGINA.alto]);
      y = PAGINA.alto - MARGEN;
    }
  }

  // Encabezado: logo + nombre del hospital + código/fecha del ticket.
  try {
    const logoBytes = readFileSync(LOGO_PATH);
    const logo = await pdf.embedPng(logoBytes);
    const logoAncho = 110;
    const logoAlto = (logo.height / logo.width) * logoAncho;
    pagina.drawImage(logo, { x: MARGEN, y: y - logoAlto, width: logoAncho, height: logoAlto });
  } catch {
    // Si el logo no está disponible, el oficio igual se genera sin él.
  }
  pagina.drawText("E.S.E. Hospital Orito", { x: MARGEN + 120, y: y - 14, size: 12, font: fuenteNegrita, color: NEGRO });
  pagina.drawText("Mesa de ayuda · Facturación", { x: MARGEN + 120, y: y - 30, size: 9, font: fuente, color: GRIS });

  const codigoTexto = `Oficio ref. ticket ${ticket.code}`;
  pagina.drawText(codigoTexto, {
    x: PAGINA.ancho - MARGEN - fuenteNegrita.widthOfTextAtSize(codigoTexto, 10),
    y: y - 14,
    size: 10,
    font: fuenteNegrita,
    color: NEGRO,
  });
  const fechaTexto = `Fecha: ${fechaCorta(ticket.created_at)}`;
  pagina.drawText(fechaTexto, {
    x: PAGINA.ancho - MARGEN - fuente.widthOfTextAtSize(fechaTexto, 9),
    y: y - 28,
    size: 9,
    font: fuente,
    color: GRIS,
  });

  y -= 55;
  pagina.drawLine({ start: { x: MARGEN, y }, end: { x: PAGINA.ancho - MARGEN, y }, thickness: 0.75, color: GRIS });
  y -= 22;

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

  // Firmas: solicitante y, si ya está confirmada, la de quien aprueba.
  y -= 26;
  nuevaPaginaSiHaceFalta(110);
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

  return Buffer.from(await pdf.save());
}

async function dibujarFirma(pdf, pagina, { x, y, ancho, titulo, persona, confirmadaEn, fuente, fuenteNegrita }) {
  let yFirma = y;
  if (persona?.firma_path && confirmadaEn && persona.firmaBytes) {
    try {
      const imagen = await pdf.embedPng(persona.firmaBytes);
      const alturaImg = 45;
      const anchoImg = Math.min(ancho, (imagen.width / imagen.height) * alturaImg);
      pagina.drawImage(imagen, { x, y: yFirma - alturaImg + 10, width: anchoImg, height: alturaImg });
      yFirma -= alturaImg - 2;
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
