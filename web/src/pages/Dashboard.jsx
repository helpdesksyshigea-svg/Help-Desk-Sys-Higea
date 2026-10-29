import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { IconSearch } from "../components/icons";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 text-sm outline-none focus:border-[var(--color-ink)]";

function Mensaje({ error, ok }) {
  if (error) return <p className="text-sm text-[#b3362a]">{error}</p>;
  if (ok) return <p className="text-sm text-[var(--color-state-cerrado)]">{ok}</p>;
  return null;
}

function Barra({ porcentaje }) {
  const color = porcentaje > 80 ? "var(--color-danger)" : porcentaje > 50 ? "var(--color-state-devuelto)" : "var(--color-state-cerrado)";
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
  return n.toFixed(1) + " h";
}

function BarraHorizontal({ etiqueta, total, maximo, color }) {
  const pct = maximo ? Math.max(2, (total / maximo) * 100) : 0;
  return (
    <div className="grid grid-cols-[120px_1fr_32px] items-center gap-2 text-sm">
      <span className="truncate text-[var(--color-muted)]">{etiqueta}</span>
      <div className="h-5 overflow-hidden rounded-[var(--radius-button)] bg-[var(--color-ink)]/[0.06]">
        <div className="h-full rounded-[var(--radius-button)]" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-right font-medium">{total}</span>
    </div>
  );
}

const ETIQUETAS_ESTADO = {
  pendiente: "Pendiente",
  devuelto: "Devuelto",
  aprobado: "Aprobado",
  en_proceso: "En proceso",
  requiere_info: "Requiere info",
  cerrado: "Cerrado",
};

function CardNumero({ etiqueta, valor }) {
  return (
    <div className="grid gap-1 rounded-[var(--radius-card)] border border-[var(--color-border)] px-4 py-3">
      <span className="text-xs text-[var(--color-muted)]">{etiqueta}</span>
      <span className="text-2xl font-semibold tracking-tight">{valor}</span>
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

      {!datos ? (
        error ? <Mensaje error={error} /> : <p className="text-[var(--color-muted)]">Cargando…</p>
      ) : (
        <DashboardContenido datos={datos} error={error} desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} cargar={cargar} setDatos={setDatos} />
      )}
    </div>
  );
}

function DashboardContenido({ datos, error, desde, hasta, setDesde, setHasta, cargar, setDatos }) {
  const maxEstado = Math.max(1, ...datos.porEstado.map((e) => e.total));
  const maxTipo = Math.max(1, ...datos.porTipo.map((e) => e.total));
  const maxPrioridad = Math.max(1, ...datos.porPrioridad.map((e) => e.total));
  const pctSla = datos.sla.cumplimientoHistorico.porcentaje;

  return (
    <div className="grid gap-4">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CardNumero etiqueta="Tickets en el rango" valor={datos.totales.tickets} />
        <CardNumero etiqueta="Abiertos" valor={datos.totales.abiertos} />
        <CardNumero etiqueta="Vencidos ahora" valor={datos.totales.vencidosActuales} />
        <CardNumero etiqueta="TPR promedio" valor={horas(datos.tiempos.tprHorasPromedio)} />
        <CardNumero etiqueta="Resolución promedio" valor={horas(datos.tiempos.resolucionHorasPromedio)} />
      </div>

      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Por estado</h3>
        <div className="grid gap-1.5">
          {datos.porEstado.map((e) => (
            <BarraHorizontal
              key={e.estado}
              etiqueta={ETIQUETAS_ESTADO[e.estado] || e.estado}
              total={e.total}
              maximo={maxEstado}
              color={`var(--color-state-${e.estado}, var(--color-ink))`}
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="grid gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Por tipo</h3>
          <div className="grid gap-1.5">
            {datos.porTipo.map((e) => (
              <BarraHorizontal key={e.tipo} etiqueta={e.tipo} total={e.total} maximo={maxTipo} color="var(--color-ink)" />
            ))}
          </div>
        </Card>
        <Card className="grid gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Por prioridad</h3>
          <div className="grid gap-1.5">
            {datos.porPrioridad.map((e) => (
              <BarraHorizontal key={e.prioridad} etiqueta={e.prioridad} total={e.total} maximo={maxPrioridad} color="var(--color-ink)" />
            ))}
          </div>
        </Card>
      </div>

      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Cumplimiento de SLA (tickets cerrados en el rango)
        </h3>
        {pctSla == null ? (
          <p className="text-sm text-[var(--color-muted)]">No hay tickets cerrados con SLA evaluable en este rango.</p>
        ) : (
          <div className="grid gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                {datos.sla.cumplimientoHistorico.aTiempo} a tiempo · {datos.sla.cumplimientoHistorico.vencidos} vencidos
              </span>
              <span className="text-[var(--color-muted)]">{pctSla}% de cumplimiento</span>
            </div>
            <Barra porcentaje={pctSla} />
          </div>
        )}
        <p className="text-xs text-[var(--color-muted)]">
          De los tickets actualmente abiertos: {datos.sla.abiertosAhora.aTiempo} a tiempo, {datos.sla.abiertosAhora.vencidos}{" "}
          vencidos.
        </p>
      </Card>
    </div>
  );
}
