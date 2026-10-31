import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import multer from "multer";
import { randomUUID } from "crypto";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { hashItems } from "../lib/hash.js";
import { calcularSla } from "../lib/sla.js";
import { construirExcelTickets } from "../lib/excel.js";
import { notificarTransicion } from "../lib/correo.js";
import { construirOficioPdf } from "../lib/oficio.js";

const BUCKET = "adjuntos";
const TIPOS_OFICIO_PERMITIDOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const ticketsRouter = conManejoAsync(Router());
ticketsRouter.use(authenticate);

// La clave del tipo no dice nada por sí sola (la administradora la puede renombrar);
// la pregunta "¿este tipo necesita factura?" se responde consultando el catálogo,
// nunca comparando contra un string fijo como "hc".
// Documento: solo dígitos (cédula/RC/TI), 5 a 15 caracteres. Factura: alfanumérico
// con guiones opcionales (cubre prefijos tipo FEV-, CAP-, consecutivos puros, etc.),
// 4 a 20 caracteres. No intentan validar contra el número real del paciente/la
// factura (esto no se concilia con la historia clínica), solo rechazan basura obvia
// como "x" o "123" sueltos.
const FORMATO_DOCUMENTO = /^\d{5,15}$/;
const FORMATO_FACTURA = /^[A-Za-z0-9-]{4,20}$/;

const ETIQUETA_CAMPO = {
  factura: "el número de factura",
  paciente: "el nombre del paciente",
  documento: "el número de documento del paciente",
  cups: "el CUPS o folio",
  fecha: "la fecha",
  motivo: "un motivo",
  descripcion: "una descripción",
};

async function validarItems(items, tipo) {
  if (!Array.isArray(items) || items.length === 0) return "Debe incluir al menos un registro";
  const { data: tipoRow, error } = await supabase
    .from("tipos_solicitud")
    .select("campos_obligatorios")
    .eq("clave", tipo)
    .maybeSingle();
  // Sin este chequeo, un fallo de la consulta se reportaba como "tipo no existe" (400).
  if (error) throw new Error(`consultando tipo de solicitud '${tipo}': ${error.message}`);
  if (!tipoRow) return `Tipo de solicitud '${tipo}' no existe`;
  // Cada tipo decide cuáles de los 7 campos son obligatorios (ej. historia
  // clínica no tiene número de factura) — administrable en Administración →
  // Tipos de solicitud. Un campo no marcado obligatorio igual se valida en
  // formato si trae algo, solo no se exige que venga lleno.
  const obligatorios = new Set(Array.isArray(tipoRow.campos_obligatorios) ? tipoRow.campos_obligatorios : []);

  for (const item of items) {
    for (const campo of Object.keys(ETIQUETA_CAMPO)) {
      if (obligatorios.has(campo) && !item[campo]?.toString().trim()) {
        return `Cada registro requiere ${ETIQUETA_CAMPO[campo]}`;
      }
    }
    if (item.documento?.trim() && !FORMATO_DOCUMENTO.test(item.documento.trim())) {
      return "El documento debe contener solo números (5 a 15 dígitos)";
    }
    if (item.factura?.trim() && !FORMATO_FACTURA.test(item.factura.trim())) {
      return "La factura debe tener entre 4 y 20 caracteres alfanuméricos (se permiten guiones)";
    }
  }
  return null;
}

async function subirOficio(ticketId, archivo, subidoPor) {
  if (!TIPOS_OFICIO_PERMITIDOS.includes(archivo.mimetype)) {
    throw Object.assign(new Error("Tipo de archivo no permitido (solo PDF, PNG, JPEG, WEBP)"), { status: 400 });
  }
  const storagePath = `${ticketId}/${randomUUID()}-${archivo.originalname}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, archivo.buffer, { contentType: archivo.mimetype });
  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase.from("ticket_adjuntos").insert({
    ticket_id: ticketId,
    storage_path: storagePath,
    nombre_original: archivo.originalname,
    tipo_mime: archivo.mimetype,
    tamano_bytes: archivo.size,
    kind: "oficio",
    subido_por: subidoPor,
  });
  if (dbError) throw dbError;
}

// Código trazable: AAAAMMDDHHmm + código interno (3 dígitos) de quien radica,
// ej. 202610282225101 = 28/oct/2026 10:25pm, facturador 101. Se arma con la
// hora exacta del intento, así que si el mismo facturador radica dos tickets
// en el mismo minuto el código choca contra la restricción unique de
// tickets.code; en ese caso se reintenta (esperando a que cambie el minuto)
// en vez de usar un contador separado.
function codigoTicketAhora(codigoInterno) {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const marca = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}`;
  return `${marca}${codigoInterno}`;
}

