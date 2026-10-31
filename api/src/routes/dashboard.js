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

// Con más de ~1000 tickets en el rango, un .in("ticket_id", ids) con todos los
// ids a la vez arma una URL tan larga que PostgREST la rechaza con 400 Bad
// Request — el dashboard entero se quedaba sin cargar, no solo impreciso.
// Partir la consulta en lotes de 200 ids evita el límite de longitud de URL.
async function enLotesDe(tabla, select, ids) {
  const TAM_LOTE = 200;
  const filas = [];
  for (let i = 0; i < ids.length; i += TAM_LOTE) {
    const lote = ids.slice(i, i + TAM_LOTE);
    const { data, error } = await supabase.from(tabla).select(select).in("ticket_id", lote);
    if (error) throw new Error(`cargando ${tabla} en lote: ${error.message}`);
    filas.push(...(data || []));
  }
  return filas;
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
    .order("created_at", { ascending: false })
    .range(0, 19999); // ver nota de .range() en GET /tickets (tickets.js): sin esto, PostgREST corta en 1000 filas sin avisar.
  if (tErr) return res.status(500).json({ error: tErr.message });

  const ids = tickets.map((t) => t.id);

  const [eventos, slaConfigRowsResult, festivos, tiposRowsResult, items, aprobacionesRows] = await Promise.all([
    enLotesDe("ticket_eventos", "ticket_id, tipo_evento, estado_anterior, estado_nuevo, created_at", ids),
    supabase.from("sla_config").select("prioridad, dias_habiles"),
    festivosComo(),
    supabase.from("tipos_solicitud").select("clave, etiqueta"),
    enLotesDe("ticket_items", "ticket_id, motivo", ids),
    enLotesDe("aprobaciones", "ticket_id, etapa, decision, decidido_por, created_at", ids),
  ]);
  const { data: slaConfigRows, error: sErr } = slaConfigRowsResult;
  const { data: tiposRows, error: tiposErr } = tiposRowsResult;
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (tiposErr) return res.status(500).json({ error: tiposErr.message });

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

  // ---- Aprobaciones: dónde se traba un ticket antes de llegar a supervisora,
  // y cómo decide la supervisora una vez que lo tiene ----
  const aprobacionesPorTicket = {};
  for (const a of aprobacionesRows || []) (aprobacionesPorTicket[a.ticket_id] ||= []).push(a);

  // Horas de espera de cada etapa: médico firma -> coordinador decide,
  // coordinador decide -> supervisora decide, y facturador firma -> supervisora
  // decide directo (sin coordinador, porque ese ticket nunca tuvo esa etapa).
  const horasMedicoACoordinador = [];
  const horasCoordinadorASupervisora = [];
  const horasSolicitanteASupervisoraDirecto = [];
  // horas que tardó la supervisora en decidir, indexadas por ticket — se
  // reutiliza para el desglose por supervisora más abajo (mismo número, solo
  // agrupado distinto).
  const horasEsperaFinalPorTicket = {};
  for (const t of tickets) {
    const aprs = aprobacionesPorTicket[t.id] || [];
    const coord = aprs.find((a) => a.etapa === "coordinador_medico");
    const final = aprs.find((a) => a.etapa === "final");
    const esFlujoMedico = Boolean(coord) || t.etapa_aprobacion === "coordinador_medico";
    const inicio = t.firma_solicitante_at || t.created_at;
    if (esFlujoMedico) {
      if (coord) {
        horasMedicoACoordinador.push(horasEntre(inicio, coord.created_at));
        if (final) {
          const h = horasEntre(coord.created_at, final.created_at);
          horasCoordinadorASupervisora.push(h);
          horasEsperaFinalPorTicket[t.id] = h;
        }
      }
    } else if (final) {
      const h = horasEntre(inicio, final.created_at);
      horasSolicitanteASupervisoraDirecto.push(h);
      horasEsperaFinalPorTicket[t.id] = h;
    }
  }

  // Decisiones de la supervisora en el rango (la fecha que importa es cuándo
  // decidió, no cuándo se creó el ticket).
  const finalesEnRango = (aprobacionesRows || []).filter(
    (a) => a.etapa === "final" && a.created_at >= desde && a.created_at <= hasta,
  );
  const aprobadosFinal = finalesEnRango.filter((a) => a.decision === "aprobado").length;
  const devueltosFinal = finalesEnRango.filter((a) => a.decision === "devuelto").length;
  const totalFinal = aprobadosFinal + devueltosFinal;

  const porSupervisoraMapa = {};
  for (const a of finalesEnRango) {
    if (!a.decidido_por) continue;
    const s = (porSupervisoraMapa[a.decidido_por] ||= { decidido_por: a.decidido_por, decididos: 0, devueltos: 0, horas: [] });
    s.decididos++;
    if (a.decision === "devuelto") s.devueltos++;
    const h = horasEsperaFinalPorTicket[a.ticket_id];
    if (h != null) s.horas.push(h);
  }
  const idsSupervisoras = Object.keys(porSupervisoraMapa);
  const { data: supervisorasRows, error: supErr } = idsSupervisoras.length
    ? await supabase.from("usuarios").select("id, nombre").in("id", idsSupervisoras)
    : { data: [], error: null };
  if (supErr) return res.status(500).json({ error: supErr.message });
  const nombreUsuario = Object.fromEntries((supervisorasRows || []).map((u) => [u.id, u.nombre]));
  const porSupervisora = Object.values(porSupervisoraMapa)
    .map((s) => ({
      nombre: nombreUsuario[s.decidido_por] || s.decidido_por,
      decididos: s.decididos,
      horasPromedio: promedio(s.horas),
      pctDevolucion: s.decididos ? Number(((s.devueltos / s.decididos) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => b.decididos - a.decididos);

  // Cola actual (no histórica, no limitada al rango de fechas del filtro):
  // tickets ya listos para que cualquier supervisora decida ahora mismo
  // (etapa_aprobacion null = o nunca requirió coordinador, o el coordinador
  // ya le dio su visto bueno).
  const { data: colaRows, error: colaErr } = await supabase
    .from("tickets")
    .select("id, created_at, prioridad, estado, aprobado_at")
    .eq("estado", "pendiente")
    .is("etapa_aprobacion", null);
  if (colaErr) return res.status(500).json({ error: colaErr.message });
  let colaVencidos = 0;
  for (const t of colaRows || []) {
    // calcularSla solo marca "vencido" desde que el ticket queda aprobado
    // (aprobado_at): mientras está en esta cola, pendiente de la firma de la
    // supervisora, el reloj de SLA todavía no corre — así que hoy siempre da
    // 0, de forma correcta según ese mismo criterio ya usado en el resto del
    // dashboard, no por un error de este cálculo.
    const { vencido } = await calcularSla(t, [], diasHabilesPorPrioridad[t.prioridad] ?? 2, festivos);
    if (vencido) colaVencidos++;
  }
  const masAntiguo = (colaRows || []).reduce((min, t) => (!min || t.created_at < min.created_at ? t : min), null);

  const aprobaciones = {
    tiempoPorEtapaHoras: {
      medicoACoordinador: promedio(horasMedicoACoordinador),
      coordinadorASupervisora: promedio(horasCoordinadorASupervisora),
      solicitanteASupervisoraDirecto: promedio(horasSolicitanteASupervisoraDirecto),
    },
    decisionesSupervisora: {
      aprobados: aprobadosFinal,
      devueltos: devueltosFinal,
      pctDevolucion: totalFinal ? Number(((devueltosFinal / totalFinal) * 100).toFixed(1)) : null,
    },
    porSupervisora,
    colaPendiente: {
      total: (colaRows || []).length,
      vencidos: colaVencidos,
      masAntiguoHoras: masAntiguo ? Number(horasEntre(masAntiguo.created_at, new Date().toISOString()).toFixed(1)) : null,
    },
  };

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
    aprobaciones,
  });
});
