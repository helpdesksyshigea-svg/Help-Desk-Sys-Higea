// Dashboard "Control de Gestión" — rediseño Enterprise SaaS.
//
// Fuente única de datos: GET /dashboard/resumen?desde&hasta&ingeniero&estado&
// prioridad&tipo (api/src/routes/dashboard.js). Esta página NO recalcula
// ningún indicador: solo los presenta. Las únicas cuentas hechas aquí son
// porcentajes de presentación (ej. vencidos / abiertos) sobre números que ya
// trae el backend.
//
// Filtros: Periodo, Ingeniero, Estado, Prioridad y Tipo se envían todos al
// servidor, que filtra los tickets antes de calcular cualquier indicador —
// por eso TODOS los paneles (KPI, embudo, tendencia, aging, SLA, por-agente,
// aprobaciones) respetan el filtro, no solo la tabla de desempeño.
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { fechaCorta, fechaHora } from "../lib/fecha";
import { Skeleton } from "../components/Skeleton";
import { Select } from "../components/Select";
import {
  IconActivity,
  IconAlert,
  IconArrowRight,
  IconBell,
  IconCalendar,
  IconCheckCircle,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconDownload,
  IconFilter,
  IconHourglass,
  IconInbox,
  IconLayers,
  IconOctagonAlert,
  IconRefresh,
  IconShield,
  IconSignature,
  IconTimer,
  IconTrendingUp,
  IconUserCheck,
  IconUsers,
  IconClose,
} from "../components/icons";
import { BarraDividida, BarraProgreso, BloqueTitulo, EstadoVacio, InfoTip, KpiCard, MiniStat, Panel, PanelTitulo, Pastilla } from "../components/dashboard/primitivas";
import { SEVERIDAD, horas, horasPartes, nf, ordenarDesc, pct } from "../components/dashboard/formato";
import { AnilloPorcentaje, AntiguedadBarras, Donut, ListaBarras, TendenciaMensual } from "../components/dashboard/graficos";
import { UMBRALES_ALERTA, calcularAlertas } from "../components/dashboard/alertas";
import { exportarResumenCsv } from "../components/dashboard/exportar";

// ---------- constantes de presentación ----------

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  en_proceso: "En proceso",
  requiere_info: "Requiere info",
  cerrado: "Cerrado",
};

// Color semántico por estado: neutro = esperando aprobación interna,
// atención = devuelto, información = aprobado y en espera de SYS HIGEA,
// acción = en gestión, crítico = bloqueado esperando info, petróleo = cerrado.
const COLORES_ESTADO = {
  pendiente: "var(--color-chart-neutral)",
  devuelto: "var(--color-sem-warning)",
  aprobado: "var(--color-sem-info)",
  en_proceso: "var(--color-brand-action)",
  requiere_info: "var(--color-sem-critical)",
  cerrado: "var(--color-brand-deep)",
};

const COLOR_PRIORIDAD = {
  alta: "var(--color-sem-critical)",
  normal: "var(--color-brand-action)",
  baja: "var(--color-brand-mist)",
};

const PERIODOS = [
  { id: "7", etiqueta: "Últimos 7 días", dias: 7 },
  { id: "30", etiqueta: "Últimos 30 días", dias: 30 },
  { id: "90", etiqueta: "Últimos 90 días", dias: 90 },
  { id: "180", etiqueta: "Últimos 6 meses", dias: 180 },
  { id: "365", etiqueta: "Último año", dias: 365 },
  { id: "personalizado", etiqueta: "Personalizado" },
];
const PERIODO_DEFECTO = "90";

// Mismo cálculo de fechas que tenía el dashboard original (fecha UTC del
// navegador). Se conserva tal cual para no alterar qué tickets entran en el
// rango por defecto (ver nota sobre zona horaria en el reporte).
function fechaInputDe(diasAtras) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

function nivelCumplimiento(p) {
  if (p == null) return "neutro";
  if (p >= UMBRALES_ALERTA.slaMetaPct) return "ok";
  if (p >= UMBRALES_ALERTA.slaMinimoPct) return "alerta";
  return "critico";
}

function iniciales(nombre) {
  const partes = String(nombre || "?").trim().split(/\s+/);
  return (partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)).toUpperCase();
}

// ---------- página ----------

