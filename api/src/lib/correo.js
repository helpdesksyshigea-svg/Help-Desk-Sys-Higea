import { supabase } from "../config/supabase.js";

// Resend en vez de SMTP/Gmail: se descartó SMTP porque el plan gratuito de
// Render reinicia el contenedor por inactividad y eso corta a medias la
// conexión TCP persistente que SMTP necesita (confirmado en los logs: el
// reinicio ocurrió justo durante el intento de conexión). Resend envía por
// una sola petición HTTPS que se resuelve en menos de un segundo, sin
// depender de mantener una conexión abierta.
const RESEND_URL = "https://api.resend.com/emails";
const REMITENTE = process.env.RESEND_FROM || "Mesa de ayuda SYS HIGEA <onboarding@resend.dev>";

export async function enviarCorreo(destinatarios, asunto, textoPlano) {
  const correos = [...new Set((destinatarios || []).filter(Boolean))];
  if (!correos.length) return;
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[correo] RESEND_API_KEY no configurada, se omite: "${asunto}" -> ${correos.join(", ")}`);
    return;
  }
  console.log(`[correo] intentando enviar "${asunto}" -> ${correos.join(", ")}`);
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: REMITENTE, to: correos, subject: asunto, text: textoPlano }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend respondió ${res.status}: ${body}`);
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
    } else if (evento === "aprobado" || evento === "reabierto") {
      destinatarios = [...(await correosConPermiso("tickets.tomar")), solicitanteEmail];
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
