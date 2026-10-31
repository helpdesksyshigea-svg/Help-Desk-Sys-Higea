import { Router } from "express";
import { conManejoAsync } from "../lib/asyncRouter.js";
import { supabase } from "../config/supabase.js";
import { authenticate, requirePermission } from "../middleware/auth.js";
import { calcularSla, fechaLimiteDe, festivosComo, segundosEnRequiereInfo } from "../lib/sla.js";

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

// Tiempo real que una etapa de aprobación (coordinador médico o supervisora)
// "tiene" el ticket en su bandeja: cuenta desde `inicioISO` hasta el evento
// `tipoEventoFin`, pero cada vez que aparece un "devuelto" el reloj se detiene
// (el ticket vuelve al médico/facturador a corregir) y se reanuda recién en el
// siguiente "editado" (reenvío). Mismo patrón que `segundosEnRequiereInfo` de
// sla.js, generalizado al par devuelto/editado en vez de requiere_info.
// Devuelve null si el evento de fin nunca ocurrió (todavía no es medible).
function horasConPausas(eventosTicket, inicioISO, tipoEventoFin) {
  const eventos = eventosTicket.filter((ev) => new Date(ev.created_at) >= new Date(inicioISO));
  let inicioTramo = new Date(inicioISO);
  let totalMs = 0;
  for (const ev of eventos) {
    if (ev.tipo_evento === tipoEventoFin && inicioTramo) {
      totalMs += new Date(ev.created_at) - inicioTramo;
      return Number((totalMs / 3600000).toFixed(2));
    }
    if (ev.tipo_evento === "devuelto" && inicioTramo) {
      totalMs += new Date(ev.created_at) - inicioTramo;
      inicioTramo = null; // pausado: el ticket está de vuelta con quien lo radicó, corrigiendo
    } else if (ev.tipo_evento === "editado" && !inicioTramo) {
      inicioTramo = new Date(ev.created_at); // reanuda: vuelve a la bandeja de esta etapa
    }
  }
  return null; // nunca llegó al evento de fin dentro de este tramo
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

  // Pagina en lotes de 1000 hasta agotar los resultados — un .range() fijo
  // (lo que había antes) solo corre el techo, no lo elimina: con suficiente
  // volumen en el rango de fechas elegido, los tickets más allá de ese techo
  // volverían a desaparecer del dashboard en silencio.
  const tickets = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error: tErr } = await supabase
      .from("tickets")
      .select("*")
      .gte("created_at", desde)
      .lte("created_at", hasta)
      .order("created_at", { ascending: false })
      .range(desdeFila, desdeFila + 999);
    if (tErr) return res.status(500).json({ error: tErr.message });
    tickets.push(...(data || []));
    if (!data || data.length < 1000) break;
  }

  const ids = tickets.map((t) => t.id);

  // aprobaciones.motivo_devolucion viene de la migración 0023: si todavía no
  // se ha corrido, pedir esa columna rompería el dashboard entero por un 400
  // de PostgREST, así que se reintenta sin ella en vez de fallar.
  async function cargarAprobacionesRows() {
    try {
      return await enLotesDe("aprobaciones", "ticket_id, etapa, decision, decidido_por, created_at, motivo_devolucion", ids);
    } catch (err) {
      console.error("[dashboard] no se pudo cargar aprobaciones.motivo_devolucion (¿falta la migración 0023?), se reintenta sin esa columna:", err.message);
      return enLotesDe("aprobaciones", "ticket_id, etapa, decision, decidido_por, created_at", ids);
    }
  }

  const [eventos, slaConfigRowsResult, festivos, tiposRowsResult, items, aprobacionesRows] = await Promise.all([
    enLotesDe("ticket_eventos", "ticket_id, tipo_evento, estado_anterior, estado_nuevo, created_at", ids),
    supabase.from("sla_config").select("prioridad, dias_habiles"),
    festivosComo(),
    supabase.from("tipos_solicitud").select("clave, etiqueta"),
    enLotesDe("ticket_items", "ticket_id, motivo", ids),
    cargarAprobacionesRows(),
  ]);
  const { data: slaConfigRows, error: sErr } = slaConfigRowsResult;
  const { data: tiposRows, error: tiposErr } = tiposRowsResult;
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (tiposErr) return res.status(500).json({ error: tiposErr.message });

  const { data: motivosRows, error: motivosErr } = await supabase.from("motivos").select("clave, etiqueta");
  if (motivosErr) return res.status(500).json({ error: motivosErr.message });

  // Igual que motivos: si la tabla motivos_devolucion todavía no existe
  // (falta la migración 0023), no se bloquea el dashboard, solo queda vacío
  // (ver causasDevolucion más abajo).
  const { data: motivosDevolucionRows, error: motivosDevolucionErr } = await supabase.from("motivos_devolucion").select("clave, etiqueta");
  if (motivosDevolucionErr) {
    console.error("[dashboard] no se pudo cargar motivos_devolucion (¿falta la migración 0023?):", motivosDevolucionErr.message);
  }

  const etiquetaTipo = Object.fromEntries((tiposRows || []).map((t) => [t.clave, t.etiqueta]));
  const etiquetaMotivo = Object.fromEntries((motivosRows || []).map((m) => [m.clave, m.etiqueta]));
  const etiquetaMotivoDevolucion = Object.fromEntries((motivosDevolucionRows || []).map((m) => [m.clave, m.etiqueta]));
  const etiquetaPrioridad = { alta: "Alta", normal: "Normal", baja: "Baja" };

  const diasHabilesPorPrioridad = {};
  for (const c of slaConfigRows || []) diasHabilesPorPrioridad[c.prioridad] = c.dias_habiles;

  const eventosPorTicket = {};
  for (const ev of eventos || []) (eventosPorTicket[ev.ticket_id] ||= []).push(ev);
  // Los eventos no vienen garantizados en orden cronológico (enLotesDe no
  // ordena): para poder buscar "el primer evento después de X" hace falta
  // ordenarlos por fecha dentro de cada ticket.
  for (const lista of Object.values(eventosPorTicket)) lista.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

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
    // Tiempo de resolución = ciclo de vida completo del ticket: desde que se
    // radica (created_at) hasta que se cierra (cerrado_at). Incluye todo el
    // tiempo de aprobación, no solo lo que pasa después de aprobado.
    resolucionHorasPorTicket[t.id] = horasEntre(t.created_at, t.cerrado_at);
  }
  const totalEvaluadosSla = cerradosATiempo + cerradosVencidos;

  // ---- Tiempo de asignación: desde que el ticket queda aprobado (visible
  // para SYS HIGEA) hasta que alguien lo toma. Este es el cálculo que antes
  // se llamaba "TPR" antes de que se corrigiera para medir tomado->respuesta;
  // ahora tiene su propio nombre porque mide algo distinto (cuánto tarda en
  // que alguien lo asigne, no cuánto tarda en responder una vez asignado).
  const asignacionHorasPorTicket = {};
  for (const t of tickets) {
    if (!t.aprobado_at) continue;
    const eventosTicket = eventosPorTicket[t.id] || [];
    const tomado = eventosTicket.find((ev) => ev.tipo_evento === "tomado");
    if (tomado) asignacionHorasPorTicket[t.id] = horasEntre(t.aprobado_at, tomado.created_at);
  }

  // ---- TR (tiempo de respuesta, por ticket) / TPR (su promedio): desde que
  // el ingeniero de SYS HIGEA TOMA el ticket ("tomado") hasta que lo CIERRA
  // ("cerrado_at"), con el reloj PAUSADO mientras el ticket está en
  // "requiere_info" (se detiene al devolver, se reanuda —no se reinicia—
  // al responder; mismo patrón que el SLA, reusando segundosEnRequiereInfo
  // de sla.js). Esta es la misma fórmula que antes vivía aparte como
  // "SYS HIGEA — Tiempo de resolución"; se consolidó en un solo nombre
  // (tprHorasPorTicket / resolucionSoporteHorasPorTicket) para no tener dos
  // tarjetas distintas midiendo lo mismo. Distinto del
  // "resolucionHorasPromedio" general de arriba, que mide el ciclo completo
  // desde created_at e incluye todo el tiempo de aprobación.
  const resolucionSoporteHorasPorTicket = {};
  for (const t of tickets) {
    if (!t.cerrado_at) continue;
    const eventosTicket = eventosPorTicket[t.id] || [];
    const tomado = eventosTicket.find((ev) => ev.tipo_evento === "tomado");
    if (!tomado) continue;
    const pausaHoras = segundosEnRequiereInfo(eventosTicket) / 3600;
    resolucionSoporteHorasPorTicket[t.id] = Number((horasEntre(tomado.created_at, t.cerrado_at) - pausaHoras).toFixed(2));
  }
  // Alias: TPR es exactamente este mismo cálculo. Se mantiene el nombre
  // "tprHorasPorTicket" porque lo usa el desglose por agente más abajo.
  const tprHorasPorTicket = resolucionSoporteHorasPorTicket;

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
  // Gestión REAL del coordinador médico y de la supervisora: lo mismo que
  // tiempoPorEtapaHoras arriba, pero descontando el tiempo en que el ticket
  // estuvo devuelto en manos del médico/facturador corrigiendo (ver
  // horasConPausas). El usuario pidió explícitamente esta versión con
  // pausa/reanudación porque la de arriba (espera simple hasta la decisión)
  // no distingue "el coordinador lo tuvo 3 días" de "el coordinador lo
  // devolvió al día 1 y el médico tardó 2 días en corregir".
  const horasGestionCoordinador = [];
  const horasGestionSupervisora = [];
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

    const eventosTicket = eventosPorTicket[t.id] || [];
    const hGestionCoord = horasConPausas(eventosTicket, t.created_at, "aprobado_coordinador");
    if (hGestionCoord != null) horasGestionCoordinador.push(hGestionCoord);

    // La supervisora recibe el ticket desde que el coordinador lo aprueba (si
    // el ticket pasó por esa etapa) o desde que se radica (si no la tuvo).
    const aprobadoCoordEvento = eventosTicket.find((ev) => ev.tipo_evento === "aprobado_coordinador");
    const inicioSupervisora = aprobadoCoordEvento ? aprobadoCoordEvento.created_at : t.created_at;
    const hGestionSup = horasConPausas(eventosTicket, inicioSupervisora, "aprobado");
    if (hGestionSup != null) horasGestionSupervisora.push(hGestionSup);
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
  // ---- Causas de devolución (migración 0023): cuenta cada devolución
  // (cualquier etapa — coordinador médico o supervisora) por su
  // motivo_devolucion, con la etiqueta legible del catálogo, igual que
  // porMotivo arriba. Las devoluciones de antes de este cambio no tienen
  // motivo_devolucion (quedó null): se cuentan aparte en "Sin motivo
  // registrado" en vez de descartarse silenciosamente.
  const devueltasEnRango = (aprobacionesRows || []).filter(
    (a) => a.decision === "devuelto" && a.created_at >= desde && a.created_at <= hasta,
  );
  const SIN_MOTIVO = "Sin motivo registrado";
  const conteoCausas = {};
  for (const a of devueltasEnRango) {
    const clave = a.motivo_devolucion || SIN_MOTIVO;
    conteoCausas[clave] = (conteoCausas[clave] || 0) + 1;
  }
  const causasDevolucion = Object.entries(conteoCausas)
    .map(([clave, total]) => ({ etiqueta: clave === SIN_MOTIVO ? SIN_MOTIVO : etiquetaMotivoDevolucion[clave] || clave, total }))
    .sort((a, b) => b.total - a.total);

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
    // Gestión real de cada etapa: igual que tiempoPorEtapaHoras pero
    // descontando el tiempo en que el ticket estuvo devuelto corrigiéndose
    // (no contaba antes). Esta es la definición que reemplaza a las tarjetas
    // "Coordinador médico decide en" / "Supervisora decide en" del dashboard.
    gestionConPausasHoras: {
      coordinadorMedico: promedio(horasGestionCoordinador),
      supervisora: promedio(horasGestionSupervisora),
    },
    decisionesSupervisora: {
      aprobados: aprobadosFinal,
      devueltos: devueltosFinal,
      pctDevolucion: totalFinal ? Number(((devueltosFinal / totalFinal) * 100).toFixed(1)) : null,
    },
    porSupervisora,
    causasDevolucion,
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
      // TPR (tiempo promedio de respuesta): promedio de TR por ticket —
      // tomado -> cerrado, pausado en requiere_info. "resolucionSoporteHorasPromedio"
      // se deja como alias del mismo número por compatibilidad con clientes
      // viejos; ambos valores SIEMPRE deben coincidir, no son dos cálculos.
      tprHorasPromedio: promedio(Object.values(tprHorasPorTicket)),
      resolucionHorasPromedio: promedio(Object.values(resolucionHorasPorTicket)),
      // Tiempo de asignación: distinto de TPR (mide aprobado->tomado, no
      // tomado->cerrado).
      asignacionHorasPromedio: promedio(Object.values(asignacionHorasPorTicket)),
      resolucionSoporteHorasPromedio: promedio(Object.values(resolucionSoporteHorasPorTicket)),
    },
    aprobaciones,
  });
});
