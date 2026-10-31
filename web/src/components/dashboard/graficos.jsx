// Gráficos del dashboard "Control de Gestión", dibujados a mano con SVG/CSS
// (sin librería de gráficos: cero dependencias nuevas y control total del
// estilo). Todos reciben datos ya calculados por el backend; aquí solo se
// dibuja, nunca se recalcula un indicador.
import { useLayoutEffect, useRef, useState } from "react";
import { EstadoVacio } from "./primitivas";
import { nf, pct } from "./formato";
import { IconArrowRight, IconChart, IconChevronUp } from "../icons";

// ---------- dona ----------

// Dona genérica: recibe {clave, etiqueta, color, total}. Al pasar el cursor
// por un segmento o por su fila de leyenda, el centro muestra su detalle (en
// vez de un tooltip flotante que tape el gráfico). `resaltado` permite que un
// filtro externo deje fijo un segmento.
export function Donut({ datos, etiquetaTotal = "tickets", resaltado = null, vacio = "Sin tickets en este rango.", compacto = false, apilado = false }) {
  const [activo, setActivo] = useState(null);
  const visibles = datos.filter((d) => d.total > 0);
  const total = visibles.reduce((s, d) => s + d.total, 0);
  if (!total) return <EstadoVacio icono={IconChart}>{vacio}</EstadoVacio>;

  const R = 56;
  const C = 2 * Math.PI * R;
  // 2 unidades de separación entre segmentos (spacer de superficie) salvo
  // que haya un solo segmento, que debe cerrar el anillo completo.
  const GAP = visibles.length > 1 ? 2 : 0;
  const segmentos = visibles.map((d, i) => {
    const previo = visibles.slice(0, i).reduce((s, x) => s + x.total, 0);
    const dash = Math.max(0.5, (d.total / total) * C - GAP);
    return { ...d, dash, offset: (previo / total) * C };
  });

  const foco = activo ?? resaltado;
  const dFoco = visibles.find((d) => d.clave === foco);
  const leyenda = [...visibles].sort((a, b) => b.total - a.total);

  return (
    <div className={`flex flex-col items-center gap-5 ${apilado ? "" : "sm:flex-row sm:items-center"}`}>
      <div className={`relative shrink-0 ${apilado ? "h-44 w-44" : compacto ? "h-32 w-32" : "h-40 w-40"}`}>
        <svg viewBox="0 0 160 160" className="h-full w-full" role="img" aria-label={`Distribución de ${nf.format(total)} ${etiquetaTotal}`}>
          <g transform="rotate(-90 80 80)">
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-dash-track)" strokeWidth="18" />
            {segmentos.map((s) => (
              <circle
                key={s.clave}
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={foco === s.clave ? 22 : 18}
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset}
                opacity={foco && foco !== s.clave ? 0.28 : 1}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setActivo(s.clave)}
                onMouseLeave={() => setActivo(null)}
              >
                <title>{`${s.etiqueta}: ${nf.format(s.total)} (${pct(s.total, total)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className={`${compacto ? "text-[22px]" : "text-[26px]"} font-semibold leading-none tabular-nums text-dash-ink`}>{nf.format(dFoco ? dFoco.total : total)}</span>
          <span className="mt-1 text-[11.5px] leading-tight text-dash-muted">
            {dFoco ? `${dFoco.etiqueta} · ${pct(dFoco.total, total)}%` : etiquetaTotal}
          </span>
        </div>
      </div>
      <ul className="grid w-full min-w-0 gap-0.5">
        {leyenda.map((d) => (
          <li
            key={d.clave}
            onMouseEnter={() => setActivo(d.clave)}
            onMouseLeave={() => setActivo(null)}
            className={`flex items-center justify-between gap-3 rounded-[8px] px-2 py-1.5 text-[13px] transition-colors ${
              foco === d.clave ? "bg-dash-track" : "hover:bg-dash-bg"
            } ${foco && foco !== d.clave ? "opacity-55" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: d.color }} aria-hidden="true" />
              <span className="leading-snug text-dash-ink">{d.etiqueta}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              <b className="font-semibold text-dash-ink">{nf.format(d.total)}</b>
              <span className="ml-1.5 inline-block w-9 text-right text-dash-muted">{pct(d.total, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- barras horizontales ----------

// Etiqueta completa en su propia línea (sin truncar) y la barra debajo, con
// cantidad y porcentaje a la derecha.
export function BarraHorizontal({ etiqueta, total, maximo, totalGeneral, color = "var(--color-brand-action)", atenuado, resaltado }) {
  const ancho = maximo ? Math.max(1.5, (total / maximo) * 100) : 0;
  return (
    <div
      className={`grid gap-1 rounded-[8px] px-2 py-1.5 transition-all duration-200 hover:bg-dash-bg ${atenuado ? "opacity-40" : ""} ${resaltado ? "bg-brand-soft/60" : ""}`}
      title={`${etiqueta}: ${nf.format(total)}${totalGeneral ? ` (${pct(total, totalGeneral)}%)` : ""}`}
    >
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 break-words leading-snug text-dash-ink">{etiqueta}</span>
        <span className="shrink-0 tabular-nums">
          <b className="font-semibold text-dash-ink">{nf.format(total)}</b>
          {totalGeneral ? <span className="ml-1.5 inline-block w-9 text-right text-dash-muted">{pct(total, totalGeneral)}%</span> : null}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-dash-track">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ancho}%`, background: color }} />
      </div>
    </div>
  );
}

// Lista de barras ya ordenada, con "mostrar todos" cuando es larga para no
// saturar el panel.
export function ListaBarras({ items, claveDe, color, resaltado, vacio = "Sin registros en este rango.", limite = 6, textoVerTodos = "Ver todas" }) {
  const [todos, setTodos] = useState(false);
  if (!items.length) return <EstadoVacio icono={IconChart}>{vacio}</EstadoVacio>;
  const maximo = Math.max(1, ...items.map((e) => e.total));
  const totalGeneral = items.reduce((s, e) => s + e.total, 0);
  const visibles = todos ? items : items.slice(0, limite);
  return (
    <div className="grid gap-0.5">
      {visibles.map((e) => {
        const clave = claveDe(e);
        return (
          <BarraHorizontal
            key={clave}
            etiqueta={e.etiqueta}
            total={e.total}
            maximo={maximo}
            totalGeneral={totalGeneral}
            color={color}
            resaltado={resaltado && resaltado === clave}
            atenuado={resaltado && resaltado !== clave}
          />
        );
      })}
      {items.length > limite && (
        <button
          type="button"
          onClick={() => setTodos((v) => !v)}
          className="mt-1 inline-flex items-center gap-1 justify-self-start rounded-[8px] px-2 py-1 text-[12.5px] font-semibold text-brand-action transition-colors hover:bg-brand-soft"
        >
          {todos ? "Mostrar menos" : `${textoVerTodos} (${items.length})`}
          {todos ? <IconChevronUp size={14} /> : <IconArrowRight size={14} />}
        </button>
      )}
    </div>
  );
}

// ---------- utilidades de ejes ----------

function useAncho() {
  const ref = useRef(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setAncho(el.clientWidth);
    const ro = new ResizeObserver(([entrada]) => setAncho(entrada.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho];
}

// Escala "redonda" para el eje Y (1, 2, 5, 10, 20, 50...), siempre entera.
function escalaY(maximo, marcas = 4) {
  const bruto = Math.max(1, maximo) / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / potencia;
  const paso = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * potencia);
  const tope = Math.max(paso, Math.ceil(maximo / paso) * paso);
  const ticks = [];
  for (let v = 0; v <= tope; v += paso) ticks.push(v);
  return { tope, ticks };
}

// Rectángulo con solo las esquinas superiores redondeadas (el extremo de
// datos), anclado plano a la línea base.
function columna(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ---------- tendencia mensual ----------

const COLOR_CREADOS = "var(--color-sem-info)";
const COLOR_CERRADOS = "var(--color-brand-action)";

export function TendenciaMensual({ datos }) {
  const [ref, ancho] = useAncho();
  const [activo, setActivo] = useState(null);

  const H = 270;
  const PAD = { izq: 34, der: 8, sup: 22, inf: 34 };
  const W = Math.max(280, ancho);
  const plotW = W - PAD.izq - PAD.der;
  const plotH = H - PAD.sup - PAD.inf;
  const n = datos.length;
  const { tope, ticks } = escalaY(Math.max(0, ...datos.flatMap((d) => [d.creados, d.cerrados])));
  const banda = n ? plotW / n : 0;
  const barW = Math.max(4, Math.min(26, (banda - 14) / 2));
  const y = (v) => PAD.sup + plotH - (v / tope) * plotH;
  const variosAnios = new Set(datos.map((d) => d.mes.slice(0, 4))).size > 1;
  const mostrarValores = banda >= 56;
  const d = activo != null ? datos[activo] : null;

  return (
    <div ref={ref} className="relative min-w-0">
      {!n ? (
        <EstadoVacio icono={IconChart}>Sin datos suficientes en este rango.</EstadoVacio>
      ) : (
        ancho > 0 && (
          <>
            <svg width={W} height={H} className="block" role="img" aria-label="Tickets creados y cerrados por mes">
              {/* meses con más creados que cerrados: banda de atención detrás de las barras */}
              {datos.map((m, i) =>
                m.creados > m.cerrados ? (
                  <rect key={`b${m.mes}`} x={PAD.izq + i * banda + 2} y={PAD.sup - 14} width={banda - 4} height={plotH + 14} rx="6" fill="var(--color-sem-warning-bg)" />
                ) : null,
              )}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.izq} x2={W - PAD.der} y1={y(t)} y2={y(t)} stroke="var(--color-dash-border)" strokeDasharray={t === 0 ? undefined : "3 4"} />
                  <text x={PAD.izq - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--color-dash-muted)" className="tabular-nums">
                    {nf.format(t)}
                  </text>
                </g>
              ))}
              {datos.map((m, i) => {
                const cx = PAD.izq + i * banda + banda / 2;
                const [anio, mes] = m.mes.split("-");
                const corto = MESES[Number(mes) - 1]?.slice(0, 3) || m.mes;
                const hC = (m.creados / tope) * plotH;
                const hK = (m.cerrados / tope) * plotH;
                const enfocado = activo === i;
                return (
                  <g key={m.mes} opacity={activo != null && !enfocado ? 0.45 : 1} className="transition-opacity duration-150">
                    <path d={columna(cx - barW - 1, y(m.creados), barW, hC)} fill={COLOR_CREADOS} />
                    <path d={columna(cx + 1, y(m.cerrados), barW, hK)} fill={COLOR_CERRADOS} />
                    {mostrarValores && (
                      <>
                        <text x={cx - barW / 2 - 1} y={y(m.creados) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-dash-ink)" className="tabular-nums">
                          {m.creados}
                        </text>
                        <text x={cx + barW / 2 + 1} y={y(m.cerrados) - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-dash-ink)" className="tabular-nums">
                          {m.cerrados}
                        </text>
                      </>
                    )}
                    {m.creados > m.cerrados && (
                      <text x={cx} y={PAD.sup - 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-sem-warning-ink)">
                        +{m.creados - m.cerrados}
                      </text>
                    )}
                    <text x={cx} y={H - PAD.inf + 16} textAnchor="middle" fontSize="11.5" fill={enfocado ? "var(--color-dash-ink)" : "var(--color-dash-muted)"} fontWeight={enfocado ? 600 : 400}>
                      {corto}
                      {variosAnios || i === 0 ? ` ${anio.slice(2)}` : ""}
                    </text>
                    {/* zona de hover: toda la columna del mes, más grande que las barras */}
                    <rect
                      x={PAD.izq + i * banda}
                      y={PAD.sup - 14}
                      width={banda}
                      height={plotH + 14 + PAD.inf}
                      fill="transparent"
                      onMouseEnter={() => setActivo(i)}
                      onMouseLeave={() => setActivo(null)}
                      onTouchStart={() => setActivo(i)}
                    />
                  </g>
                );
              })}
            </svg>
            {d && (
              <div
                className="pointer-events-none absolute top-1 z-20 w-48 rounded-[10px] border border-dash-border bg-dash-surface px-3 py-2 text-[12.5px] shadow-lg"
                style={{ left: Math.min(Math.max(0, PAD.izq + activo * banda + banda / 2 - 96), W - 192) }}
              >
                <p className="font-semibold text-dash-ink">
                  {MESES[Number(d.mes.split("-")[1]) - 1]} {d.mes.split("-")[0]}
                </p>
                <div className="mt-1 grid gap-0.5 tabular-nums">
                  <span className="flex justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-dash-muted">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_CREADOS }} /> Creados
                    </span>
                    <b className="text-dash-ink">{nf.format(d.creados)}</b>
                  </span>
                  <span className="flex justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-dash-muted">
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: COLOR_CERRADOS }} /> Cerrados
                    </span>
                    <b className="text-dash-ink">{nf.format(d.cerrados)}</b>
                  </span>
                  <span className="mt-1 flex justify-between gap-2 border-t border-dash-border pt-1">
                    <span className="text-dash-muted">Diferencia del mes</span>
                    <b style={{ color: d.creados > d.cerrados ? "var(--color-sem-warning-ink)" : "var(--color-brand-action)" }}>
                      {d.creados - d.cerrados > 0 ? "+" : ""}
                      {d.creados - d.cerrados}
                    </b>
                  </span>
                </div>
              </div>
            )}
          </>
        )
      )}
      {n > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-dash-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR_CREADOS }} /> Creados
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOR_CERRADOS }} /> Cerrados
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 rounded-[3px] border border-sem-warning/40 bg-sem-warning-bg" /> Mes con más creados que cerrados
          </span>
        </div>
      )}
    </div>
  );
}