async function insertarTicketConCodigoUnico(datosTicket, codigoInterno) {
  const MAX_INTENTOS = 65; // cubre hasta ~65s de espera si el minuto está muy disputado
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const code = codigoTicketAhora(codigoInterno);
    const { data, error } = await supabase
      .from("tickets")
      .insert({ ...datosTicket, code })
      .select()
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No se pudo generar un código de ticket único, intente de nuevo");
}

async function registrarEvento(ticketId, tipoEvento, estadoAnterior, estadoNuevo, por, texto) {
  const { error } = await supabase.from("ticket_eventos").insert({
    ticket_id: ticketId,
    tipo_evento: tipoEvento,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    por,
    texto,
  });
  if (error) throw error;
}

async function cargarTicketCompleto(id) {
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("*, solicitante:usuarios!tickets_solicitante_id_fkey(nombre, email), asignado:usuarios!tickets_asignado_a_fkey(id, nombre)")
    .eq("id", id)
    .single();
  // PGRST116 = no existe; 22P02 = id con formato inválido (no es uuid). Ambos son
  // un 404 legítimo. Cualquier otro error es un fallo real de la consulta.
  if (error && error.code !== "PGRST116" && error.code !== "22P02") {
    throw new Error(`cargando ticket ${id}: ${error.message}`);
  }
  if (!ticket) return null;
  // Estos errores no se pueden ignorar: con items vacíos por un fallo de lectura,
  // aprobar guardaría el hash de una lista vacía y cerrar rechazaría el ticket
  // diciendo que los registros cambiaron.
  const { data: items, error: itemsError } = await supabase.from("ticket_items").select("*").eq("ticket_id", id);
  if (itemsError) throw new Error(`cargando items del ticket ${id}: ${itemsError.message}`);
  const { data: eventos, error: eventosError } = await supabase
    .from("ticket_eventos")
    .select("*, usuario:usuarios!ticket_eventos_por_fkey(nombre)")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  if (eventosError) throw new Error(`cargando eventos del ticket ${id}: ${eventosError.message}`);
  // Puede haber hasta dos filas por ticket: la del coordinador médico (etapa
  // "coordinador_medico") y la final de supervisora (etapa "final") — ya no es
  // una sola decisión por ticket, así que no se puede usar .maybeSingle() aquí.
  const { data: aprobaciones, error: aprobacionError } = await supabase.from("aprobaciones").select("*").eq("ticket_id", id);
  if (aprobacionError) throw new Error(`cargando aprobaciones del ticket ${id}: ${aprobacionError.message}`);
  const aprobacionFinal = (aprobaciones || []).find((a) => a.etapa === "final") || null;
  const { data: slaConfig, error: slaError } = await supabase.from("sla_config").select("*").eq("prioridad", ticket.prioridad).maybeSingle();
  if (slaError) throw new Error(`cargando SLA '${ticket.prioridad}': ${slaError.message}`);
  const sla = await calcularSla(ticket, eventos || [], slaConfig?.dias_habiles ?? 2);
  return {
    ...ticket,
    items: items || [],
    eventos: eventos || [],
    aprobacion: aprobacionFinal,
    aprobaciones: aprobaciones || [],
    ...sla,
  };
}

// ---------- oficio generado (beta): plantilla + firma de una persona ----------
async function cargarPlantillaTipo(tipoClave) {
  const { data, error } = await supabase.from("tipos_solicitud").select("etiqueta, plantilla_oficio").eq("clave", tipoClave).maybeSingle();
  if (error) throw new Error(`cargando plantilla del tipo ${tipoClave}: ${error.message}`);
  return { etiqueta: data?.etiqueta || tipoClave, plantilla_oficio: data?.plantilla_oficio || null };
}

// La tabla de registros del oficio debe mostrar la etiqueta legible del
// motivo ("Doble facturación"), no la clave cruda guardada en ticket_items
// ("doble_fact") — mismo criterio que ya se usa para el tipo de solicitud.
async function cargarMotivos() {
  const { data, error } = await supabase.from("motivos").select("clave, etiqueta");
  if (error) {
    console.error("[tickets] no se pudo cargar el catálogo de motivos, el oficio mostrará la clave cruda:", error.message);
    return {};
  }
  return Object.fromEntries((data || []).map((m) => [m.clave, m.etiqueta]));
}

// Un ticket radicado por un médico pasa por tres firmas en papel (médico →
// coordinador médico → supervisora de facturación); uno radicado directo por
// facturación nunca pasa por el tramo de coordinador, así que solo lleva dos
// (solicitante → supervisora). Se detecta por si existe una aprobación real
// de la etapa "coordinador_medico" en el historial del ticket.
function aprobacionCoordinador(ticket) {
  return (ticket.aprobaciones || []).find((a) => a.etapa === "coordinador_medico" && a.decision === "aprobado") || null;
}

