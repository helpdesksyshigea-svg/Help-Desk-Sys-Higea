// Exporta a CSV la misma respuesta de GET /dashboard/resumen que se está
// viendo en pantalla (los mismos números, sin recalcular nada). Separador
// ";" y BOM UTF-8 para que Excel en español lo abra con tildes y columnas
// correctas sin pasos extra.
function celda(v) {
  if (v == null) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportarResumenCsv(datos, etiquetasEstado = {}) {
  const filas = [];
  const seccion = (titulo, encabezado, registros) => {
    filas.push([titulo], encabezado, ...registros, []);
  };
  const { totales, tiempos, sla, aprobaciones } = datos;

  seccion("Periodo", ["Desde", "Hasta"], [[datos.rango.desde, datos.rango.hasta]]);
  seccion(
    "Indicadores",
    ["Indicador", "Valor"],
    [
      ["Tickets en el rango", totales.tickets],
      ["Abiertos", totales.abiertos],
      ["Cerrados (con aprobación registrada)", totales.cerrados],
      ["Vencidos ahora", totales.vencidosActuales],
      ["TRS - Tiempo de Resolución en Soporte (h)", tiempos.tprHorasPromedio],
      ["TTR - Tiempo Total de Resolución (h)", tiempos.resolucionHorasPromedio],
      ["TA - Tiempo de Asignación (h)", tiempos.asignacionHorasPromedio],
      ["SLA % cumplimiento (cerrados)", sla.cumplimientoHistorico.porcentaje],
      ["SLA cerrados a tiempo", sla.cumplimientoHistorico.aTiempo],
      ["SLA cerrados vencidos", sla.cumplimientoHistorico.vencidos],
      ["SLA abiertos a tiempo", sla.abiertosAhora.aTiempo],
      ["SLA abiertos vencidos", sla.abiertosAhora.vencidos],
    ],
  );
  seccion("Por estado", ["Estado", "Total"], datos.porEstado.map((r) => [etiquetasEstado[r.estado] || r.estado, r.total]));
  seccion("Por tipo de solicitud", ["Tipo", "Total"], datos.porTipo.map((r) => [r.etiqueta, r.total]));
  seccion("Por prioridad", ["Prioridad", "Total"], datos.porPrioridad.map((r) => [r.etiqueta, r.total]));
  seccion("Por motivo (ítems)", ["Motivo", "Ítems"], datos.porMotivo.map((r) => [r.etiqueta, r.total]));
  seccion("Antigüedad de abiertos", ["Tramo", "Total"], datos.aging.map((r) => [r.etiqueta, r.total]));
  seccion("Tendencia mensual", ["Mes", "Creados", "Cerrados"], datos.tendenciaMensual.map((r) => [r.mes, r.creados, r.cerrados]));
  seccion(
    "Por ingeniero",
    ["Ingeniero", "Asignados", "Cerrados", "Vencidos", "TRS (h)", "TTR (h)", "% a tiempo"],
    datos.porAgente.map((a) => [a.agente, a.asignados, a.cerrados, a.vencidos, a.tprHorasPromedio, a.resolucionHorasPromedio, a.pctCumplimiento]),
  );
  if (aprobaciones) {
    const { tiempoPorEtapaHoras: t, gestionConPausasHoras: g, decisionesSupervisora: d, colaPendiente: c } = aprobaciones;
    seccion(
      "Aprobaciones",
      ["Indicador", "Valor"],
      [
        ["Supervisora: aprobados", d.aprobados],
        ["Supervisora: devueltos", d.devueltos],
        ["Supervisora: % devolución", d.pctDevolucion],
        ["Gestión coordinador médico con pausas (h)", g.coordinadorMedico],
        ["Gestión supervisora con pausas (h)", g.supervisora],
        ["Espera médico -> coordinador (h)", t.medicoACoordinador],
        ["Espera coordinador -> supervisora (h)", t.coordinadorASupervisora],
        ["Espera facturador -> supervisora directo (h)", t.solicitanteASupervisoraDirecto],
        ["Cola de firma: en cola", c.total],
        ["Cola de firma: vencidos", c.vencidos],
        ["Cola de firma: más antiguo (h)", c.masAntiguoHoras],
      ],
    );
    seccion("Causas de devolución", ["Causa", "Total"], (aprobaciones.causasDevolucion || []).map((r) => [r.etiqueta, r.total]));
    seccion(
      "Por supervisora",
      ["Supervisora", "Decididos", "Tiempo promedio (h)", "% devolución"],
      (aprobaciones.porSupervisora || []).map((s) => [s.nombre, s.decididos, s.horasPromedio, s.pctDevolucion]),
    );
  }

  const csv = "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `control-gestion_${String(datos.rango.desde).slice(0, 10)}_${String(datos.rango.hasta).slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