export function Dashboard() {
  const [datos, setDatos] = useState(null);
  // Catálogo de opciones de los selectores (ingeniero/estado/prioridad/tipo):
  // se congela con la respuesta SIN filtrar más reciente, para que elegir un
  // filtro no haga desaparecer las demás opciones del selector (si no, al
  // filtrar por estado=cerrado el propio `datos` ya filtrado solo traería
  // "cerrado" y no se podría volver a elegir otro estado desde el dropdown).
  const [opcionesBase, setOpcionesBase] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState(null);

  const [periodo, setPeriodo] = useState(PERIODO_DEFECTO);
  const [desde, setDesde] = useState(fechaInputDe(90));
  const [hasta, setHasta] = useState(fechaInputDe(0));

  // filtros: se envían al servidor igual que desde/hasta
  const [fIngeniero, setFIngeniero] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fTipo, setFTipo] = useState("");

  // Si el usuario cambia de periodo rápido, solo vale la última respuesta.
  const solicitud = useRef(0);

  async function cargar(d = desde, h = hasta) {
    const id = ++solicitud.current;
    setCargando(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde: d, hasta: h });
      if (fIngeniero) params.set("ingeniero", fIngeniero);
      if (fEstado) params.set("estado", fEstado);
      if (fPrioridad) params.set("prioridad", fPrioridad);
      if (fTipo) params.set("tipo", fTipo);
      const r = await apiFetch(`/dashboard/resumen?${params.toString()}`);
      if (id !== solicitud.current) return;
      setDatos(r);
      // Solo esta respuesta (sin ingeniero/estado/prioridad/tipo aplicados)
      // sirve como catálogo completo de opciones para los selectores.
      if (!fIngeniero && !fEstado && !fPrioridad && !fTipo) setOpcionesBase(r);
      setActualizadoEn(new Date());
    } catch (e) {
      if (id !== solicitud.current) return;
      setError(`No se pudo cargar el dashboard. ${e.message}`);
    } finally {
      if (id === solicitud.current) setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fIngeniero, fEstado, fPrioridad, fTipo]);

  function cambiarPeriodo(id) {
    setPeriodo(id);
    const p = PERIODOS.find((x) => x.id === id);
    if (p?.dias) {
      const d = fechaInputDe(p.dias);
      const h = fechaInputDe(0);
      setDesde(d);
      setHasta(h);
      cargar(d, h);
    }
  }

  const hayFiltrosActivos = Boolean(fIngeniero || fEstado || fPrioridad || fTipo);
  const periodoCambiado = periodo !== PERIODO_DEFECTO;

  function limpiarFiltros() {
    setFIngeniero("");
    setFEstado("");
    setFPrioridad("");
    setFTipo("");
    if (periodoCambiado) cambiarPeriodo(PERIODO_DEFECTO);
  }

  const opciones = useMemo(() => {
    const base = opcionesBase || datos;
    if (!base) return { ingenieros: [], estados: [], prioridades: [], tipos: [] };
    return {
      ingenieros: [...base.porAgente.map((a) => a.agente)].sort((a, b) => a.localeCompare(b, "es")),
      estados: base.porEstado.map((e) => ({ valor: e.estado, etiqueta: ETIQUETAS_ESTADO[e.estado] || e.estado })),
      prioridades: base.porPrioridad.map((p) => ({ valor: p.prioridad, etiqueta: p.etiqueta })),
      tipos: ordenarDesc(base.porTipo).map((t) => ({ valor: t.tipo, etiqueta: t.etiqueta })),
    };
  }, [opcionesBase, datos]);

  return (
    <div className="grid gap-5 text-[13.5px] text-dash-ink">
      {/* ===== A. Encabezado y filtros ===== */}
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold leading-tight tracking-tight text-dash-ink">Control de Gestión</h1>
          <p className="mt-0.5 text-[13.5px] text-dash-muted">Centro de soporte y seguimiento operativo</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dash-muted">
            {datos && (
              <span className="inline-flex items-center gap-1">
                <IconCalendar size={13} />
                {fechaCorta(datos.rango.desde)} – {fechaCorta(datos.rango.hasta)}
              </span>
            )}
            <span className="inline-flex items-center gap-1" aria-live="polite">
              {cargando ? (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-action" /> Actualizando…
                </>
              ) : actualizadoEn ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-action" /> Actualizado {fechaHora(actualizadoEn.toISOString())}
                </>
              ) : null}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2 xl:justify-end">
          <SelectorCompacto etiqueta="Periodo" valor={periodo} onChange={cambiarPeriodo} opciones={PERIODOS.map((p) => ({ valor: p.id, etiqueta: p.etiqueta }))} />
          <SelectorCompacto
            etiqueta="Ingeniero"
            valor={fIngeniero}
            onChange={setFIngeniero}
            todos="Todos"
            opciones={opciones.ingenieros.map((n) => ({ valor: n, etiqueta: n }))}
            destacar
          />
          <SelectorCompacto etiqueta="Estado" valor={fEstado} onChange={setFEstado} todos="Todos" opciones={opciones.estados} destacar />
          <SelectorCompacto etiqueta="Prioridad" valor={fPrioridad} onChange={setFPrioridad} todos="Todas" opciones={opciones.prioridades} destacar />
          <SelectorCompacto etiqueta="Tipo de solicitud" valor={fTipo} onChange={setFTipo} todos="Todos" opciones={opciones.tipos} destacar ancho />
          <div className="flex items-stretch gap-2">
            {(hayFiltrosActivos || periodoCambiado) && (
              <button
                type="button"
                onClick={limpiarFiltros}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-panel-sm)] px-3 text-[13px] font-semibold text-dash-muted transition-colors hover:bg-dash-surface hover:text-dash-ink"
              >
                <IconClose size={14} /> Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={() => cargar()}
              disabled={cargando}
              aria-label="Actualizar datos"
              title="Actualizar datos"
              className="inline-flex w-11 items-center justify-center rounded-[var(--radius-panel-sm)] border border-dash-border bg-dash-surface text-dash-ink shadow-panel transition-colors hover:border-brand-action/40 hover:text-brand-action disabled:opacity-60"
            >
              <IconRefresh size={16} className={cargando ? "animate-spin" : ""} />
            </button>
            <button
              type="button"
              onClick={() => datos && exportarResumenCsv(datos, ETIQUETAS_ESTADO)}
              disabled={!datos}
              title="Descargar en CSV los mismos indicadores que se ven en pantalla"
              className="inline-flex items-center gap-2 rounded-[var(--radius-panel-sm)] bg-brand-deep px-4 text-[13px] font-semibold text-white shadow-panel transition-all hover:bg-brand-action active:scale-[0.98] disabled:opacity-50"
            >
              <IconDownload size={15} /> Exportar
            </button>
          </div>
        </div>
      </header>

      {periodo === "personalizado" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            cargar();
          }}
          className="flex flex-wrap items-end gap-2 rounded-panel border border-dash-border bg-dash-surface px-4 py-3 shadow-panel"
        >
          <label className="grid gap-1 text-[12px] font-medium text-dash-muted">
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="rounded-[var(--radius-panel-sm)] border border-dash-border bg-dash-bg px-3 py-1.5 text-[13px] text-dash-ink outline-none focus:border-brand-action" />
          </label>
          <label className="grid gap-1 text-[12px] font-medium text-dash-muted">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="rounded-[var(--radius-panel-sm)] border border-dash-border bg-dash-bg px-3 py-1.5 text-[13px] text-dash-ink outline-none focus:border-brand-action" />
          </label>
          <button type="submit" className="rounded-[var(--radius-panel-sm)] bg-brand-action px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-deep">
            Aplicar
          </button>
        </form>
      )}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-panel-sm)] border border-sem-critical/30 bg-sem-critical-bg px-4 py-3 text-[13px] text-sem-critical-ink">
          <span className="flex items-center gap-2">
            <IconAlert size={16} /> {error}
          </span>
          <button type="button" onClick={() => cargar()} className="rounded-[var(--radius-panel-sm)] border border-sem-critical/30 bg-dash-surface px-3 py-1 font-semibold hover:bg-white">
            Reintentar
          </button>
        </div>
      )}

      {!datos ? (
        error ? null : <EsqueletoDashboard />
      ) : (
        <div className={`grid gap-5 transition-opacity duration-200 ${cargando ? "opacity-60" : ""}`}>
          <DashboardContenido datos={datos} />
        </div>
      )}
    </div>
  );
}