// ---------- antigüedad de abiertos ----------

// Color por tramo de antigüedad: los dos primeros tramos en la familia de la
// marca (dentro de lo normal) y los dos últimos en atención / crítico. Es un
// criterio de presentación predeterminado (ver UMBRALES_ALERTA en alertas.js),
// no una regla de negocio del backend.
const COLOR_TRAMO = ["var(--color-brand-mist)", "var(--color-brand-action)", "var(--color-sem-warning)", "var(--color-sem-critical)"];

export function AntiguedadBarras({ datos }) {
  const total = datos.reduce((s, b) => s + b.total, 0);
  if (!total) return <EstadoVacio icono={IconChart}>No hay tickets abiertos en este rango.</EstadoVacio>;
  const { tope, ticks } = escalaY(Math.max(...datos.map((b) => b.total)), 3);
  const ALTO = 150;
  return (
    <div className="grid gap-2">
      <div className="relative" style={{ height: ALTO + 22 }}>
        {/* líneas guía con su escala */}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: (t / tope) * ALTO + 22 - 7 }}>
            <span className="w-7 text-right text-[11px] tabular-nums text-dash-muted">{t}</span>
            <span className={`h-px flex-1 ${t === 0 ? "bg-dash-border" : "border-t border-dashed border-dash-border"}`} />
          </div>
        ))}
        <div className="absolute bottom-[22px] left-9 right-0 top-0 flex items-end justify-around gap-3">
          {datos.map((b, i) => {
            const h = (b.total / tope) * ALTO;
            return (
              <div key={b.etiqueta} className="group flex h-full max-w-[72px] flex-1 flex-col items-center justify-end" title={`${b.etiqueta}: ${b.total} (${pct(b.total, total)}%)`}>
                <span className="mb-1 text-[12px] font-semibold tabular-nums text-dash-ink">{b.total}</span>
                <div
                  className="w-full rounded-t-[5px] transition-all duration-500 group-hover:brightness-95"
                  style={{ height: b.total ? Math.max(3, h) : 0, background: COLOR_TRAMO[i] || "var(--color-chart-neutral)" }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="ml-9 flex justify-around gap-3">
        {datos.map((b) => (
          <div key={b.etiqueta} className="max-w-[72px] flex-1 text-center">
            <p className="text-[11.5px] leading-tight text-dash-ink">{b.etiqueta}</p>
            <p className="text-[11px] tabular-nums text-dash-muted">{pct(b.total, total)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- anillo de porcentaje (cumplimiento de SLA) ----------

// Un solo valor sobre 100: tramo cumplido en el color de cumplimiento y el
// resto en la pista neutra. Sin dato -> anillo vacío con guion.
export function AnilloPorcentaje({ porcentaje, color = "var(--color-brand-action)", etiqueta }) {
  const R = 56;
  const C = 2 * Math.PI * R;
  const p = porcentaje == null ? 0 : Math.max(0, Math.min(100, porcentaje));
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full" role="img" aria-label={`${etiqueta}: ${porcentaje == null ? "sin dato" : `${porcentaje}%`}`}>
        <g transform="rotate(-90 80 80)">
          <circle cx="80" cy="80" r={R} fill="none" stroke="var(--color-dash-track)" strokeWidth="16" />
          {p > 0 && (
            <circle
              cx="80"
              cy="80"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="16"
              strokeLinecap={p < 100 ? "round" : "butt"}
              strokeDasharray={`${(p / 100) * C} ${C}`}
              className="transition-all duration-700"
            />
          )}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[24px] font-semibold leading-none tabular-nums text-dash-ink">{porcentaje == null ? "—" : `${porcentaje}%`}</span>
        <span className="mt-1 max-w-[90px] text-[11px] leading-tight text-dash-muted">{etiqueta}</span>
      </div>
    </div>
  );
}