// Texto fijo del oficio (destinatario, cierre, despedida), configurable desde
// Administración → config_oficio (migración 0018). Si la consulta falla, no
// se bloquea la generación del PDF: oficio.js ya trae un texto por defecto.
async function cargarConfigOficio() {
  const { data, error } = await supabase.from("config_oficio").select("*").eq("id", true).maybeSingle();
  if (error) {
    console.error("[tickets] no se pudo cargar config_oficio, se usa el texto por defecto:", error.message);
    return null;
  }
  return data;
}

// Trae los datos de firma de una persona (solicitante o quien aprueba) junto
// con los bytes reales de su imagen de firma, para embeberla en el PDF — el
// generador no pide una URL firmada, necesita el binario directamente.
async function cargarPersonaFirma(userId) {
  if (!userId) return null;
  const { data: usuario, error } = await supabase
    .from("usuarios")
    .select("nombre, identificacion, cargo, firma_svg")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`cargando datos de firma de ${userId}: ${error.message}`);
  if (!usuario) return null;
  // firma_svg es el trazo vectorial ya calculado al subir la firma (ver
  // lib/firmaVector.js) — no hace falta ir a Storage a buscar una imagen en
  // cada generación del oficio.
  let firma_svg = null;
  if (usuario.firma_svg) {
    try {
      firma_svg = JSON.parse(usuario.firma_svg);
    } catch {
      firma_svg = null;
    }
  }
  return { ...usuario, firma_svg };
}

// ---------- crear ----------
// multipart/form-data: campo "data" = JSON {tipo, prioridad, firmante, observacion, items},
// campo "oficio" = archivo. El oficio firmado es obligatorio para radicar, igual que en el
// flujo original en papel/correo: sin oficio no hay solicitud válida.
ticketsRouter.post("/tickets", requirePermission("tickets.crear"), upload.single("oficio"), async (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.data || "{}");
  } catch {
    return res.status(400).json({ error: "El campo 'data' debe ser JSON válido" });
  }
  const { tipo, prioridad, firmante, observacion, items } = payload;
  if (!tipo || !prioridad || !firmante?.trim()) {
    return res.status(400).json({ error: "Faltan campos obligatorios (tipo, prioridad, firmante)" });
  }
  if (!req.user.codigo_interno) {
    return res
      .status(400)
      .json({ error: "Tu usuario no tiene código interno asignado. Pide al administrador que te lo asigne en Administración → Usuarios." });
  }
  const errorItems = await validarItems(items, tipo);
  if (errorItems) return res.status(400).json({ error: errorItems });

  // Beta: si la cuenta tiene firma digital habilitada y la persona confirmó
  // explícitamente su firma en el modal "Firmar oficio" antes de radicar, el
  // oficio generado automáticamente (con esa firma ya estampada) reemplaza al
  // adjunto manual — ya no hace falta subir también un PDF escaneado. Sin esa
  // confirmación, el adjunto manual sigue siendo obligatorio como siempre.
  const firmaConfirmada = req.user.beta_firma_oficio && payload.firmaConfirmada === true;
  if (!req.file && !firmaConfirmada) {
    return res.status(400).json({ error: "Debe adjuntar el oficio firmado, o confirmar su firma digital, para radicar el ticket" });
  }

  // Solo el rol "médico" pasa primero por un coordinador médico; facturador (y
  // cualquier otro rol) sigue el flujo de siempre: directo a supervisora.
  const etapaAprobacion = req.user.rol === "medico" ? "coordinador_medico" : null;

  let ticket;
  try {
    ticket = await insertarTicketConCodigoUnico(
      {
        tipo,
        prioridad,
        estado: "pendiente",
        etapa_aprobacion: etapaAprobacion,
        solicitante_id: req.user.id,
        firmante: firmante.trim(),
        observacion: observacion || null,
        enviado_at: new Date().toISOString(),
        firma_solicitante_at: firmaConfirmada ? new Date().toISOString() : null,
      },
      req.user.codigo_interno,
    );
  } catch (e) {
    console.error(`[tickets] error insertando ticket de ${req.user.id}:`, e.message);
    return res.status(500).json({ error: e.message });
  }

  const { error: itemsError } = await supabase
    .from("ticket_items")
    .insert(items.map((item) => ({ ...item, ticket_id: ticket.id })));
  if (itemsError) {
    console.error(`[tickets] error insertando items del ticket ${ticket.code}:`, itemsError.message);
    return res.status(500).json({ error: itemsError.message });
  }

  if (req.file) {
    try {
      await subirOficio(ticket.id, req.file, req.user.id);
    } catch (e) {
      if (!e.status) console.error(`[tickets] error subiendo oficio del ticket ${ticket.code}:`, e.message);
      return res.status(e.status || 500).json({ error: e.message });
    }
  }

  const textoCreado = firmaConfirmada
    ? [observacion, "Firma de solicitante confirmada."].filter(Boolean).join(" — ")
    : observacion || null;
  await registrarEvento(ticket.id, "creado", null, "pendiente", req.user.id, textoCreado);
  const completo = await cargarTicketCompleto(ticket.id);
  notificarTransicion("creado", completo, req.user.email).catch(() => {});
  res.status(201).json(completo);
});