// Selector compacto estilo "caja": etiqueta chica arriba, valor elegido abajo.
// Envuelve <Select> (componente propio) en vez de un <select> nativo.
function SelectorCompacto({ etiqueta, valor, onChange, opciones, todos, destacar, ancho }) {
  const activo = destacar && valor;
  const opcionesSelect = [
    ...(todos != null ? [{ value: "", label: todos }] : []),
    ...opciones.map((o) => ({ value: o.valor, label: o.etiqueta })),
  ];
  return (
    <div
      className={`relative flex min-w-[132px] flex-1 flex-col rounded-[var(--radius-panel-sm)] border bg-dash-surface px-3 py-1.5 shadow-panel transition-colors hover:border-brand-action/40 sm:flex-none ${
        ancho ? "sm:min-w-[170px]" : ""
      } ${activo ? "border-brand-action/60 ring-2 ring-brand-soft" : "border-dash-border"}`}
    >
      <span className="text-[11px] font-medium leading-4 text-dash-muted">{etiqueta}</span>
      <Select
        value={valor}
        onChange={onChange}
        options={opcionesSelect}
        className="[&>button]:border-0 [&>button]:bg-transparent [&>button]:px-0 [&>button]:py-0 [&>button]:text-[13px] [&>button]:font-semibold [&>button]:leading-5 [&>button]:text-dash-ink"
      />
    </div>
  );
}

function EsqueletoDashboard() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Cargando dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid gap-3 rounded-panel border border-dash-border bg-dash-surface p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="grid gap-3 rounded-panel border border-dash-border bg-dash-surface p-5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-44 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- contenido ----------

