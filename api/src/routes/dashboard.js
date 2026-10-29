import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { calcularSla, fechaLimiteDe, festivosComo } from "../lib/sla.js";

export const dashboardRouter = conManejoAsync(Router());
dashboardRouter.use(authenticate);

const NOVENTA_DIAS_MS = 90 * 24 * 60 * 60 * 1000;
const ESTADOS_ABIERTOS = ["aprobado", "en_proceso", "requiere_info"];

function horasEntre(a, b) {
  return (new Date(b) - new Date(a)) / 3600000;
}

function promedio(valores) {
  if (!valores.length) return null;
  return Number((valores.reduce((s, v) => s + v, 0) / valores.length).toFixed(1));
}

function contarPor(items, clave) {
  const conteo = {};
  for (const it of items) {
    const valor = it[clave];
    if (valor == null) continue;
    conteo[valor] = (conteo[valor] || 0) + 1;
  }
  return Object.entries(conteo).map(([k, total]) => ({ [clave]: k, total }));
}

// ---------- resumen ----------
dashboardRouter.get("/dashboard/resumen", requirePermission("reportes.ver_dashboard"), async (req, res) => {
  // El filtro de fecha del frontend es un <input type="date"> (solo
  // YYYY-MM-DD, sin hora). Sin esto, "hasta=2026-10-29" se interpreta como
  // 2026-10-29T00:00:00 y excluye cualquier ticket creado esa misma tarde —
  // el rango debe cubrir el día completo, no solo su medianoche.
  const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  let hasta = req.query.hasta || new Date().toISOString();
  if (SOLO_FECHA.test(hasta)) hasta = `${hasta}T23:59:59.999Z`;
  const desde = req.query.desde || new Date(new Date(hasta).getTime() - NOVENTA_DIAS_MS).toISOString();

  const { data: tickets, error: tErr } = await supabase
    .from("tickets")
    .select("*")
    .gte("created_at", desde)
    .lte("created_at", hasta)
    .order("created_at", { ascending: false });
  if (tErr) return res.status(500).json({ error: tErr.message });

  const ids = tickets.map((t) => t.id);

  const [{ data: eventos, error: eErr }, { data: slaConfigRows, error: sErr }, festivos] = await Promise.all([
    ids.length
      ? supabase.from("ticket_eventos").select("ticket_id, tipo_evento, estado_anterior, estado_nuevo, created_at").in("ticket_id", ids)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("sla_config").select("prioridad, dias_habiles"),
    festivosComo(),
  ]);
  if (eErr) return res.status(500).json({ error: eErr.message });
  if (sErr) return res.status(500).json({ error: sErr.message });

  const diasHabilesPorPrioridad = {};
  for (const c of slaConfigRows || []) diasHabilesPorPrioridad[c.prioridad] = c.dias_habiles;

  const eventosPorTicket = {};
  for (const ev of eventos || []) (eventosPorTicket[ev.ticket_id] ||= []).push(ev);

  // ---- SLA (abiertos ahora) ----
  const abiertos = tickets.filter((t) => ESTADOS_ABIERTOS.includes(t.estado));
  let vencidosAbiertos = 0;
  for (const t of abiertos) {
    const { vencido } = await calcularSla(t, eventosPorTicket[t.id] || [], diasHabilesPorPrioridad[t.prioridad] ?? 2, festivos);
    if (vencido) vencidosAbiertos++;
  }

  // ---- SLA histórico (cerrados en el rango): compara cerrado_at contra la fecha límite ----
  const cerrados = tickets.filter((t) => t.estado === "cerrado" && t.aprobado_at && t.cerrado_at);
  let cerradosATiempo = 0;
  let cerradosVencidos = 0;
  const resolucionHoras = [];
  for (const t of cerrados) {
    const dueAt = await fechaLimiteDe(t, eventosPorTicket[t.id] || [], diasHabilesPorPrioridad[t.prioridad] ?? 2, festivos);
    if (dueAt) {
      if (new Date(t.cerrado_at) > new Date(dueAt)) cerradosVencidos++;
      else cerradosATiempo++;
    }
    resolucionHoras.push(horasEntre(t.aprobado_at, t.cerrado_at));
  }
  const totalEvaluadosSla = cerradosATiempo + cerradosVencidos;

  // ---- TPR: aprobado_at -> primer evento "tomado" ----
  const tprHoras = [];
  for (const t of tickets) {
    if (!t.aprobado_at) continue;
    const tomado = (eventosPorTicket[t.id] || []).find((ev) => ev.tipo_evento === "tomado");
    if (tomado) tprHoras.push(horasEntre(t.aprobado_at, tomado.created_at));
  }

  res.json({
    rango: { desde, hasta },
    totales: {
      tickets: tickets.length,
      abiertos: abiertos.length,
      cerrados: cerrados.length,
      vencidosActuales: vencidosAbiertos,
    },
    porEstado: contarPor(tickets, "estado"),
    porTipo: contarPor(tickets, "tipo"),
    porPrioridad: contarPor(tickets, "prioridad"),
    sla: {
      cumplimientoHistorico: {
        aTiempo: cerradosATiempo,
        vencidos: cerradosVencidos,
        porcentaje: totalEvaluadosSla ? Number(((cerradosATiempo / totalEvaluadosSla) * 100).toFixed(1)) : null,
      },
      abiertosAhora: { aTiempo: abiertos.length - vencidosAbiertos, vencidos: vencidosAbiertos },
    },
    tiempos: {
      tprHorasPromedio: promedio(tprHoras),
      resolucionHorasPromedio: promedio(resolucionHoras),
    },
  });
});
