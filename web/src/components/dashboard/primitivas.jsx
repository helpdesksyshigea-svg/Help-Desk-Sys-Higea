// Piezas base del dashboard "Control de Gestión": formato de números,
// paneles, títulos, tarjetas KPI, tooltips explicativos y estados vacíos.
// Solo presentación — ningún cálculo de negocio vive aquí.
import { useState } from "react";
import { IconInfo } from "../icons";
import { SEVERIDAD, nf } from "./formato";

// ---------- severidad (color semántico + texto, nunca color solo) ----------

export function Pastilla({ nivel = "neutro", children }) {
  const s = SEVERIDAD[nivel];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold leading-5"
      style={{ background: s.bg, color: s.ink }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} aria-hidden="true" />
      {children ?? s.etiqueta}
    </span>
  );
}

// ---------- tooltip explicativo ----------

// Icono (i) con explicación al pasar el cursor o al enfocarlo con teclado.
// Se posiciona "fixed" calculando el lugar del icono y acotándolo a la
// ventana, para que nunca quede cortado contra un borde (tarjetas pegadas a
// la derecha, pantallas de celular). `lado` queda solo como preferencia.
const ANCHO_TIP = 256;

export function InfoTip({ texto, lado = "izquierda" }) {
  const [pos, setPos] = useState(null);
  if (!texto) return null;

  function mostrar(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const ancho = Math.min(ANCHO_TIP, window.innerWidth - 16);
    const preferido = lado === "derecha" ? r.left : r.right - ancho;
    const left = Math.max(8, Math.min(preferido, window.innerWidth - ancho - 8));
    const abajo = r.bottom + 6;
    // si no cabe debajo, se abre hacia arriba
    const arriba = window.innerHeight - abajo < 140;
    setPos({ left, ancho, top: arriba ? undefined : abajo, bottom: arriba ? window.innerHeight - r.top + 6 : undefined });
  }

  return (
    <span className="relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="button"
        aria-label={texto}
        onMouseEnter={mostrar}
        onMouseLeave={() => setPos(null)}
        onFocus={mostrar}
        onBlur={() => setPos(null)}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full text-dash-muted transition-colors hover:bg-dash-track hover:text-dash-ink"
      >
        <IconInfo size={14} />
      </span>
      {pos && (
        <span
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-[10px] bg-brand-deep px-3 py-2 text-left text-[12px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.ancho }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}

// ---------- contenedores ----------

export function Panel({ className = "", children, destacado, ...props }) {
  return (
    <section
      className={`min-w-0 rounded-panel border bg-dash-surface p-5 shadow-panel transition-shadow duration-200 hover:shadow-panel-hover ${
        destacado ? "border-sem-critical/35" : "border-dash-border"
      } ${className}`}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelTitulo({ titulo, subtitulo, icono: Icono, info, accion, infoLado }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icono && (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-soft text-brand-action">
            <Icono size={15} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-[15px] font-semibold leading-6 text-dash-ink">
            {titulo}
            <InfoTip texto={info} lado={infoLado} />
          </h3>
          {subtitulo && <p className="text-[12.5px] leading-snug text-dash-muted">{subtitulo}</p>}
        </div>
      </div>
      {accion && <div className="shrink-0">{accion}</div>}
    </header>
  );
}

// Encabezado de cada bloque del dashboard (Comportamiento, SLA, Equipo...).
export function BloqueTitulo({ titulo, descripcion, numero }) {
  return (
    <div className="flex items-end justify-between gap-3 pt-2">
      <div>
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-tight text-dash-ink">
          {numero && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-brand-deep px-1 text-[11px] font-semibold text-white">
              {numero}
            </span>
          )}
          {titulo}
        </h2>
        {descripcion && <p className="mt-0.5 text-[13px] text-dash-muted">{descripcion}</p>}
      </div>
    </div>
  );
}

export function EstadoVacio({ children, icono: Icono }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-dash-border px-4 py-8 text-center">
      {Icono && (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dash-track text-dash-muted">
          <Icono size={16} />
        </span>
      )}
      <p className="max-w-xs text-[13px] text-dash-muted">{children}</p>
    </div>
  );
}

// ---------- tarjeta KPI ----------

export function KpiCard({ etiqueta, sigla, valor, unidad, icono: Icono, estado, detalle, info, destacado, infoLado }) {
  const s = SEVERIDAD[estado?.nivel || "neutro"];
  return (
    <div
      className={`group relative flex min-w-0 flex-col gap-3 rounded-panel border p-4 shadow-panel transition-shadow duration-200 hover:shadow-panel-hover ${
        destacado ? "border-sem-critical/35 bg-sem-critical-bg" : "border-dash-border bg-dash-surface"
      }`}
    >
      {destacado && <span className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-sem-critical" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12.5px] font-medium leading-snug text-dash-muted">
          {sigla && <span className="mr-1 font-semibold text-dash-ink">{sigla}</span>}
          {etiqueta}
          {info && (
            <span className="ml-0.5">
              <InfoTip texto={info} lado={infoLado} />
            </span>
          )}
        </p>
        {Icono && (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: destacado ? "var(--color-dash-surface)" : "var(--color-brand-soft)", color: destacado ? s.ink : "var(--color-brand-action)" }}
          >
            <Icono size={16} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[30px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: destacado ? s.ink : "var(--color-dash-ink)" }}>
          {valor}
        </span>
        {unidad && <span className="text-[14px] font-medium text-dash-muted">{unidad}</span>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        {estado && <Pastilla nivel={estado.nivel}>{estado.texto}</Pastilla>}
        {detalle && <span className="text-[12px] text-dash-muted">{detalle}</span>}
      </div>
    </div>
  );
}

// Valor compacto dentro de un panel (ej. "Cerrados a tiempo: 42").
export function MiniStat({ etiqueta, valor, nivel, nota }) {
  const s = nivel ? SEVERIDAD[nivel] : null;
  return (
    <div className="min-w-0 rounded-[10px] border border-dash-border bg-dash-bg/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[12px] text-dash-muted">
        {s && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden="true" />}
        <span>{etiqueta}</span>
      </div>
      <div className="mt-0.5 text-[20px] font-semibold leading-tight tabular-nums" style={{ color: s && nivel === "critico" && valor !== 0 && valor !== "0" ? s.ink : "var(--color-dash-ink)" }}>
        {valor}
      </div>
      {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-dash-muted">{nota}</p>}
    </div>
  );
}

// Barra de progreso partida en dos tramos (cumple / no cumple). Si no hay
// total, muestra la pista vacía en vez de una barra engañosa.
export function BarraDividida({ a, b, colorA = "var(--color-brand-action)", colorB = "var(--color-sem-critical)", etiquetaA, etiquetaB, alto = "h-2.5" }) {
  const total = a + b;
  const pa = total ? (a / total) * 100 : 0;
  return (
    <div className="grid gap-1.5">
      <div className={`flex ${alto} w-full gap-[2px] overflow-hidden rounded-full bg-dash-track`} role="img" aria-label={`${etiquetaA}: ${a}; ${etiquetaB}: ${b}`}>
        {total > 0 && a > 0 && <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pa}%`, background: colorA }} title={`${etiquetaA}: ${a}`} />}
        {total > 0 && b > 0 && <div className="h-full flex-1 rounded-full transition-all duration-500" style={{ background: colorB }} title={`${etiquetaB}: ${b}`} />}
      </div>
      {etiquetaA && (
        <div className="flex justify-between gap-3 text-[12px] text-dash-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorA }} aria-hidden="true" />
            {etiquetaA} · <b className="font-semibold tabular-nums text-dash-ink">{nf.format(a)}</b>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorB }} aria-hidden="true" />
            {etiquetaB} · <b className="font-semibold tabular-nums text-dash-ink">{nf.format(b)}</b>
          </span>
        </div>
      )}
    </div>
  );
}

// Barra simple de progreso 0-100 con color según tramo (se usa en la tabla de
// ingenieros). Valores fuera de 0-100 se recortan SOLO en el dibujo.
export function BarraProgreso({ porcentaje, nivel }) {
  const s = SEVERIDAD[nivel || "neutro"];
  const ancho = Math.max(0, Math.min(100, porcentaje ?? 0));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-dash-track">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ancho}%`, background: s.color }} />
    </div>
  );
}