function DashboardContenido({ datos }) {
  const alertas = useMemo(() => calcularAlertas(datos), [datos]);
  return (
    <>
      <FilaKpis datos={datos} />

      {/* ===== C + alertas: comportamiento de tickets y problemas críticos ===== */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelTitulo titulo="Embudo por estado" subtitulo="Distribución de los tickets del rango por estado actual" icono={IconLayers} />
          <Donut
            apilado
            datos={datos.porEstado.map((d) => ({
              clave: d.estado,
              etiqueta: ETIQUETAS_ESTADO[d.estado] || d.estado,
              color: COLORES_ESTADO[d.estado] || "var(--color-chart-neutral)",
              total: d.total,
            }))}
          />
        </Panel>
        <Panel>
          <PanelTitulo
            titulo="Tendencia mensual"
            subtitulo="Tickets creados vs. cerrados por mes"
            icono={IconTrendingUp}
            info="Creados: tickets radicados en cada mes. Cerrados: tickets del rango cerrados en cada mes (solo cuenta tickets radicados dentro del rango elegido, por eso el primer mes puede mostrar menos cierres de los reales)."
          />
          <TendenciaMensual datos={datos.tendenciaMensual} />
        </Panel>
        <CentroAlertas alertas={alertas} />
      </div>

      {/* ===== D. Análisis de solicitudes ===== */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <PanelTitulo titulo="Por tipo de solicitud" subtitulo="Tickets del rango, de mayor a menor" icono={IconInbox} />
          <ListaBarras items={ordenarDesc(datos.porTipo)} claveDe={(e) => e.tipo} />
        </Panel>
        <Panel>
          <PanelTitulo titulo="Por prioridad" subtitulo="Tickets del rango según su prioridad" icono={IconActivity} />
          <Donut
            compacto
            datos={datos.porPrioridad.map((d) => ({
              clave: d.prioridad,
              etiqueta: d.etiqueta,
              color: COLOR_PRIORIDAD[d.prioridad] || "var(--color-chart-neutral)",
              total: d.total,
            }))}
          />
        </Panel>
        <Panel>
          <PanelTitulo
            titulo="Por motivo"
            subtitulo="Ítems, no tickets: un ticket puede tener varios motivos"
            icono={IconLayers}
            info="Cada ticket puede incluir varios ítems y cada ítem tiene su propio motivo. Por eso la suma de esta lista puede ser mayor que el total de tickets."
            infoLado="izquierda"
          />
          <ListaBarras items={ordenarDesc(datos.porMotivo)} claveDe={(e) => e.etiqueta} color="var(--color-sem-info)" textoVerTodos="Ver todos los motivos" />
        </Panel>
      </div>

      {/* ===== E, F, G. SLA, antigüedad y equipo ===== */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.85fr)_minmax(0,1.6fr)]">
        <PanelSla sla={datos.sla} />
        <PanelAntiguedad aging={datos.aging} />
        <div className="lg:col-span-2 xl:col-span-1">
          <TablaIngenieros agentes={datos.porAgente} />
        </div>
      </div>

      {/* ===== H. Aprobaciones ===== */}
      <SeccionAprobaciones aprobaciones={datos.aprobaciones} tiempos={datos.tiempos} />
    </>
  );
}

// ---------- B. KPI ejecutivos ----------

function FilaKpis({ datos }) {
  const { totales, tiempos } = datos;
  const pctVencidos = totales.abiertos ? Math.round((totales.vencidosActuales / totales.abiertos) * 100) : 0;
  const trs = horasPartes(tiempos.tprHorasPromedio);
  const ttr = horasPartes(tiempos.resolucionHorasPromedio);
  const ta = horasPartes(tiempos.asignacionHorasPromedio);
  const sinDato = { nivel: "neutro", texto: "Sin casos medibles" };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        etiqueta="Tickets en el rango"
        valor={nf.format(totales.tickets)}
        icono={IconInbox}
        detalle={`${nf.format(totales.cerrados)} cerrados`}
        info="Tickets radicados entre la fecha inicial y final del periodo elegido. «Cerrados» cuenta los cerrados que tienen aprobación registrada (los que entran en SLA y TTR)."
        infoLado="derecha"
      />
      <KpiCard
        etiqueta="Abiertos"
        valor={nf.format(totales.abiertos)}
        icono={IconActivity}
        detalle={`${pct(totales.abiertos, totales.tickets)}% del rango`}
        info="Tickets del rango que hoy están en SYS HIGEA: aprobado (sin tomar), en proceso o requiere información."
      />
      <KpiCard
        etiqueta="Vencidos ahora"
        valor={nf.format(totales.vencidosActuales)}
        icono={IconAlert}
        destacado={totales.vencidosActuales > 0}
        estado={totales.vencidosActuales > 0 ? { nivel: "critico", texto: `${pctVencidos}% de los abiertos` } : { nivel: "ok", texto: "Sin vencidos" }}
        info="Tickets abiertos que ya superaron su plazo de SLA (días hábiles según la prioridad, sin contar el tiempo en «requiere info»)."
      />
      <KpiCard
        sigla="TRS"
        etiqueta="Resolución en soporte"
        valor={trs.valor}
        unidad={trs.unidad}
        icono={IconTimer}
        estado={tiempos.tprHorasPromedio == null ? sinDato : null}
        detalle={tiempos.tprHorasPromedio != null ? "Toma → cierre" : null}
        info="TRS — Tiempo de Resolución en Soporte: desde que un ingeniero de SYS HIGEA toma el ticket hasta que lo cierra, pausando mientras espera información del facturador/médico. Solo el tramo que le corresponde a SYS HIGEA, no el ciclo completo."
      />
      <KpiCard
        sigla="TTR"
        etiqueta="Resolución total"
        valor={ttr.valor}
        unidad={ttr.unidad}
        icono={IconCheckCircle}
        estado={tiempos.resolucionHorasPromedio == null ? sinDato : null}
        detalle={tiempos.resolucionHorasPromedio != null ? "Radicación → cierre" : null}
        info="TTR — Tiempo Total de Resolución: ciclo de vida completo, desde que se radica el ticket hasta que se cierra, sin pausas. Cuenta todo, incluidas las devoluciones y el tiempo de aprobación."
      />
      <KpiCard
        sigla="TA"
        etiqueta="Asignación"
        valor={ta.valor}
        unidad={ta.unidad}
        icono={IconUserCheck}
        estado={tiempos.asignacionHorasPromedio == null ? sinDato : null}
        detalle={tiempos.asignacionHorasPromedio != null ? "Aprobación → toma" : null}
        info="TA — Tiempo de Asignación: desde que el ticket queda aprobado (visible para SYS HIGEA) hasta que un ingeniero lo toma."
      />
    </div>
  );
}

// ---------- centro de alertas ----------

const ICONO_SEVERIDAD = { critico: IconOctagonAlert, alerta: IconAlert, info: IconBell };