// ---------- editar (solo mientras está pendiente o devuelto) ----------
// El solicitante corrige lo que la supervisora le pidió, o la supervisora corrige
// directamente un ticket devuelto ("Corregir yo misma" del flujo original). En
// ambos casos el ticket vuelve a 'pendiente' para pasar de nuevo por aprobación:
// no existe un camino que salte la aprobación al editar.
ticketsRouter.patch("/tickets/:id", upload.single("oficio"), async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  const esSolicitante = ticket.solicitante_id === req.user.id && req.user.permisos.has("tickets.crear");
  const esSupervisora = req.user.permisos.has("tickets.aprobar");
  if (!esSolicitante && !esSupervisora) {
    return res.status(403).json({ error: "No tiene permiso para editar este ticket" });
  }
  if (!["pendiente", "devuelto"].includes(ticket.estado)) {
    return res.status(409).json({ error: `El ticket está en '${ticket.estado}', no se puede editar` });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.data || "{}");
  } catch {
    return res.status(400).json({ error: "El campo 'data' debe ser JSON válido" });
  }
  const { tipo, prioridad, firmante, observacion, items } = payload;
  if (!tipo || !prioridad || !firmante?.trim()) {
    return res.status(400).json({ error: "Faltan campos obligatorios (tipo, prioridad, firmante)" });
  }
  const errorItems = await validarItems(items, tipo);
  if (errorItems) return res.status(400).json({ error: errorItems });

  const { error: deleteError } = await supabase.from("ticket_items").delete().eq("ticket_id", ticket.id);
  if (deleteError) return res.status(500).json({ error: deleteError.message });
  const { error: insertError } = await supabase
    .from("ticket_items")
    .insert(items.map((item) => ({ ...item, ticket_id: ticket.id })));
  if (insertError) return res.status(500).json({ error: insertError.message });

  if (req.file) {
    try {
      await subirOficio(ticket.id, req.file, req.user.id);
    } catch (e) {
      if (!e.status) console.error(`[tickets] error subiendo oficio del ticket ${ticket.code}:`, e.message);
      return res.status(e.status || 500).json({ error: e.message });
    }
  }

  const estadoAnterior = ticket.estado;
  const { error } = await supabase
    .from("tickets")
    .update({
      tipo,
      prioridad,
      firmante: firmante.trim(),
      observacion: observacion || null,
      estado: "pendiente",
      updated_at: new Date().toISOString(),
    })
    .eq("id", ticket.id);
  if (error) return res.status(500).json({ error: error.message });

  await registrarEvento(
    ticket.id,
    "editado",
    estadoAnterior,
    "pendiente",
    req.user.id,
    req.body.nota?.trim() || "Ticket corregido y reenviado a aprobación"
  );
  res.json(await cargarTicketCompleto(ticket.id));
});

// Estados que existen antes de que la supervisora apruebe. Un rol que ve "todos" los
// tickets pero no puede aprobarlos (ej. SYS HIGEA) no debe poder leerlos en este tramo,
// ni siquiera llamando la API directo: la UI los oculta con filtros, pero eso no es
// una regla de seguridad. Minimización de datos real, no solo de presentación.
const ESTADOS_PRE_APROBACION = ["pendiente", "devuelto"];

function puedeVerEstadosPreAprobacion(user) {
  return (
    user.permisos.has("tickets.aprobar") ||
    user.permisos.has("tickets.devolver") ||
    user.permisos.has("tickets.aprobar_coordinador") ||
    user.permisos.has("tickets.devolver_coordinador")
  );
}

function filtrarVisibles(tickets, user) {
  if (puedeVerEstadosPreAprobacion(user)) return tickets;
  // Quien radicó el ticket siempre puede verlo y hacerle seguimiento, sin
  // importar el estado — la misma excepción que ya aplica GET /tickets/:id.
  return tickets.filter((t) => !ESTADOS_PRE_APROBACION.includes(t.estado) || t.solicitante_id === user.id);
}

