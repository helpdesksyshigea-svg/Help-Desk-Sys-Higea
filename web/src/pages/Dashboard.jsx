import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { IconSearch, IconClock, IconCheck, IconAlert, IconInbox } from "../components/icons";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]";

function Mensaje({ error }) {
  if (!error) return null;
  return <p className="text-sm text-[#b3362a]">{error}</p>;
}

function Barra({ porcentaje }) {
  const color = porcentaje > 80 ? "var(--color-state-cerrado)" : porcentaje > 50 ? "var(--color-state-devuelto)" : "#b3362a";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/10">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, porcentaje)}%`, background: color }} />
    </div>
  );
}

function fechaInputDe(diasAtras) {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  return d.toISOString().slice(0, 10);
}

function horas(n) {
  if (n == null) return "—";
  if (n < 1) return Math.round(n * 60) + " min";
  if (n < 48) return n.toFixed(1) + " h";
  return (n / 24).toFixed(1) + " d";
}

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  en_proceso: "En proceso",
  requiere_info: "Requiere info",
  cerrado: "Cerrado",
};

function CardNumero({ etiqueta, valor, icon: Icon, acento }) {
  return (
    <div className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--color-muted)]">{etiqueta}</span>
        {Icon && (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ background: acento ? `${acento}22` : "var(--color-ink)0d", color: acento || "var(--color-muted)" }}
          >
            <Icon size={13} />
          </span>
        )}
      </div>
      <span className="text-2xl font-semibold tracking-tight">{valor}</span>
    </div>
  );
}

function SeccionTitulo({ children, subtitulo }) {
  return (
    <div className="grid gap-0.5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">{children}</h3>
      {subtitulo && <p className="text-xs text-[var(--color-muted)]/80">{subtitulo}</p>}
    </div>
  );
}

// ---------- donut de estados, SVG a mano ----------
const COLORES_ESTADO = {
  pendiente: "#6a4fa0",
  devuelto: "#9a5b06",
  aprobado: "#3656a3",
  en_proceso: "#9a5b06",
  requiere_info: "#b3362a",
  cerrado: "#2c7536",
};