function CentroAlertas({ alertas }) {
  const [todas, setTodas] = useState(false);
  const LIMITE = 4;
  const visibles = todas ? alertas : alertas.slice(0, LIMITE);
  const relevantes = alertas.filter((a) => a.severidad !== "info").length;

  return (
    <Panel className="lg:col-span-2 xl:col-span-1">
      <PanelTitulo
        titulo={
          <span className="flex items-center gap-2">
            Centro de alertas operativas
            {alertas.length > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
                style={{ background: relevantes ? "var(--color-sem-critical)" : "var(--color-sem-info)" }}
              >
                {alertas.length}
              </span>
            )}
          </span>
        }
        subtitulo="Generadas a partir de los datos del periodo, ordenadas por severidad"
        icono={IconBell}
        info={`Umbrales predeterminados (ajustables a futuro): SLA meta ${UMBRALES_ALERTA.slaMetaPct}% / mínimo ${UMBRALES_ALERTA.slaMinimoPct}%, cola de firma ≥ ${UMBRALES_ALERTA.colaFirmaVolumen} tickets o más de ${UMBRALES_ALERTA.colaFirmaAntiguedadHoras} h, devolución ≥ ${UMBRALES_ALERTA.devolucionPct}%, gestión de aprobación > ${UMBRALES_ALERTA.gestionAprobacionHoras} h, TA > ${UMBRALES_ALERTA.asignacionHoras} h, concentración de un tipo ≥ ${UMBRALES_ALERTA.concentracionTipoPct}%, carga de un ingeniero ≥ ${UMBRALES_ALERTA.cargaIngenieroPct}%.`}
      />
      {alertas.length === 0 ? (
        <EstadoVacio icono={IconCheckCircle}>Sin alertas en este periodo: ningún indicador supera los umbrales predeterminados.</EstadoVacio>
      ) : (
        <ul className="grid gap-2">
          {visibles.map((a) => {
            const s = SEVERIDAD[a.severidad];
            const Icono = ICONO_SEVERIDAD[a.severidad];
            return (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-[var(--radius-panel-sm)] border border-dash-border px-3 py-2.5 transition-colors hover:bg-dash-bg"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-panel-sm)]" style={{ background: s.bg, color: s.ink }}>
                  <Icono size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-snug text-dash-ink">{a.titulo}</p>
                  <p className="text-[12.5px] leading-snug text-dash-muted">{a.descripcion}</p>
                  <p className="mt-1 flex items-start gap-1 text-[12px] leading-snug text-dash-ink/80">
                    <IconArrowRight size={13} className="mt-px shrink-0 text-dash-muted" />
                    {a.accion}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Pastilla nivel={a.severidad} />
                  {a.casos != null && <span className="text-[11.5px] tabular-nums text-dash-muted">{plural(a.casos)}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {alertas.length > LIMITE && (
        <button
          type="button"
          onClick={() => setTodas((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 rounded-[var(--radius-panel-sm)] px-2 py-1 text-[12.5px] font-semibold text-brand-action transition-colors hover:bg-brand-soft"
        >
          {todas ? "Mostrar menos" : `Ver todas (${alertas.length})`}
          {todas ? <IconChevronUp size={14} /> : <IconArrowRight size={14} />}
        </button>
      )}
    </Panel>
  );
}

function plural(n) {
  return `${nf.format(n)} ${n === 1 ? "caso" : "casos"}`;
}

// ---------- E. Cumplimiento de SLA ----------

function PanelSla({ sla }) {
  const h = sla.cumplimientoHistorico;
  const a = sla.abiertosAhora;
  const nivel = nivelCumplimiento(h.porcentaje);
  return (
    <Panel>
      <PanelTitulo
        titulo="Cumplimiento de SLA"
        subtitulo="Cerrados del rango comparados contra su plazo"
        icono={IconShield}
        info="El porcentaje se calcula SOLO sobre tickets cerrados (cerrados a tiempo / cerrados evaluados). Los abiertos se muestran aparte como situación actual y no entran en ese porcentaje."
        infoLado="derecha"
      />
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div className="grid justify-items-center gap-2">
          <AnilloPorcentaje porcentaje={h.porcentaje} etiqueta="cumplimiento" color={nivel === "critico" ? "var(--color-sem-critical)" : nivel === "alerta" ? "var(--color-sem-warning)" : "var(--color-brand-action)"} />
          {h.porcentaje != null && <Pastilla nivel={nivel}>{nivel === "ok" ? `Meta ${UMBRALES_ALERTA.slaMetaPct}% cumplida` : `Bajo meta (${UMBRALES_ALERTA.slaMetaPct}%)`}</Pastilla>}
        </div>
        <div className="grid w-full min-w-0 gap-2">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-dash-muted">Cerrados (base del %)</p>
          <ul className="grid gap-0.5">
            <FilaSlaSimple icono={IconCheckCircle} color="var(--color-brand-action)" etiqueta="A tiempo" valor={h.aTiempo} />
            <FilaSlaSimple icono={IconAlert} color="var(--color-sem-critical)" etiqueta="Vencidos" valor={h.vencidos} />
            <FilaSlaSimple etiqueta="Evaluados" valor={h.aTiempo + h.vencidos} fuerte />
          </ul>
          <p className="mt-1 px-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-dash-muted">Abiertos ahora (aparte)</p>
          <ul className="grid gap-0.5">
            <FilaSlaSimple icono={IconClock} color="var(--color-sem-info)" etiqueta="A tiempo" valor={a.aTiempo} />
            <FilaSlaSimple icono={IconOctagonAlert} color="var(--color-sem-critical)" etiqueta="Vencidos" valor={a.vencidos} critico={a.vencidos > 0} />
          </ul>
        </div>
      </div>
      {h.porcentaje == null && <p className="mt-3 text-[12.5px] text-dash-muted">No hay tickets cerrados con SLA evaluable en este rango.</p>}
    </Panel>
  );
}

function FilaSlaSimple({ icono: Icono, color, etiqueta, valor, fuerte, critico }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded-[var(--radius-panel-sm)] px-2 py-1 ${fuerte ? "bg-dash-bg" : ""}`}>
      <span className={`flex min-w-0 items-center gap-2 text-[13px] ${fuerte ? "font-medium text-dash-muted" : "text-dash-ink"}`}>
        {Icono ? (
          <span className="shrink-0" style={{ color }}>
            <Icono size={15} />
          </span>
        ) : (
          <span className="w-[15px] shrink-0" />
        )}
        {etiqueta}
      </span>
      <b className="shrink-0 text-[13.5px] font-semibold tabular-nums" style={{ color: critico ? "var(--color-sem-critical-ink)" : undefined }}>
        {nf.format(valor)}
      </b>
    </li>
  );
}

// ---------- F. Antigüedad de abiertos ----------

function PanelAntiguedad({ aging }) {
  const total = aging.reduce((s, b) => s + b.total, 0);
  const mayor = aging[aging.length - 1];
  return (
    <Panel>
      <PanelTitulo
        titulo="Antigüedad de abiertos"
        subtitulo="Días calendario desde la radicación"
        icono={IconHourglass}
        info="Tickets aún abiertos (aprobado, en proceso, requiere info) agrupados por días calendario transcurridos desde que se radicaron. Colores: 0-5 días dentro de lo normal, 6-10 atención, más de 10 crítico (criterio de presentación predeterminado)."
      />
      <AntiguedadBarras datos={aging} />
      {mayor && mayor.total > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--radius-panel-sm)] bg-sem-critical-bg px-3 py-2 text-[12.5px] text-sem-critical-ink">
          <IconOctagonAlert size={15} className="mt-px shrink-0" />
          <span>
            <b className="font-semibold">{nf.format(mayor.total)}</b> {mayor.total === 1 ? "ticket lleva" : "tickets llevan"} {mayor.etiqueta.toLowerCase()} abiertos ({pct(mayor.total, total)}% de los abiertos).
          </span>
        </div>
      )}
    </Panel>
  );
}

// ---------- G. Desempeño de ingenieros ----------

const COLUMNAS_ING = [
  { clave: "asignados", etiqueta: "Asignados" },
  { clave: "cerrados", etiqueta: "Cerrados" },
  { clave: "vencidos", etiqueta: "Vencidos", info: "Casos abiertos de ese ingeniero que hoy están vencidos." },
  { clave: "tprHorasPromedio", etiqueta: "TRS", info: "TRS — Tiempo de Resolución en Soporte: desde que toma el ticket hasta que lo cierra, pausando mientras espera información." },
  { clave: "resolucionHorasPromedio", etiqueta: "TTR", info: "TTR — Tiempo Total de Resolución: ciclo completo, desde que se radica hasta que se cierra, sin pausas." },
  {
    clave: "pctCumplimiento",
    etiqueta: "% a tiempo",
    info: "De los tickets que cerró, qué porcentaje cerró antes de su fecha límite de SLA (no cuenta tickets sin fecha límite, ej. cerrados sin pasar por aprobación).",
  },
];

function Encabezado({ clave, etiqueta, info, alinear = "text-right", orden, onOrdenar }) {
  return (
    <th scope="col" className={`whitespace-nowrap px-2 py-2.5 font-semibold ${alinear}`} aria-sort={orden.clave === clave ? (orden.desc ? "descending" : "ascending") : "none"}>
      <span className={`inline-flex items-center gap-0.5 ${alinear === "text-right" ? "flex-row-reverse" : ""}`}>
        <button type="button" onClick={() => onOrdenar(clave)} className="inline-flex items-center gap-0.5 rounded-[4px] hover:text-dash-ink">
          {etiqueta}
          {orden.clave === clave ? orden.desc ? <IconChevronDown size={12} /> : <IconChevronUp size={12} /> : null}
        </button>
        {info && <InfoTip texto={info} />}
      </span>
    </th>
  );
}

function TablaIngenieros({ agentes }) {
  const [orden, setOrden] = useState({ clave: "asignados", desc: true });
  const filas = useMemo(() => {
    const { clave, desc } = orden;
    return [...agentes].sort((a, b) => {
      const va = a[clave];
      const vb = b[clave];
      if (clave === "agente") return desc ? vb.localeCompare(va, "es") : va.localeCompare(vb, "es");
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // sin dato siempre al final
      if (vb == null) return -1;
      return desc ? vb - va : va - vb;
    });
  }, [agentes, orden]);

  function ordenarPor(clave) {
    setOrden((o) => (o.clave === clave ? { clave, desc: !o.desc } : { clave, desc: clave !== "agente" && !["tprHorasPromedio", "resolucionHorasPromedio"].includes(clave) }));
  }

  return (
    <Panel className="h-full">
      <PanelTitulo
        titulo="Desempeño por ingeniero"
        subtitulo="Basado en quién tomó cada caso, no en la cuenta compartida"
        icono={IconUsers}
        info="Vista descriptiva: haga clic en una columna para ordenar. Ningún indicador por sí solo (ej. TRS) mide productividad: depende del volumen, la complejidad y el tipo de casos de cada ingeniero."
      />
      {!agentes.length ? (
        <EstadoVacio icono={IconUsers}>Aún no hay casos tomados con ingeniero registrado en este rango con los filtros elegidos. El nombre se guarda desde «Tomar caso».</EstadoVacio>
      ) : (
        <>
          {/* escritorio / tablet: tabla */}
          <div className="-mx-2 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead>
                <tr className="border-b border-dash-border bg-dash-bg/70 text-[11.5px] uppercase tracking-[0.04em] text-dash-muted">
                  <th scope="col" className="w-8 rounded-l-[8px] px-2 py-2.5 text-left font-semibold">
                    #
                  </th>
                  <Encabezado clave="agente" etiqueta="Ingeniero" alinear="text-left" orden={orden} onOrdenar={ordenarPor} />
                  {COLUMNAS_ING.map((c) => (
                    <Encabezado key={c.clave} {...c} orden={orden} onOrdenar={ordenarPor} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dash-border">
                {filas.map((a, i) => {
                  const nivel = nivelCumplimiento(a.pctCumplimiento);
                  return (
                    <tr key={a.agente} className="transition-colors hover:bg-dash-bg">
                      <td className="px-2 py-2.5 text-[12px] tabular-nums text-dash-muted">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-deep">{iniciales(a.agente)}</span>
                          <span className="font-medium leading-tight">{a.agente}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{nf.format(a.asignados)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{nf.format(a.cerrados)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {a.vencidos > 0 ? (
                          <span className="inline-flex min-w-6 justify-center rounded-full bg-sem-critical-bg px-1.5 font-semibold text-sem-critical-ink">{a.vencidos}</span>
                        ) : (
                          <span className="text-dash-muted">0</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{horas(a.tprHorasPromedio)}</td>
                      <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums">{horas(a.resolucionHorasPromedio)}</td>
                      <td className="w-28 px-2 py-2.5">
                        <div className="grid gap-1">
                          <span className="text-right text-[12.5px] font-semibold tabular-nums" style={{ color: nivel === "critico" ? "var(--color-sem-critical-ink)" : undefined }}>
                            {a.pctCumplimiento == null ? "—" : `${a.pctCumplimiento}%`}
                          </span>
                          <BarraProgreso porcentaje={a.pctCumplimiento} nivel={nivel} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* móvil: tarjetas */}
          <ul className="grid gap-2 sm:hidden">
            {filas.map((a) => {
              const nivel = nivelCumplimiento(a.pctCumplimiento);
              return (
                <li key={a.agente} className="rounded-[var(--radius-panel-sm)] border border-dash-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-deep">{iniciales(a.agente)}</span>
                      <span className="font-medium leading-tight">{a.agente}</span>
                    </span>
                    {a.vencidos > 0 && <Pastilla nivel="critico">{a.vencidos} vencidos</Pastilla>}
                  </div>
                  <dl className="mt-2 grid grid-cols-4 gap-2 text-[12px]">
                    {[
                      ["Asignados", nf.format(a.asignados)],
                      ["Cerrados", nf.format(a.cerrados)],
                      ["TRS", horas(a.tprHorasPromedio)],
                      ["TTR", horas(a.resolucionHorasPromedio)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-dash-muted">{k}</dt>
                        <dd className="font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 grid gap-1">
                    <span className="flex justify-between text-[12px]">
                      <span className="text-dash-muted">% a tiempo</span>
                      <b className="tabular-nums">{a.pctCumplimiento == null ? "—" : `${a.pctCumplimiento}%`}</b>
                    </span>
                    <BarraProgreso porcentaje={a.pctCumplimiento} nivel={nivel} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

// ---------- H. Aprobaciones ----------

// Cadena completa de un flujo en una sola línea horizontal (con scroll si no
// cabe), en vez de partirla en tramos de a dos que obligaban a saltar de fila
// en fila para seguir el proceso completo.
function FlujoLinea({ nodos }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
      {nodos.map((n, i) => (
        <div key={n.nombre + i} className="flex shrink-0 items-center gap-1.5">
          {i > 0 && (
            <div className="flex flex-col items-center gap-0.5 px-1 text-dash-muted">
              <span className="whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-dash-ink">{horas(n.horas)}</span>
              <span className="flex w-10 items-center">
                <span className="h-px flex-1 bg-dash-border" />
                <IconArrowRight size={12} className="shrink-0" />
              </span>
            </div>
          )}
          <span className="whitespace-nowrap rounded-[var(--radius-panel-sm)] border border-dash-border bg-dash-bg px-2.5 py-1.5 text-center text-[12.5px] font-medium text-dash-ink">
            {n.nombre}
          </span>
        </div>
      ))}
    </div>
  );
}

function SeccionAprobaciones({ aprobaciones, tiempos }) {
  if (!aprobaciones) return null;
  const { tiempoPorEtapaHoras: t, gestionConPausasHoras: g, decisionesSupervisora: d, porSupervisora, colaPendiente: c } = aprobaciones;
  const causas = aprobaciones.causasDevolucion || [];
  const nivelDev = d.pctDevolucion == null ? "neutro" : d.pctDevolucion >= UMBRALES_ALERTA.devolucionPct ? "alerta" : "ok";
  const coord = horasPartes(g.coordinadorMedico);
  const sup = horasPartes(g.supervisora);
  const nivelGestion = (h) => (h == null ? { nivel: "neutro", texto: "Sin casos medibles" } : h > UMBRALES_ALERTA.gestionAprobacionHoras ? { nivel: "alerta", texto: `Más de ${UMBRALES_ALERTA.gestionAprobacionHoras} h` } : null);

  return (
    <div className="grid gap-4">
      <BloqueTitulo titulo="Procesos de aprobación" descripcion="Qué tan rápido se mueve un ticket por cada firma hasta llegar a SYS HIGEA" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          etiqueta="Devolución supervisora"
          valor={d.pctDevolucion == null ? "—" : `${d.pctDevolucion}%`}
          icono={IconAlert}
          estado={d.pctDevolucion == null ? { nivel: "neutro", texto: "Sin decisiones" } : { nivel: nivelDev, texto: nivelDev === "ok" ? "Dentro de lo esperado" : `≥ ${UMBRALES_ALERTA.devolucionPct}%` }}
          info="Devueltos ÷ (aprobados + devueltos) de las decisiones de supervisora tomadas dentro del periodo."
          infoLado="derecha"
        />
        <KpiCard
          etiqueta="Coordinador médico lo gestiona en"
          valor={coord.valor}
          unidad={coord.unidad}
          icono={IconClock}
          estado={nivelGestion(g.coordinadorMedico)}
          detalle="Con pausas en devoluciones"
          info="Tiempo real en la bandeja del coordinador: si lo devuelve al médico para corregir, el reloj se detiene hasta que se reenvía."
        />
        <KpiCard
          etiqueta="Supervisora lo gestiona en"
          valor={sup.valor}
          unidad={sup.unidad}
          icono={IconSignature}
          estado={nivelGestion(g.supervisora)}
          detalle="Con pausas en devoluciones"
          info="Tiempo real en la bandeja de la supervisora: si lo devuelve a corregir, el reloj se detiene hasta que se reenvía."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel>
          <PanelTitulo titulo="Decisiones de supervisora" subtitulo="Aprobados vs. devueltos en el periodo" icono={IconSignature} infoLado="derecha" />
          {d.aprobados + d.devueltos === 0 ? (
            <EstadoVacio icono={IconSignature}>Sin decisiones de supervisora en este rango.</EstadoVacio>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-3 gap-2">
                <MiniStat etiqueta="Aprobados" valor={nf.format(d.aprobados)} nivel="ok" />
                <MiniStat etiqueta="Devueltos" valor={nf.format(d.devueltos)} nivel="alerta" />
                <MiniStat etiqueta="% devolución" valor={d.pctDevolucion == null ? "—" : `${d.pctDevolucion}%`} />
              </div>
              <BarraDividida a={d.aprobados} b={d.devueltos} colorB="var(--color-sem-warning)" etiquetaA="Aprobados" etiquetaB="Devueltos" />
            </div>
          )}
        </Panel>

        <Panel>
          <PanelTitulo
            titulo="Cola pendiente de firma"
            subtitulo="Tickets listos ahora mismo para que una supervisora decida"
            icono={IconInbox}
            info="Foto actual de la cola (no depende del periodo elegido). «Vencidos» usa la misma regla de SLA del resto del dashboard: el reloj de SLA empieza cuando el ticket queda aprobado, así que mientras espera esta firma siempre es 0."
          />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat etiqueta="En cola" valor={nf.format(c.total)} nivel={c.total >= UMBRALES_ALERTA.colaFirmaVolumen ? "alerta" : undefined} />
            <MiniStat etiqueta="Vencidos" valor={nf.format(c.vencidos)} nivel="critico" />
            <MiniStat
              etiqueta="Más antiguo"
              valor={horas(c.masAntiguoHoras)}
              nivel={c.masAntiguoHoras != null && c.masAntiguoHoras > UMBRALES_ALERTA.colaFirmaAntiguedadHoras ? "alerta" : undefined}
            />
          </div>
          {c.total === 0 && <p className="mt-3 text-[12.5px] text-dash-muted">No hay tickets esperando firma de supervisora.</p>}
        </Panel>

        <Panel className="lg:col-span-2 xl:col-span-1">
          <PanelTitulo titulo="Causas de devolución" subtitulo="Coordinador médico y supervisora, por motivo registrado" icono={IconLayers} />
          <ListaBarras items={causas} claveDe={(e) => e.etiqueta} color="var(--color-sem-warning)" vacio="Sin devoluciones en este rango." textoVerTodos="Ver todas las causas" />
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel>
          <PanelTitulo
            titulo="Tiempo de espera por etapa"
            subtitulo="Promedio desde que una firma termina hasta que la siguiente decide, hasta el cierre"
            icono={IconClock}
            info="Espera simple hasta la decisión, sin descontar el tiempo en que el ticket estuvo devuelto. La gestión con pausas está en las tarjetas de arriba. El tramo final (Supervisora → SYS HIGEA → Cierre) es el mismo en ambos flujos, porque desde que la supervisora aprueba el camino ya no depende del origen."
          />
          <div className="grid gap-5">
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-dash-muted">Flujo médico</p>
              <FlujoLinea
                nodos={[
                  { nombre: "Médico" },
                  { nombre: "Coordinador médico", horas: t.medicoACoordinador },
                  { nombre: "Supervisora", horas: t.coordinadorASupervisora },
                  { nombre: "SYS HIGEA", horas: tiempos?.asignacionHorasPromedio },
                  { nombre: "Cierre", horas: tiempos?.tprHorasPromedio },
                ]}
              />
            </div>
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-dash-muted">Flujo directo</p>
              <FlujoLinea
                nodos={[
                  { nombre: "Facturador" },
                  { nombre: "Supervisora", horas: t.solicitanteASupervisoraDirecto },
                  { nombre: "SYS HIGEA", horas: tiempos?.asignacionHorasPromedio },
                  { nombre: "Cierre", horas: tiempos?.tprHorasPromedio },
                ]}
              />
            </div>
          </div>
        </Panel>

        {porSupervisora.length > 1 && (
          <Panel>
            <PanelTitulo titulo="Por supervisora" subtitulo="Comparativo entre cuentas con rol de supervisora de facturación" icono={IconUsers} />
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-[13px]">
                <thead>
                  <tr className="border-b border-dash-border bg-dash-bg/70 text-[11.5px] uppercase tracking-[0.04em] text-dash-muted">
                    <th scope="col" className="px-2 py-2.5 text-left font-semibold">Supervisora</th>
                    <th scope="col" className="px-2 py-2.5 text-right font-semibold">Decididos</th>
                    <th scope="col" className="px-2 py-2.5 text-right font-semibold" title="Espera simple hasta su decisión (sin descontar devoluciones)">
                      Tiempo promedio
                    </th>
                    <th scope="col" className="px-2 py-2.5 text-right font-semibold">% devolución</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dash-border">
                  {porSupervisora.map((s) => (
                    <tr key={s.nombre} className="transition-colors hover:bg-dash-bg">
                      <td className="px-2 py-2.5 font-medium">{s.nombre}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{nf.format(s.decididos)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{horas(s.horasPromedio)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{s.pctDevolucion == null ? "—" : `${s.pctDevolucion}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
