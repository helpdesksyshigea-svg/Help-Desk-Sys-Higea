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

  const [
    { data: eventos, error: eErr },
    { data: slaConfigRows, error: sErr },
    festivos,
    { data: tiposRows, error: tiposErr },
    { data: items, error: itemsErr },
  ] = await Promise.all([
    ids.length
      ? supabase.from("ticket_eventos").select("ticket_id, tipo_evento, estado_anterior, estado_nuevo, created_at").in("ticket_id", ids)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("sla_config").select("prioridad, dias_habiles"),
    festivosComo(),
    supabase.from("tipos_solicitud").select("clave, etiqueta"),
    ids.length
      ? supabase.from("ticket_items").select("ticket_id, motivo").in("ticket_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eErr) return res.status(500).json({ error: eErr.message });
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (tiposErr) return res.status(500).json({ error: tiposErr.message });
  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  const { data: motivosRows, error: motivosErr } = await supabase.from("motivos").select("clave, etiqueta");
  if (motivosErr) return res.status(500).json({ error: motivosErr.message });

  const etiquetaTipo = Object.fromEntries((tiposRows || []).map((t) => [t.clave, t.etiqueta]));
  const etiquetaMotivo = Object.fromEntries((motivosRows || []).map((m) => [m.clave, m.etiqueta]));
  const etiquetaPrioridad = { alta: "Alta", normal: "Normal", baja: "Baja" };

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
  const resolucionHorasPorTicket = {};
  for (const t of cerrados) {
    const dueAt = await fechaLimiteDe(t, eventosPorTicket[t.id] || [], diasHabilesPorPrioridad[t.prioridad] ?? 2, festivos);
    if (dueAt) {
      if (new Date(t.cerrado_at) > new Date(dueAt)) cerradosVencidos++;
      else cerradosATiempo++;
    }
    resolucionHorasPorTicket[t.id] = horasEntre(t.aprobado_at, t.cerrado_at);
  }
  const totalEvaluadosSla = cerradosATiempo + cerradosVencidos;

  // ---- TPR: aprobado_at -> primer evento "tomado" ----
  const tprHorasPorTicket = {};
  for (const t of tickets) {
    if (!t.aprobado_at) continue;
    const tomado = (eventosPorTicket[t.id] || []).find((ev) => ev.tipo_evento === "tomado");
    if (tomado) tprHorasPorTicket[t.id] = horasEntre(t.aprobado_at, tomado.created_at);
  }

  // ---- Por motivo (vive en ticket_items, un ticket puede tener varios) ----
  const conteoMotivos = {};
  for (const it of items || []) {
    if (!it.motivo) continue;
    conteoMotivos[it.motivo] = (conteoMotivos[it.motivo] || 0) + 1;
  }
  const porMotivo = Object.entries(conteoMotivos)
    .map(([clave, total]) => ({ etiqueta: etiquetaMotivo[clave] || clave, total }))
    .sort((a, b) => b.total - a.total);

  // ---- Aging de abiertos: días calendario desde que se radicó ----
  const BUCKETS = [
    { etiqueta: "0-2 días", max: 2 },
    { etiqueta: "3-5 días", max: 5 },
    { etiqueta: "6-10 días", max: 10 },
    { etiqueta: "Más de 10 días", max: Infinity },
  ];
  const agingConteo = BUCKETS.map((b) => ({ etiqueta: b.etiqueta, total: 0 }));
  for (const t of abiertos) {
    const dias = (Date.now() - new Date(t.created_at)) / 86400000;
    const idx = BUCKETS.findIndex((b) => dias <= b.max);
    agingConteo[idx === -1 ? BUCKETS.length - 1 : idx].total++;
  }

  // ---- Tendencia mensual: creados vs cerrados por mes (según created_at/cerrado_at) ----
  const mesDe = (fecha) => fecha.slice(0, 7); // "2026-10"
  const tendenciaMapa = {};
  for (const t of tickets) {
    const m = mesDe(t.created_at);
    (tendenciaMapa[m] ||= { mes: m, creados: 0, cerrados: 0 }).creados++;
  }
  for (const t of cerrados) {
    const m = mesDe(t.cerrado_at);
    (tendenciaMapa[m] ||= { mes: m, creados: 0, cerrados: 0 }).cerrados++;
  }
  const tendenciaMensual = Object.values(tendenciaMapa).sort((a, b) => a.mes.localeCompare(b.mes));

  // ---- Por ingeniero SYS HIGEA (agente_higea, nombre real — asignado_a es
  // la cuenta compartida y no sirve para medir a la persona) ----
  const porAgenteMapa = {};
  for (const t of tickets) {
    if (!t.agente_higea) continue;
    const a = (porAgenteMapa[t.agente_higea] ||= { agente: t.agente_higea, asignados: 0, cerrados: 0, vencidos: 0, tprHoras: [], resolucionHoras: [] });
    a.asignados++;
    if (t.estado === "cerrado") a.cerrados++;
    if (tprHorasPorTicket[t.id] != null) a.tprHoras.push(tprHorasPorTicket[t.id]);
    if (resolucionHorasPorTicket[t.id] != null) a.resolucionHoras.push(resolucionHorasPorTicket[t.id]);
  }
  const porAgente = await Promise.all(
    Object.values(porAgenteMapa).map(async (a) => {
      let vencidos = 0;
      for (const t of abiertos.filter((x) => x.agente_higea === a.agente)) {
        const { vencido } = await calcularSla(t, eventosPorTicket[t.id] || [], diasHabilesPorPrioridad[t.prioridad] ?? 2, festivos);
        if (vencido) vencidos++;
      }
      const evaluables = a.cerrados; // simplificado: % cumplimiento sobre cerrados con TPR conocido
      return {
        agente: a.agente,
        asignados: a.asignados,
        cerrados: a.cerrados,
        vencidos,
        tprHorasPromedio: promedio(a.tprHoras),
        resolucionHorasPromedio: promedio(a.resolucionHoras),
        pctCumplimiento: evaluables ? Number((((evaluables - vencidos) / evaluables) * 100).toFixed(1)) : null,
      };
    }),
  );
  porAgente.sort((a, b) => (a.tprHorasPromedio ?? Infinity) - (b.tprHorasPromedio ?? Infinity));

  res.json({
    rango: { desde, hasta },
    totales: {
      tickets: tickets.length,
      abiertos: abiertos.length,
      cerrados: cerrados.length,
      vencidosActuales: vencidosAbiertos,
    },
    porEstado: contarPor(tickets, "estado"),
    porTipo: contarPor(tickets, "tipo").map((r) => ({ ...r, etiqueta: etiquetaTipo[r.tipo] || r.tipo })),
    porPrioridad: contarPor(tickets, "prioridad").map((r) => ({ ...r, etiqueta: etiquetaPrioridad[r.prioridad] || r.prioridad })),
    porMotivo,
    aging: agingConteo,
    tendenciaMensual,
    porAgente,
    sla: {
      cumplimientoHistorico: {
        aTiempo: cerradosATiempo,
        vencidos: cerradosVencidos,
        porcentaje: totalEvaluadosSla ? Number(((cerradosATiempo / totalEvaluadosSla) * 100).toFixed(1)) : null,
      },
      abiertosAhora: { aTiempo: abiertos.length - vencidosAbiertos, vencidos: vencidosAbiertos },
    },
    tiempos: {
      tprHorasPromedio: promedio(Object.values(tprHorasPorTicket)),
      resolucionHorasPromedio: promedio(Object.values(resolucionHorasPorTicket)),
    },
  });
});
