import nodemailer from "nodemailer";
import { supabase } from "../config/supabase.js";
import { TIPOS_SIN_SYS_HIGEA } from "./tiposSolicitud.js";

// Dos formas de enviar, según lo que haya en .env (gana SMTP si están ambas):
//
// - SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS), pensado para Gmail con contraseña de
//   aplicación en el servidor propio del hospital. Gmail exige que el
//   remitente sea la misma cuenta (o un alias verificado de ella).
// - Resend (RESEND_API_KEY). Se usó en Render porque su plan gratuito reinicia
//   el contenedor por inactividad y eso cortaba a medias la conexión TCP de
//   SMTP; Resend envía en una sola petición HTTPS. Exige un dominio propio
//   verificado para escribirle a cualquier destinatario.
const RESEND_URL = "https://api.resend.com/emails";
const SMTP_CONFIGURADO = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const REMITENTE =
  process.env.MAIL_FROM ||
  process.env.RESEND_FROM ||
  (SMTP_CONFIGURADO ? `Mesa de ayuda SYS HIGEA <${process.env.SMTP_USER}>` : "Mesa de ayuda SYS HIGEA <onboarding@resend.dev>");

let transporteSmtp = null;
function smtp() {
  if (!transporteSmtp) {
    const puerto = Number(process.env.SMTP_PORT || 465);
    transporteSmtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: puerto,
      secure: puerto === 465, // 465 = TLS directo; 587 = STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Sin estos límites una conexión colgada dejaría la promesa pendiente
      // indefinidamente (el envío corre en segundo plano, pero se acumularía).
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }
  return transporteSmtp;
}

async function enviarPorResend(correos, asunto, textoPlano) {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: REMITENTE, to: correos, subject: asunto, text: textoPlano }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
}

export async function enviarCorreo(destinatarios, asunto, textoPlano) {
  const correos = [...new Set((destinatarios || []).filter(Boolean))];
  if (!correos.length) return;
  if (!SMTP_CONFIGURADO && !process.env.RESEND_API_KEY) {
    console.warn(`[correo] sin SMTP ni RESEND_API_KEY configurados, se omite: "${asunto}" -> ${correos.join(", ")}`);
    return;
  }
  console.log(`[correo] intentando enviar "${asunto}" -> ${correos.join(", ")}`);
  try {
    if (SMTP_CONFIGURADO) {
      await smtp().sendMail({ from: REMITENTE, to: correos, subject: asunto, text: textoPlano });
    } else {
      await enviarPorResend(correos, asunto, textoPlano);
    }
    console.log(`[correo] enviado OK: "${asunto}"`);
  } catch (e) {
    // Un correo que falla nunca debe revertir ni bloquear la transición del ticket.
    console.error(`[correo] error enviando "${asunto}":`, e.message);
  }
}

export async function correosConPermiso(clavePermiso) {
  const { data: permiso, error: e1 } = await supabase.from("permisos").select("id").eq("clave", clavePermiso).single();
  if (e1) throw new Error(`consultando permiso '${clavePermiso}': ${e1.message}`);
  if (!permiso) return [];
  const { data: roles, error: e2 } = await supabase.from("rol_permisos").select("rol_id").eq("permiso_id", permiso.id);
  if (e2) throw new Error(`consultando rol_permisos: ${e2.message}`);
  const rolIds = (roles || []).map((r) => r.rol_id);
  if (!rolIds.length) return [];
  const { data: usuarios, error: e3 } = await supabase.from("usuarios").select("email, activo").in("rol_id", rolIds).eq("activo", true);
  if (e3) throw new Error(`consultando usuarios: ${e3.message}`);
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
  aprobado_coordinador: (code) => `[Mesa de ayuda] Ticket ${code} aprobado por coordinador médico, esperando aprobación de facturación`,
};

// Punto único llamado desde las transiciones de tickets.js. Resuelve destinatarios
// según quién necesita actuar o enterarse en cada estado, y nunca lanza: los
// errores de correo se registran y se ignoran (ver enviarCorreo).
export async function notificarTransicion(evento, ticket, solicitanteEmail) {
  try {
    const asunto = ASUNTOS[evento]?.(ticket.code);
    if (!asunto) return;
    const cuerpo = `Ticket ${ticket.code} (${ticket.tipo}) — ${ticket.firmante}\n\nEstado actual: ${ticket.estado}\n\nIngresa a la Mesa de ayuda SYS HIGEA para ver el detalle.`;

    let destinatarios = [];
    if (evento === "creado") {
      // Un ticket radicado por un médico espera primero al coordinador médico,
      // no a supervisora — mismo criterio que usa tickets.js para decidir
      // etapa_aprobacion al crear el ticket.
      destinatarios = await correosConPermiso(
        ticket.etapa_aprobacion === "coordinador_medico" ? "tickets.aprobar_coordinador" : "tickets.aprobar",
      );
    } else if (evento === "aprobado_coordinador") {
      destinatarios = await correosConPermiso("tickets.aprobar");
    } else if (evento === "aprobado") {
      destinatarios = [...(await correosConPermiso("tickets.tomar")), solicitanteEmail];
    } else if (evento === "reabierto") {
      // Eliminación de factura ambulatoria nunca llega a SYS HIGEA: al
      // reabrirse vuelve a quedar "devuelto" (ver tickets.js), así que quien
      // debe enterarse es la supervisora, no SYS HIGEA.
      destinatarios = [
        ...(await correosConPermiso(TIPOS_SIN_SYS_HIGEA.has(ticket.tipo) ? "tickets.aprobar" : "tickets.tomar")),
        solicitanteEmail,
      ];
    } else if (evento === "devuelto" || evento === "requiere_info" || evento === "cerrado") {
      destinatarios = [solicitanteEmail];
    } else if (evento === "respondido") {
      destinatarios = await correosConPermiso("tickets.cerrar");
    }

    await enviarCorreo(destinatarios, asunto, cuerpo);
  } catch (e) {
    // Resolver destinatarios (consultas a permisos/rol_permisos/usuarios) puede
    // fallar por motivos ajenos al envío en sí; se registra en vez de perderse
    // en silencio, pero tampoco debe tumbar la transición del ticket.
    console.error(`[correo] error resolviendo destinatarios para "${evento}":`, e.message);
  }
}