// ---------- listar ----------
ticketsRouter.get("/tickets", async (req, res) => {
  let query = supabase.from("tickets").select("*").order("created_at", { ascending: false });
  if (!req.user.permisos.has("tickets.ver_todos")) {
    query = query.eq("solicitante_id", req.user.id);
  }
  const { data: tickets, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const visibles = filtrarVisibles(tickets, req.user);
  const completos = await Promise.all(visibles.map((t) => cargarTicketCompleto(t.id)));
  res.json(completos);
});

// ---------- exportar a Excel ----------
// Mismo filtro de visibilidad que el listado (filtrarVisibles / ver_propios vs
// ver_todos): el informe nunca muestra a alguien más de lo que ya podría ver en la app.
ticketsRouter.get("/tickets/exportar", requirePermission("reportes.exportar"), async (req, res) => {
  let query = supabase.from("tickets").select("*").order("created_at", { ascending: false });
  if (!req.user.permisos.has("tickets.ver_todos")) {
    query = query.eq("solicitante_id", req.user.id);
  }
  if (req.query.desde) query = query.gte("created_at", req.query.desde);
  if (req.query.hasta) query = query.lte("created_at", req.query.hasta);

  const { data: tickets, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const visibles = filtrarVisibles(tickets, req.user);
  const completos = await Promise.all(visibles.map((t) => cargarTicketCompleto(t.id)));

  const buffer = await construirExcelTickets(completos);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(buffer));
});

// ---------- detalle ----------
ticketsRouter.get("/tickets/:id", async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  if (!req.user.permisos.has("tickets.ver_todos") && ticket.solicitante_id !== req.user.id) {
    return res.status(403).json({ error: "No tiene permiso para ver este ticket" });
  }
  if (
    ticket.solicitante_id !== req.user.id &&
    !puedeVerEstadosPreAprobacion(req.user) &&
    ESTADOS_PRE_APROBACION.includes(ticket.estado)
  ) {
    return res.status(403).json({ error: "No tiene permiso para ver este ticket" });
  }
  res.json(ticket);
});

// ---------- oficio generado (beta) ----------
// Se genera al vuelo en los dos endpoints de abajo — nunca se guarda en
// Storage, así que no cuenta contra el almacenamiento del plan. Requiere el
// mismo acceso que ver el ticket (o, para la vista previa al radicar, que el
// ticket todavía no exista).
ticketsRouter.post("/tickets/preview-oficio", requirePermission("tickets.crear"), async (req, res) => {
  const { tipo, firmante, observacion, items } = req.body || {};
  if (!tipo || !firmante?.trim() || !Array.isArray(items)) {
    return res.status(400).json({ error: "Faltan datos para generar la vista previa (tipo, firmante, items)" });
  }
  const { etiqueta, plantilla_oficio } = await cargarPlantillaTipo(tipo);
  const solicitante = await cargarPersonaFirma(req.user.id);
  const configOficio = await cargarConfigOficio();
  const motivos = await cargarMotivos();
  const itemsConMotivoLegible = items.map((item) => ({ ...item, motivo: motivos[item.motivo] || item.motivo }));
  const ticketSimulado = {
    code: "VISTA PREVIA",
    created_at: new Date().toISOString(),
    firmante: firmante.trim(),
    observacion: observacion || "",
    firma_solicitante_at: req.user.beta_firma_oficio ? new Date().toISOString() : null,
    firma_aprobador_at: null,
  };
  const pdf = await construirOficioPdf({
    ticket: ticketSimulado,
    tipoEtiqueta: etiqueta,
    plantilla: plantilla_oficio,
    items: itemsConMotivoLegible,
    solicitante,
    aprobador: null,
    configOficio,
  });
  res.set("Content-Type", "application/pdf");
  res.send(pdf);
});

ticketsRouter.get("/tickets/:id/oficio-generado.pdf", async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  if (!req.user.permisos.has("tickets.ver_todos") && ticket.solicitante_id !== req.user.id) {
    return res.status(403).json({ error: "No tiene permiso para ver este ticket" });
  }
  const { etiqueta, plantilla_oficio } = await cargarPlantillaTipo(ticket.tipo);
  const solicitante = await cargarPersonaFirma(ticket.solicitante_id);
  const aprobacionCoord = aprobacionCoordinador(ticket);
  const coordinador = aprobacionCoord ? await cargarPersonaFirma(aprobacionCoord.decidido_por) : undefined;
  const decididoPorFinal = ticket.aprobacion?.decidido_por || null;
  const aprobador = await cargarPersonaFirma(decididoPorFinal);
  // Si quien radicó el ticket es la misma persona que lo aprobó (p.ej. una
  // supervisora que crea su propia solicitud), es una sola firma física — no
  // tiene sentido mostrarla dos veces. Nunca pasa si hubo tramo de
  // coordinador médico (ese tramo exige que sea otra persona).
  const firmaUnica = !aprobacionCoord && Boolean(decididoPorFinal) && decididoPorFinal === ticket.solicitante_id;
  const configOficio = await cargarConfigOficio();
  const motivos = await cargarMotivos();
  const itemsConMotivoLegible = (ticket.items || []).map((item) => ({ ...item, motivo: motivos[item.motivo] || item.motivo }));
  const pdf = await construirOficioPdf({
    ticket: { ...ticket, firma_coordinador_at: aprobacionCoord ? ticket.firma_coordinador_at : null },
    tipoEtiqueta: etiqueta,
    plantilla: plantilla_oficio,
    items: itemsConMotivoLegible,
    solicitante,
    coordinador,
    aprobador,
    firmaUnica,
    configOficio,
  });
  res.set("Content-Type", "application/pdf");
  if (req.query.descargar) {
    res.set("Content-Disposition", `attachment; filename="oficio-${ticket.code}.pdf"`);
  }
  res.send(pdf);
});

