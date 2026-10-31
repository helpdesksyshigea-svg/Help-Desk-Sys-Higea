// Centro de alertas operativas: reglas que leen EXCLUSIVAMENTE la respuesta
// de GET /dashboard/resumen (no consultan nada más ni recalculan indicadores).
//
// UMBRALES PREDETERMINADOS: los valores de abajo NO son reglas de negocio del
// hospital ni del backend — son un punto de partida razonable elegido para
// esta primera versión del panel. Están juntos aquí para que se puedan
// ajustar en un solo lugar y, a futuro, volverlos configurables por el
// administrador (hoy no lo son).
export const UMBRALES_ALERTA = {
  // Cumplimiento de SLA (sobre cerrados): por debajo de la meta = atención,
  // por debajo del mínimo = crítico.
  slaMetaPct: 90,
  slaMinimoPct: 75,
  // Cola de firma de supervisora: volumen o antigüedad del más viejo.
  colaFirmaVolumen: 10,
  colaFirmaAntiguedadHoras: 48,
  // % de devolución de supervisora a partir del cual se ve como cuello de botella.
  devolucionPct: 20,
  // Gestión promedio (con pausas) de coordinador médico o supervisora.
  gestionAprobacionHoras: 48,
  // TA promedio: aprobado -> tomado por SYS HIGEA.
  asignacionHoras: 24,
  // Concentración de un solo tipo de solicitud (solo si hay volumen mínimo).
  concentracionTipoPct: 50,
  concentracionMinTickets: 10,
  // Un ingeniero con esta fracción o más de los casos asignados aún no cerrados
  // (solo si hay al menos 2 ingenieros y un mínimo de casos).
  cargaIngenieroPct: 50,
  cargaMinCasos: 5,
};

