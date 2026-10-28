import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { hashItems } from "../lib/hash.js";
import { calcularSla } from "../lib/sla.js";

export const ticketsRouter = Router();
ticketsRouter.use(authenticate);

function newCode() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `TK-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${rand}`;
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
  const { data: ticket, error } = await supabase.from("tickets").select("*").eq("id", id).single();
  if (error || !ticket) return null;
  const { data: items } = await supabase.from("ticket_items").select("*").eq("ticket_id", id);
  const { data: eventos } = await supabase
    .from("ticket_eventos")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });
  const { data: aprobacion } = await supabase.from("aprobaciones").select("*").eq("ticket_id", id).maybeSingle();
  const { data: slaConfig } = await supabase.from("sla_config").select("*").eq("prioridad", ticket.prioridad).single();
  const sla = await calcularSla(ticket, eventos || [], slaConfig?.dias_habiles ?? 2);
  return { ...ticket, items: items || [], eventos: eventos || [], aprobacion: aprobacion || null, ...sla };
}

// ---------- crear ----------
ticketsRouter.post("/tickets", requirePermission("tickets.crear"), async (req, res) => {
  const { tipo, prioridad, observacion, items } = req.body;
  if (!tipo || !prioridad || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Faltan campos obligatorios (tipo, prioridad, items)" });
  }
  for (const item of items) {
    if (!item.motivo) return res.status(400).json({ error: "Cada registro requiere un motivo" });
  }

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      code: newCode(),
      tipo,
      prioridad,
      estado: "pendiente",
      solicitante_id: req.user.id,
      observacion: observacion || null,
      enviado_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const { error: itemsError } = await supabase
    .from("ticket_items")
    .insert(items.map((item) => ({ ...item, ticket_id: ticket.id })));
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  await registrarEvento(ticket.id, "creado", null, "pendiente", req.user.id, observacion || null);
  res.status(201).json(await cargarTicketCompleto(ticket.id));
});

// ---------- listar ----------
ticketsRouter.get("/tickets", async (req, res) => {
  let query = supabase.from("tickets").select("*").order("created_at", { ascending: false });
  if (!req.user.permisos.has("tickets.ver_todos")) {
    query = query.eq("solicitante_id", req.user.id);
  }
  const { data: tickets, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const completos = await Promise.all(tickets.map((t) => cargarTicketCompleto(t.id)));
  res.json(completos);
});

// ---------- detalle ----------
ticketsRouter.get("/tickets/:id", async (req, res) => {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Tiquete no encontrado" });
  if (!req.user.permisos.has("tickets.ver_todos") && ticket.solicitante_id !== req.user.id) {
    return res.status(403).json({ error: "No tiene permiso para ver este tiquete" });
  }
  res.json(ticket);
});

// ---------- transiciones ----------

async function transicion(
  req,
  res,
  { permiso, estadosValidos, nuevoEstado, tipoEvento, notaObligatoria, efecto, validar }
) {
  const ticket = await cargarTicketCompleto(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Tiquete no encontrado" });
  if (!req.user.permisos.has(permiso)) {
    return res.status(403).json({ error: "No tiene permiso para esta acción" });
  }
  if (!estadosValidos.includes(ticket.estado)) {
    return res.status(409).json({ error: `El tiquete está en '${ticket.estado}', no se puede aplicar esta acción` });
  }
  const nota = req.body?.nota?.trim();
  if (notaObligatoria && !nota) {
    return res.status(400).json({ error: "Esta acción requiere una nota" });
  }
  if (validar) {
    const errorValidacion = await validar(ticket);
    if (errorValidacion) return res.status(409).json({ error: errorValidacion });
  }

  const patch = { estado: nuevoEstado, updated_at: new Date().toISOString() };
  if (efecto) Object.assign(patch, await efecto(ticket, req));

  const { error } = await supabase.from("tickets").update(patch).eq("id", ticket.id);
  if (error) return res.status(500).json({ error: error.message });

  await registrarEvento(ticket.id, tipoEvento, ticket.estado, nuevoEstado, req.user.id, nota || null);
  res.json(await cargarTicketCompleto(ticket.id));
}

ticketsRouter.post("/tickets/:id/aprobar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.aprobar",
    estadosValidos: ["pendiente"],
    nuevoEstado: "aprobado",
    tipoEvento: "aprobado",
    notaObligatoria: false,
    async validar(ticket) {
      const { data: adjuntos } = await supabase
        .from("ticket_adjuntos")
        .select("id")
        .eq("ticket_id", ticket.id)
        .eq("kind", "oficio");
      if (!adjuntos || adjuntos.length === 0) {
        return "No se puede aprobar sin el oficio firmado adjunto";
      }
      return null;
    },
    async efecto(ticket, req) {
      const aprobadoAt = new Date().toISOString();
      const { error } = await supabase.from("aprobaciones").upsert({
        ticket_id: ticket.id,
        decision: "aprobado",
        hash_items: hashItems(ticket.items),
        nota: req.body?.nota || null,
        decidido_por: req.user.id,
      });
      if (error) throw error;
      return { aprobado_at: aprobadoAt };
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
  })
);

ticketsRouter.post("/tickets/:id/reenviar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.crear",
    estadosValidos: ["devuelto"],
    nuevoEstado: "pendiente",
    tipoEvento: "reenviado",
    notaObligatoria: false,
  })
);

ticketsRouter.post("/tickets/:id/tomar", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.tomar",
    estadosValidos: ["aprobado"],
    nuevoEstado: "en_proceso",
    tipoEvento: "tomado",
    notaObligatoria: false,
  })
);

ticketsRouter.post("/tickets/:id/pedir-info", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.pedir_info",
    estadosValidos: ["en_proceso"],
    nuevoEstado: "requiere_info",
    tipoEvento: "requiere_info",
    notaObligatoria: true,
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
  if (!ticket) return res.status(404).json({ error: "Tiquete no encontrado" });
  if (!req.user.permisos.has("tickets.cerrar")) {
    return res.status(403).json({ error: "No tiene permiso para esta acción" });
  }
  if (ticket.estado !== "en_proceso") {
    return res.status(409).json({ error: `El tiquete está en '${ticket.estado}', no se puede cerrar` });
  }
  if (!ticket.aprobacion || hashItems(ticket.items) !== ticket.aprobacion.hash_items) {
    return res.status(409).json({
      error: "Los registros del tiquete cambiaron después de la aprobación; requiere nueva aprobación antes de cerrarse",
    });
  }
  const nota = req.body?.nota?.trim();
  if (!nota) return res.status(400).json({ error: "Cerrar un tiquete requiere una nota" });

  const { error } = await supabase
    .from("tickets")
    .update({ estado: "cerrado", cerrado_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", ticket.id);
  if (error) return res.status(500).json({ error: error.message });

  await registrarEvento(ticket.id, "cerrado", ticket.estado, "cerrado", req.user.id, nota);
  res.json(await cargarTicketCompleto(ticket.id));
});

ticketsRouter.post("/tickets/:id/reabrir", (req, res) =>
  transicion(req, res, {
    permiso: "tickets.reabrir",
    estadosValidos: ["cerrado"],
    nuevoEstado: "en_proceso",
    tipoEvento: "reabierto",
    notaObligatoria: true,
  })
);