// ---------- eliminar (irreversible) ----------
ticketsRouter.delete("/tickets/:id", requirePermission("tickets.eliminar"), async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });

  const { data: adjuntos, error: adjError } = await supabase
    .from("ticket_adjuntos")
    .select("storage_path")
    .eq("ticket_id", ticket.id);
  if (adjError) return res.status(500).json({ error: adjError.message });
  if (adjuntos?.length) {
    const { error: rmError } = await supabase.storage.from("adjuntos").remove(adjuntos.map((a) => a.storage_path));
    // Si falla el borrado del archivo, los adjuntos quedan huérfanos en Storage
    // pero no bloquean la eliminación del ticket en sí: se registra y se sigue.
    if (rmError) console.error(`[tickets] no se pudieron retirar adjuntos del ticket ${ticket.id} antes de eliminarlo:`, rmError.message);
  }

  const { error } = await supabase.rpc("eliminar_ticket_permanente", { p_ticket_id: ticket.id });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ---------- transiciones ----------

async function transicion(
  req,
  res,
  { permiso, estadosValidos, nuevoEstado, tipoEvento, notaObligatoria, efecto, validar, textoEvento }
) {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  if (!req.user.permisos.has(permiso)) {
    return res.status(403).json({ error: "No tiene permiso para esta acción" });
  }
  if (!estadosValidos.includes(ticket.estado)) {
    return res.status(409).json({ error: `El ticket está en '${ticket.estado}', no se puede aplicar esta acción` });
  }
  const nota = req.body?.nota?.trim();
  if (notaObligatoria && !nota) {
    return res.status(400).json({ error: "Esta acción requiere una nota" });
  }
  if (validar) {
    const errorValidacion = await validar(ticket, req);
    if (errorValidacion) return res.status(409).json({ error: errorValidacion });
  }

  const patch = { estado: nuevoEstado, updated_at: new Date().toISOString() };
  if (efecto) Object.assign(patch, await efecto(ticket, req));

  const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
  if (error) return res.status(500).json({ error: error.message });

  // La mayoría de eventos solo guardan la nota tal cual; "tomar" necesita
  // dejar registrado también qué ingeniero de SYS HIGEA tomó el caso (la
  // cuenta de SYS HIGEA es compartida, no identifica a la persona real),
  // para poder medir efectividad por ingeniero en el historial.
  const textoFinal = textoEvento ? textoEvento(req, nota) : nota || null;
  await registrarEvento(ticket.id, tipoEvento, ticket.estado, nuevoEstado, req.user.id, textoFinal);
  const actualizado = await cargarTicketCompleto(ticket.id);
  notificarTransicion(tipoEvento, actualizado, ticket.solicitante?.email).catch(() => {});
  res.json(actualizado);
}

ticketsRouter.post("/tickets/:id/aprobar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.aprobar",
    estadosValidos: ["pendiente"],
    nuevoEstado: "aprobado",
    tipoEvento: "aprobado",
    notaObligatoria: false,
    async validar(ticket) {
      // Si el ticket lo radicó un médico, primero necesita el visto bueno del
      // coordinador médico (ver POST /tickets/:id/aprobar-coordinador) — una
      // supervisora no puede saltarse ese paso.
      if (ticket.etapa_aprobacion) {
        return "Este ticket requiere primero la aprobación del coordinador médico";
      }
      // El oficio firmado puede ser el adjunto manual de siempre, o (beta) el
      // generado automáticamente con la firma digital del solicitante ya
      // confirmada al radicar — cualquiera de los dos cuenta como "oficio
      // firmado" para poder aprobar.
      if (ticket.firma_solicitante_at) return null;
      const { data: adjuntos, error } = await supabase
        .from("ticket_adjuntos")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("kind", "oficio");
      if (error) throw new Error(`consultando oficio del ticket ${ticket.code}: ${error.message}`);
      if (!adjuntos || adjuntos.length === 0) {
        return "No se puede aprobar sin el oficio firmado adjunto";
      }
      return null;
    },
    async efecto(ticket, req) {
      const aprobadoAt = new Date().toISOString();
      const { error } = await supabase.from("aprobaciones").upsert(
        {
          ticket_id: ticket.id,
          etapa: "final",
          decision: "aprobado",
          hash_items: hashItems(ticket.items),
          nota: req.body?.nota || null,
          decidido_por: req.user.id,
        },
        { onConflict: "ticket_id,etapa" },
      );
      if (error) throw error;
      const patch = { aprobado_at: aprobadoAt };
      // Igual que al radicar: beta, coexiste con el oficio adjunto manual, y
      // la firma solo se estampa si la supervisora la confirmó explícitamente
      // en el modal "Firmar oficio".
      if (req.user.beta_firma_oficio && req.body?.firmaConfirmada === true) {
        patch.firma_aprobador_at = aprobadoAt;
      }
      return patch;
    },
    textoEvento(req, nota) {
      if (!(req.user.beta_firma_oficio && req.body?.firmaConfirmada === true)) return nota || null;
      return [nota, "Firma de aprobación confirmada."].filter(Boolean).join(" — ");
    },
  })
);