const ORDEN = { critico: 0, alerta: 1, info: 2 };

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function horasTexto(h) {
  if (h == null) return "—";
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} días`;
}

export function calcularAlertas(datos, U = UMBRALES_ALERTA) {
  const alertas = [];
  const { totales, aging, sla, porAgente, porTipo, aprobaciones, tiempos, tendenciaMensual } = datos;

  // 1. Abiertos vencidos ahora
  if (totales.vencidosActuales > 0) {
    alertas.push({
      id: "vencidos",
      severidad: "critico",
      titulo: `${plural(totales.vencidosActuales, "ticket abierto vencido", "tickets abiertos vencidos")}`,
      descripcion: `Superaron el plazo de SLA y siguen abiertos (${Math.round((totales.vencidosActuales / Math.max(1, totales.abiertos)) * 100)}% de los abiertos).`,
      casos: totales.vencidosActuales,
      accion: "Priorizar en la bandeja con el filtro «Vencidos».",
    });
  }

  // 2. Antigüedad elevada: el último tramo del backend ("Más de 10 días")
  const tramoMayor = aging[aging.length - 1];
  const tramo610 = aging[aging.length - 2];
  if (tramoMayor?.total > 0) {
    alertas.push({
      id: "aging-10",
      severidad: "alerta",
      titulo: `${plural(tramoMayor.total, "ticket", "tickets")} con ${tramoMayor.etiqueta.toLowerCase()}`,
      descripcion: "Acumulación de casos abiertos de larga antigüedad desde su radicación.",
      casos: tramoMayor.total,
      accion: "Revisar si están bloqueados esperando información o sin responsable.",
    });
  } else if (tramo610?.total > 0) {
    alertas.push({
      id: "aging-6",
      severidad: "info",
      titulo: `${plural(tramo610.total, "ticket", "tickets")} entre ${tramo610.etiqueta}`,
      descripcion: "Casos que se acercan al tramo de mayor antigüedad.",
      casos: tramo610.total,
      accion: "Darles seguimiento antes de que superen los 10 días.",
    });
  }

  // 3. Cumplimiento de SLA (solo cerrados, misma definición del backend)
  const pctSla = sla.cumplimientoHistorico.porcentaje;
  if (pctSla != null && pctSla < U.slaMetaPct) {
    alertas.push({
      id: "sla",
      severidad: pctSla < U.slaMinimoPct ? "critico" : "alerta",
      titulo: `Cumplimiento de SLA en ${pctSla}%`,
      descripcion: `Por debajo de la meta predeterminada de ${U.slaMetaPct}% sobre los tickets cerrados del periodo.`,
      casos: sla.cumplimientoHistorico.vencidos,
      accion: "Analizar los cerrados fuera de plazo por tipo de solicitud.",
    });
  }

  // 4. Cola de firma de supervisora
  const cola = aprobaciones?.colaPendiente;
  if (cola && cola.total > 0) {
    const vieja = cola.masAntiguoHoras != null && cola.masAntiguoHoras > U.colaFirmaAntiguedadHoras;
    const grande = cola.total >= U.colaFirmaVolumen;
    alertas.push({
      id: "cola",
      severidad: vieja || grande ? "alerta" : "info",
      titulo: `${plural(cola.total, "ticket pendiente", "tickets pendientes")} de firma`,
      descripcion: `En cola de aprobación de supervisión. El más antiguo lleva ${horasTexto(cola.masAntiguoHoras)}.`,
      casos: cola.total,
      accion: "Coordinar con supervisión de facturación la revisión de la cola.",
    });
  }

  // 5. Devolución de supervisora alta
  const dev = aprobaciones?.decisionesSupervisora;
  if (dev?.pctDevolucion != null && dev.pctDevolucion >= U.devolucionPct) {
    alertas.push({
      id: "devolucion",
      severidad: "alerta",
      titulo: `Supervisión devuelve el ${dev.pctDevolucion}% de lo que decide`,
      descripcion: `${plural(dev.devueltos, "devolución", "devoluciones")} en el periodo. Revise las causas de devolución.`,
      casos: dev.devueltos,
      accion: "Reforzar con facturadores/médicos los motivos más frecuentes.",
    });
  }

  // 6. Gestión lenta en etapas de aprobación (con pausas, definición del backend)
  const g = aprobaciones?.gestionConPausasHoras;
  for (const [clave, nombre] of [
    ["coordinadorMedico", "Coordinador médico"],
    ["supervisora", "Supervisora"],
  ]) {
    const h = g?.[clave];
    if (h != null && h > U.gestionAprobacionHoras) {
      alertas.push({
        id: `gestion-${clave}`,
        severidad: "alerta",
        titulo: `${nombre}: gestión promedio de ${horasTexto(h)}`,
        descripcion: `Cuello de botella en aprobaciones (más de ${U.gestionAprobacionHoras} h con el reloj pausado en devoluciones).`,
        casos: null,
        accion: "Revisar la carga de esa etapa de firma.",
      });
    }
  }

  // 7. Tiempo de asignación alto
  if (tiempos.asignacionHorasPromedio != null && tiempos.asignacionHorasPromedio > U.asignacionHoras) {
    alertas.push({
      id: "ta",
      severidad: "info",
      titulo: `TA promedio de ${horasTexto(tiempos.asignacionHorasPromedio)}`,
      descripcion: `Los tickets aprobados tardan más de ${U.asignacionHoras} h en ser tomados por SYS HIGEA.`,
      casos: null,
      accion: "Revisar la asignación de casos en SYS HIGEA.",
    });
  }

  // 8. Ingenieros con vencidos y concentración de carga
  const conVencidos = porAgente.filter((a) => a.vencidos > 0);
  if (conVencidos.length) {
    const casos = conVencidos.reduce((s, a) => s + a.vencidos, 0);
    alertas.push({
      id: "ing-vencidos",
      severidad: "alerta",
      titulo: `${plural(conVencidos.length, "ingeniero", "ingenieros")} con casos vencidos`,
      descripcion: conVencidos
        .slice(0, 3)
        .map((a) => `${a.agente} (${a.vencidos})`)
        .join(", ") + (conVencidos.length > 3 ? "…" : ""),
      casos,
      accion: "Redistribuir o apoyar los casos vencidos.",
    });
  }
  const pendientesPorIng = porAgente.map((a) => ({ agente: a.agente, n: Math.max(0, a.asignados - a.cerrados) }));
  const totalPend = pendientesPorIng.reduce((s, a) => s + a.n, 0);
  if (porAgente.length >= 2 && totalPend >= U.cargaMinCasos) {
    const mayor = pendientesPorIng.reduce((m, a) => (a.n > m.n ? a : m));
    const p = Math.round((mayor.n / totalPend) * 100);
    if (p >= U.cargaIngenieroPct) {
      alertas.push({
        id: "carga",
        severidad: "info",
        titulo: `Alta carga en ${mayor.agente}`,
        descripcion: `Concentra el ${p}% de los casos asignados aún sin cerrar (${mayor.n} de ${totalPend}).`,
        casos: mayor.n,
        accion: "Evaluar balanceo de carga en el equipo.",
      });
    }
  }

  // 9. Concentración anormal en un tipo de solicitud
  if (totales.tickets >= U.concentracionMinTickets && porTipo.length > 1) {
    const top = porTipo.reduce((m, t) => (t.total > m.total ? t : m));
    const p = Math.round((top.total / totales.tickets) * 100);
    if (p >= U.concentracionTipoPct) {
      alertas.push({
        id: "concentracion",
        severidad: "info",
        titulo: `${p}% de las solicitudes son «${top.etiqueta}»`,
        descripcion: "Alta concentración en un solo tipo: puede indicar un problema recurrente.",
        casos: top.total,
        accion: "Revisar si hay una causa común que se pueda resolver de raíz.",
      });
    }
  }

  // 10. Último mes con más entradas que cierres
  const ultimo = tendenciaMensual[tendenciaMensual.length - 1];
  if (ultimo && ultimo.creados > ultimo.cerrados) {
    alertas.push({
      id: "tendencia",
      severidad: "info",
      titulo: `Entran más tickets de los que se cierran (${ultimo.mes})`,
      descripcion: `${ultimo.creados} creados vs. ${ultimo.cerrados} cerrados en el último mes del rango.`,
      casos: ultimo.creados - ultimo.cerrados,
      accion: "Vigilar la acumulación del próximo periodo.",
    });
  }

  return alertas.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad]);
}
