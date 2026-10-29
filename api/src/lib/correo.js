import nodemailer from "nodemailer";
import { supabase } from "../config/supabase.js";

// Configuración perezosa: si SMTP_USER/SMTP_PASS no están puestos (ambiente local,
// o antes de que el administrador configure la cuenta de Gmail), el envío simplemente
// se omite en silencio — nunca debe tumbar una transición de ticket por un correo.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function enviarCorreo(destinatarios, asunto, textoPlano) {
  const correos = [...new Set((destinatarios || []).filter(Boolean))];
  if (!correos.length) return;
  const t = getTransporter();
  if (!t) {
    console.warn(`[correo] SMTP no configurado, se omite: "${asunto}" -> ${correos.join(", ")}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"Mesa de ayuda SYS HIGEA" <${process.env.SMTP_USER}>`,
      to: correos,
      subject: asunto,
      text: textoPlano,
    });
  } catch (e) {
    // Un correo que falla nunca debe revertir ni bloquear la transición del ticket.
    console.error(`[correo] error enviando "${asunto}":`, e.message);
  }
}

async function correosConPermiso(clavePermiso) {
  const { data: permiso } = await supabase.from("permisos").select("id").eq("clave", clavePermiso).single();
  if (!permiso) return [];
  const { data: roles } = await supabase.from("rol_permisos").select("rol_id").eq("permiso_id", permiso.id);
  const rolIds = (roles || []).map((r) => r.rol_id);
  if (!rolIds.length) return [];
  const { data: usuarios } = await supabase.from("usuarios").select("email, activo").in("rol_id", rolIds).eq("activo", true);
  return (usuarios || []).map((u) => u.email);
}

const ASUNTOS = {
  creado: (code) => `[Mesa de ayuda] Nuevo ticket ${code} esperando aprobación`,
  aprobado: (code) => `[Mesa de ayuda] Ticket ${code} aprobado y enviado a SYS HIGEA`,
  devuelto: (code) => `[Mesa de ayuda] Ticket ${code} devuelto para corrección`,
  requiere_info: (code) => `[Mesa de ayuda] SYS HIGEA solicitó información sobre el ticket ${code}`,
  respondido: (code) => `[Mesa de ayuda] Facturación respondió sobre el ticket ${code}`,
  cerrado: (code) => `[Mesa de ayuda] Ticket ${code} cerrado`,
  reabierto: (code) => `[Mesa de ayuda] Ticket ${code} reabierto`,
};

// Punto único llamado desde las transiciones de tickets.js. Resuelve destinatarios
// según quién necesita actuar o enterarse en cada estado, y nunca lanza: los
// errores de correo se registran y se ignoran (ver enviarCorreo).
export async function notificarTransicion(evento, ticket, solicitanteEmail) {
  const asunto = ASUNTOS[evento]?.(ticket.code);
  if (!asunto) return;
  const cuerpo = `Ticket ${ticket.code} (${ticket.tipo}) — ${ticket.firmante}\n\nEstado actual: ${ticket.estado}\n\nIngresa a la Mesa de ayuda SYS HIGEA para ver el detalle.`;

  let destinatarios = [];
  if (evento === "creado") {
    destinatarios = await correosConPermiso("tickets.aprobar");
  } else if (evento === "aprobado" || evento === "reabierto") {
    destinatarios = [...(await correosConPermiso("tickets.tomar")), solicitanteEmail];
  } else if (evento === "devuelto" || evento === "requiere_info" || evento === "cerrado") {
    destinatarios = [solicitanteEmail];
  } else if (evento === "respondido") {
    destinatarios = await correosConPermiso("tickets.cerrar");
  }

  await enviarCorreo(destinatarios, asunto, cuerpo);
}