ticketsRouter.post("/tickets/:id/devolver", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.devolver",
    estadosValidos: ["pendiente"],
    nuevoEstado: "devuelto",
    tipoEvento: "devuelto",
    notaObligatoria: true,
    async validar(ticket) {
      if (ticket.etapa_aprobacion) {
        return "Este ticket requiere primero la revisión del coordinador médico";
      }
      return null;
    },
  })
);

// Primera instancia de aprobación para tickets radicados por un médico: el
// coordinador médico revisa antes de que pase a supervisora de facturación.
// No cambia tickets.estado (sigue "pendiente") — solo libera etapa_aprobacion
// para que el POST /aprobar normal (cualquier supervisora) ya pueda actuar.
ticketsRouter.post("/tickets/:id/aprobar-coordinador", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.aprobar_coordinador",
    estadosValidos: ["pendiente"],
    nuevoEstado: "pendiente",
    tipoEvento: "aprobado_coordinador",
    notaObligatoria: false,
    async validar(ticket) {
      if (ticket.etapa_aprobacion !== "coordinador_medico") {
        return "Este ticket no está pendiente de aprobación del coordinador médico";
      }
      return null;
    },
    async efecto(ticket, req) {
      const { error } = await supabase.from("aprobaciones").upsert(
        {
          ticket_id: ticket.id,
          etapa: "coordinador_medico",
          decision: "aprobado",
          nota: req.body?.nota || null,
          decidido_por: req.user.id,
        },
        { onConflict: "ticket_id,etapa" },
      );
      if (error) throw error;
      const patch = { etapa_aprobacion: null };
      // Mismo criterio que en /aprobar: la firma solo se estampa si el
      // coordinador la confirmó explícitamente en el modal "Firmar oficio".
      // Columna propia (firma_coordinador_at, no firma_aprobador_at): si se
      // reutilizara la de supervisora, una aprobación final posterior con
      // firma confirmada pisaría la del coordinador, y el oficio de un
      // ticket de médico debe mostrar la firma de quien realmente aprueba
      // ese tramo (el coordinador médico, no supervisora — ver oficio.js).
      if (req.user.beta_firma_oficio && req.body?.firmaConfirmada === true) {
        patch.firma_coordinador_at = new Date().toISOString();
      }
      return patch;
    },
    textoEvento(req, nota) {
      const base = nota ? `Aprobado por coordinador médico — ${nota}` : "Aprobado por coordinador médico";
      if (!(req.user.beta_firma_oficio && req.body?.firmaConfirmada === true)) return base;
      return `${base} — Firma de aprobación confirmada.`;
    },
  })
);

ticketsRouter.post("/tickets/:id/devolver-coordinador", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.devolver_coordinador",
    estadosValidos: ["pendiente"],
    nuevoEstado: "devuelto",
    tipoEvento: "devuelto",
    notaObligatoria: true,
    async validar(ticket) {
      if (ticket.etapa_aprobacion !== "coordinador_medico") {
        return "Este ticket no está pendiente de revisión del coordinador médico";
      }
      return null;
    },
    async efecto(ticket, req) {
      const { error } = await supabase.from("aprobaciones").upsert(
        {
          ticket_id: ticket.id,
          etapa: "coordinador_medico",
          decision: "devuelto",
          nota: req.body?.nota || null,
          decidido_por: req.user.id,
        },
        { onConflict: "ticket_id,etapa" },
      );
      if (error) throw error;
      // etapa_aprobacion se deja intacta ("coordinador_medico"): al corregir y
      // reenviar, el ticket vuelve a este mismo paso, no salta a supervisora.
      return {};
    },
  })
);

// Nota: no existe un endpoint "reenviar sin cambios" — el original siempre pasa por el
// formulario de edición al reenviar un ticket devuelto; PATCH /tickets/:id cubre ese caso
// (incluso si el usuario no cambia ningún dato, el reenvío es un PATCH con los mismos valores).