function DonutEstados({ datos }) {
  const total = datos.reduce((s, d) => s + d.total, 0);
  if (!total) return <p className="text-sm text-[var(--color-muted)]">Sin tickets en este rango.</p>;

  const R = 54;
  const C = 2 * Math.PI * R;
  let acumulado = 0;
  const segmentos = datos
    .filter((d) => d.total > 0)
    .map((d) => {
      const frac = d.total / total;
      const dash = frac * C;
      const offset = acumulado * C;
      acumulado += frac;
      return { ...d, dash, offset };
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-ink)" strokeOpacity="0.06" strokeWidth="18" />
        {segmentos.map((s) => (
          <circle
            key={s.estado}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={COLORES_ESTADO[s.estado] || "var(--color-ink)"}
            strokeWidth="18"
            strokeDasharray={`${s.dash} ${C - s.dash}`}
            strokeDashoffset={-s.offset}
          />
        ))}
      </svg>
      <div className="grid w-full gap-1.5">
        {datos
          .filter((d) => d.total > 0)
          .sort((a, b) => b.total - a.total)
          .map((d) => (
            <div key={d.estado} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORES_ESTADO[d.estado] || "var(--color-ink)" }} />
                <span className="truncate">{ETIQUETAS_ESTADO[d.estado] || d.estado}</span>
              </span>
              <span className="shrink-0 font-medium">
                {d.total} <span className="text-[var(--color-muted)]">({Math.round((d.total / total) * 100)}%)</span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

function BarraHorizontal({ etiqueta, total, maximo, color = "var(--color-ink)" }) {
  const pct = maximo ? Math.max(2, (total / maximo) * 100) : 0;
  return (
    <div className="grid grid-cols-[140px_1fr_28px] items-center gap-2 text-sm">
      <span className="truncate text-[var(--color-muted)]" title={etiqueta}>
        {etiqueta}
      </span>
      <div className="h-5 overflow-hidden rounded-[var(--radius-button)] bg-[var(--color-ink)]/[0.06]">
        <div className="h-full rounded-[var(--radius-button)] transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-right font-medium">{total}</span>
    </div>
  );
}

// ---------- tendencia mensual, línea SVG a mano ----------
function TendenciaMensual({ datos }) {
  if (!datos.length) return <p className="text-sm text-[var(--color-muted)]">Sin datos suficientes en este rango.</p>;

  const W = 560;
  const H = 160;
  const PAD = 24;
  const maxVal = Math.max(1, ...datos.flatMap((d) => [d.creados, d.cerrados]));
  const pasoX = datos.length > 1 ? (W - PAD * 2) / (datos.length - 1) : 0;
  const puntos = (campo) =>
    datos.map((d, i) => {
      const x = PAD + i * pasoX;
      const y = H - PAD - (d[campo] / maxVal) * (H - PAD * 2);
      return `${x},${y}`;
    });

  const mesCorto = (m) => {
    const [, mes] = m.split("-");
    return ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][Number(mes)];
  };

  return (
    <div className="grid gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <polyline points={puntos("creados").join(" ")} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeOpacity="0.35" />
        <polyline points={puntos("cerrados").join(" ")} fill="none" stroke="var(--color-state-cerrado)" strokeWidth="2.5" />
        {datos.map((d, i) => (
          <circle key={d.mes + "c"} cx={PAD + i * pasoX} cy={H - PAD - (d.cerrados / maxVal) * (H - PAD * 2)} r="3" fill="var(--color-state-cerrado)" />
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-[var(--color-muted)]">
        {datos.map((d) => (
          <span key={d.mes}>{mesCorto(d.mes)}</span>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--color-ink)]/35" /> Creados
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--color-state-cerrado)]" /> Cerrados
        </span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [desde, setDesde] = useState(fechaInputDe(90));
  const [hasta, setHasta] = useState(fechaInputDe(0));

  async function cargar() {
    try {
      setError(null);
      const r = await apiFetch(`/dashboard/resumen?desde=${desde}&hasta=${hasta}`);
      setDatos(r);
    } catch (e) {
      setError(`No se pudo cargar el dashboard. ${e.message}`);
    }
  }
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Dashboard ejecutivo</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Gestión de tickets: volumen, cumplimiento de SLA y tiempos de respuesta.</p>
      </div>

      <Card className="grid gap-3">
        {error && <Mensaje error={error} />}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setDatos(null);
            cargar();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="text-sm">
            <span className="mb-1 block font-medium">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputClass} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputClass} />
          </label>
          <Button type="submit" variant="ghost">
            <IconSearch size={15} />
            Aplicar
          </Button>
        </form>
      </Card>

      {!datos ? (
        error ? null : <p className="text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DashboardContenido datos={datos} />
      )}
    </div>
  );
}

function DashboardContenido({ datos }) {
  const maxTipo = Math.max(1, ...datos.porTipo.map((e) => e.total));
  const maxPrioridad = Math.max(1, ...datos.porPrioridad.map((e) => e.total));
  const maxMotivo = Math.max(1, ...datos.porMotivo.map((e) => e.total));
  const maxAging = Math.max(1, ...datos.aging.map((e) => e.total));
  const pctSla = datos.sla.cumplimientoHistorico.porcentaje;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CardNumero etiqueta="Tickets en el rango" valor={datos.totales.tickets} icon={IconInbox} />
        <CardNumero etiqueta="Abiertos" valor={datos.totales.abiertos} icon={IconClock} acento="#9a5b06" />
        <CardNumero etiqueta="Vencidos ahora" valor={datos.totales.vencidosActuales} icon={IconAlert} acento="#b3362a" />
        <CardNumero etiqueta="TPR promedio" valor={horas(datos.tiempos.tprHorasPromedio)} icon={IconClock} acento="#3656a3" />
        <CardNumero etiqueta="Resolución promedio" valor={horas(datos.tiempos.resolucionHorasPromedio)} icon={IconCheck} acento="#2c7536" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-4">
          <SeccionTitulo subtitulo="Distribución de los tickets del rango por estado actual">Embudo por estado</SeccionTitulo>
          <DonutEstados datos={datos.porEstado} />
        </Card>

        <Card className="grid gap-4">
          <SeccionTitulo subtitulo="Tickets creados vs. cerrados por mes">Tendencia mensual</SeccionTitulo>
          <TendenciaMensual datos={datos.tendenciaMensual} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="grid gap-3">
          <SeccionTitulo>Por tipo de solicitud</SeccionTitulo>
          <div className="grid gap-1.5">
            {datos.porTipo.map((e) => (
              <BarraHorizontal key={e.tipo} etiqueta={e.etiqueta} total={e.total} maximo={maxTipo} />
            ))}
          </div>
        </Card>
        <Card className="grid gap-3">
          <SeccionTitulo>Por prioridad</SeccionTitulo>
          <div className="grid gap-1.5">
            {datos.porPrioridad.map((e) => (
              <BarraHorizontal
                key={e.prioridad}
                etiqueta={e.etiqueta}
                total={e.total}
                maximo={maxPrioridad}
                color={e.prioridad === "alta" ? "#b3362a" : e.prioridad === "normal" ? "#9a5b06" : "var(--color-ink)"}
              />
            ))}
          </div>
        </Card>
        <Card className="grid gap-3">
          <SeccionTitulo subtitulo="Ítems, no tickets — uno puede tener varios">Por motivo</SeccionTitulo>
          <div className="grid gap-1.5">
            {datos.porMotivo.length ? (
              datos.porMotivo.map((e) => <BarraHorizontal key={e.etiqueta} etiqueta={e.etiqueta} total={e.total} maximo={maxMotivo} />)
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Sin registros en este rango.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-4">
          <SeccionTitulo subtitulo="Tickets cerrados en el rango, comparado contra el plazo de SLA">Cumplimiento de SLA</SeccionTitulo>
          {pctSla == null ? (
            <p className="text-sm text-[var(--color-muted)]">No hay tickets cerrados con SLA evaluable en este rango.</p>
          ) : (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between text-sm">
                <span>
                  {datos.sla.cumplimientoHistorico.aTiempo} a tiempo · {datos.sla.cumplimientoHistorico.vencidos} vencidos
                </span>
                <span className="text-lg font-semibold">{pctSla}%</span>
              </div>
              <Barra porcentaje={pctSla} />
            </div>
          )}
          <p className="text-xs text-[var(--color-muted)]">
            Abiertos ahora: {datos.sla.abiertosAhora.aTiempo} a tiempo, {datos.sla.abiertosAhora.vencidos} vencidos.
          </p>
        </Card>

        <Card className="grid gap-3">
          <SeccionTitulo subtitulo="Días transcurridos desde la radicación de los tickets aún abiertos">Antigüedad de abiertos</SeccionTitulo>
          <div className="flex items-end justify-between gap-3 px-1" style={{ height: 120 }}>
            {datos.aging.map((b) => (
              <div key={b.etiqueta} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-xs font-semibold">{b.total}</span>
                <div
                  className="w-full rounded-t-[var(--radius-button)] bg-[var(--color-ink)]/80"
                  style={{ height: `${Math.max(4, (b.total / maxAging) * 90)}px` }}
                />
                <span className="text-center text-[10px] leading-tight text-[var(--color-muted)]">{b.etiqueta}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="grid gap-3">
        <SeccionTitulo subtitulo="Ordenado por menor tiempo promedio de respuesta — basado en quién tomó cada caso, no en la cuenta compartida">
          Ranking por ingeniero SYS HIGEA
        </SeccionTitulo>
        {datos.porAgente.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-[0.054em] text-[var(--color-muted)]">
                  <th className="py-2 pr-3 font-semibold">Ingeniero</th>
                  <th className="py-2 pr-3 font-semibold">Asignados</th>
                  <th className="py-2 pr-3 font-semibold">Cerrados</th>
                  <th className="py-2 pr-3 font-semibold">Vencidos</th>
                  <th className="py-2 pr-3 font-semibold">TPR</th>
                  <th className="py-2 pr-3 font-semibold">Resolución</th>
                  <th className="py-2 font-semibold">% a tiempo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {datos.porAgente.map((a) => (
                  <tr key={a.agente}>
                    <td className="py-2 pr-3 font-medium">{a.agente}</td>
                    <td className="py-2 pr-3">{a.asignados}</td>
                    <td className="py-2 pr-3">{a.cerrados}</td>
                    <td className={`py-2 pr-3 ${a.vencidos > 0 ? "text-[#b3362a]" : ""}`}>{a.vencidos}</td>
                    <td className="py-2 pr-3">{horas(a.tprHorasPromedio)}</td>
                    <td className="py-2 pr-3">{horas(a.resolucionHorasPromedio)}</td>
                    <td className="py-2">{a.pctCumplimiento == null ? "—" : `${a.pctCumplimiento}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">
            Aún no hay casos tomados con ingeniero registrado en este rango. El nombre se guarda desde "Tomar caso".
          </p>
        )}
      </Card>
    </div>
  );
}