ticketsRouter.post("/tickets/:id/tomar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.tomar",
    estadosValidos: ["aprobado"],
    nuevoEstado: "en_proceso",
    tipoEvento: "tomado",
    notaObligatoria: false,
    async validar(ticket, req) {
      // Defensa extra ante dos clics casi simultáneos: el cambio de estado ya
      // impide tomar un ticket dos veces en circunstancias normales, pero esto
      // deja el motivo explícito en vez de un genérico "estado inválido".
      if (ticket.asignado_a) return "Este ticket ya fue tomado por otro agente";
      // SYS HIGEA atiende con una sola cuenta compartida entre varios
      // ingenieros: asignado_a (el usuario de Auth) no distingue quién de
      // ellos lo gestiona de verdad, así que se pide el nombre explícito.
      if (!req.body?.agente_higea?.trim()) return "Indique qué ingeniero de SYS HIGEA toma el caso";
      return null;
    },
    async efecto(ticket, req) {
      return { asignado_a: req.user.id, agente_higea: req.body.agente_higea.trim() };
    },
    textoEvento(req, nota) {
      const base = `Asignado a ${req.body.agente_higea.trim()}`;
      return nota ? `${base} — ${nota}` : base;
    },
  })
);

// El agente asignado puede soltar el caso sin cerrarlo ni pedir información:
// vuelve a "aprobado" (deshace el tomar) para que cualquier agente de SYS
// HIGEA, incluido el mismo, pueda tomarlo de nuevo. aprobado_at no se toca,
// así que el plazo sigue contando desde la aprobación original, no se reinicia.
ticketsRouter.post("/tickets/:id/liberar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.tomar",
    estadosValidos: ["en_proceso"],
    nuevoEstado: "aprobado",
    tipoEvento: "liberado",
    notaObligatoria: false,
    async validar(ticket, req) {
      if (ticket.asignado_a !== req.user.id) {
        return "Solo el agente asignado puede liberar este ticket";
      }
      return null;
    },
    async efecto() {
      return { asignado_a: null, agente_higea: null };
    },
  })
);

ticketsRouter.post("/tickets/:id/pedir-info", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.pedir_info",
    estadosValidos: ["en_proceso"],
    nuevoEstado: "requiere_info",
    tipoEvento: "requiere_info",
    notaObligatoria: true,
    async validar(ticket, req) {
      if (ticket.asignado_a && ticket.asignado_a !== req.user.id) {
        return "Este ticket está asignado a otro agente de SYS HIGEA";
      }
      return null;
    },
  })
);

ticketsRouter.post("/tickets/:id/responder-info", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.responder_info",
    estadosValidos: ["requiere_info"],
    nuevoEstado: "en_proceso",
    tipoEvento: "respondido",
    notaObligatoria: true,
  })
);

ticketsRouter.post("/tickets/:id/cerrar", async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado" });
  if (!req.user.permisos.has("tickets.cerrar")) {
    return res.status(403).json({ error: "No tiene permiso para esta acción" });
  }
  if (ticket.estado !== "en_proceso") {
    return res.status(409).json({ error: `El ticket está en '${ticket.estado}', no se puede cerrar` });
  }
  if (ticket.asignado_a && ticket.asignado_a !== req.user.id) {
    return res.status(409).json({ error: "Este ticket está asignado a otro agente de SYS HIGEA" });
  }
  if (!ticket.aprobacion || hashItems(ticket.items) !== ticket.aprobacion.hash_items) {
    return res.status(409).json({
      error: "Los registros del ticket cambiaron después de la aprobación; requiere nueva aprobación antes de cerrarse",
    });
  }
  const nota = req.body?.nota?.trim();
  if (!nota) return res.status(400).json({ error: "Cerrar un ticket requiere una nota" });

  const { count: evidencias, error: evidenciaError } = await supabase
    .from("ticket_adjuntos")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticket.id)
    .eq("kind", "evidencia");
  if (evidenciaError) return res.status(500).json({ error: evidenciaError.message });
  if (!evidencias) {
    return res.status(400).json({
      error: "Cerrar un ticket requiere adjuntar la evidencia de SYS HIGEA (pantallazo de la solución)",
    });
  }

  const { error } = await supabase
    .from("tickets")
    .update({ estado: "cerrado", cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", ticket.id);
  if (error) return res.status(500).json({ error: error.message });

  // "por" en el evento es la cuenta compartida de SYS HIGEA, no la persona —
  // ticket.agente_higea sí identifica a quién cerró el caso realmente.
  const textoCierre = ticket.agente_higea ? `Cerrado por ${ticket.agente_higea} — ${nota}` : nota;
  await registrarEvento(ticket.id, "cerrado", ticket.estado, "cerrado", req.user.id, textoCierre);
  const actualizado = await cargarTicketCompleto(ticket.id);
  notificarTransicion("cerrado", actualizado, ticket.solicitante?.email).catch(() => {});
  res.json(actualizado);
});

ticketsRouter.post("/tickets/:id/reabrir", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.reabrir",
    estadosValidos: ["cerrado"],
    nuevoEstado: "en_proceso",
    tipoEvento: "reabierto",
    notaObligatoria: true,
    async efecto() {
      return { cerrado_at: null };
    },
  })
);
