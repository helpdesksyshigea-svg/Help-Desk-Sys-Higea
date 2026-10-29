import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { FILTROS_POR_ROL, FILTRO_DEFAULT, ESPERANDO, necesitaAccion } from "../lib/filters";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { RequirePermission } from "../components/RequirePermission";

const PRIORIDAD_LABEL = { alta: "Alta", normal: "Normal", baja: "Baja" };
const PRIORIDAD_COLOR = { alta: "#e02424", normal: "#f59e0b", baja: "#16a34a" };

function hace(iso) {
  const horas = (Date.now() - new Date(iso)) / 36e5;
  if (horas < 1) return "hace minutos";
  if (horas < 24) return `hace ${Math.floor(horas)} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

function PrioridadDot({ color }) {
  return <span className="block h-3 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />;
}

export function Inbox() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const filtros = FILTROS_POR_ROL[perfil?.rol] || FILTROS_POR_ROL.facturador;
  const [filtroActivo, setFiltroActivo] = useState(FILTRO_DEFAULT[perfil?.rol] || filtros[0][0]);
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/tickets")
      .then(setTickets)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  const [, , fn] = filtros.find(([k]) => k === filtroActivo) || filtros[0];
  const visibles = useMemo(() => tickets.filter(fn), [tickets, fn]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-light">Tickets</h2>
        <RequirePermission permisos={["tickets.crear"]}>
          <Button variant="accent" onClick={() => navigate("/tickets/nuevo")}>
            Nuevo ticket
          </Button>
        </RequirePermission>
      </div>

      <div className="flex flex-wrap gap-2">
        {filtros.map(([clave, etiqueta, fn]) => (
          <button
            key={clave}
            onClick={() => setFiltroActivo(clave)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
              filtroActivo === clave
                ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-canvas)]"
                : "border-[var(--color-border)] text-[var(--color-muted)]"
            }`}
          >
            {etiqueta} <span className="opacity-70">{tickets.filter(fn).length}</span>
          </button>
        ))}
      </div>

      {cargando && <p className="text-[var(--color-muted)]">Cargando tickets…</p>}

      {error && (
        <Card className="text-sm text-[var(--color-muted)]">No se pudo cargar la bandeja. Error: {error}</Card>
      )}

      {!cargando && !error && visibles.length === 0 && (
        <Card className="text-center text-[var(--color-muted)]">Ningún ticket en esta vista.</Card>
      )}

      {!cargando && !error && visibles.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)]">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                <th className="w-8 py-2 pl-4"></th>
                <th className="py-2 pr-3">Ticket</th>
                <th className="py-2 pr-3">Solicita</th>
                <th className="py-2 pr-3">Esperando</th>
                <th className="py-2 pr-3 text-right">Actualizado</th>
                <th className="py-2 pr-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => {
                const titulo =
                  t.items?.map((i) => i.factura).filter(Boolean).join(", ") || t.items?.[0]?.paciente || "Sin factura";
                const ultimoEvento = t.eventos?.[t.eventos.length - 1];
                const snippet = ultimoEvento?.texto || t.observacion || "Sin notas adicionales";
                const destacado = necesitaAccion(t, perfil?.rol);
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface)]"
                  >
                    <td className="py-3 pl-4 align-top">
                      <span title={`Prioridad ${PRIORIDAD_LABEL[t.prioridad] || t.prioridad}`}>
                        <PrioridadDot color={PRIORIDAD_COLOR[t.prioridad] || "var(--color-muted)"} />
                      </span>
                    </td>
                    <td className="max-w-xs py-3 pr-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[var(--color-muted)]">{t.code}</span>
                        {t.vencido && (
                          <span className="rounded-[var(--radius-tag)] bg-[#f8e0dc] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b3362a]">
                            Vencido
                          </span>
                        )}
                      </div>
                      <div className={`truncate ${destacado ? "font-semibold" : "font-medium"}`}>{titulo}</div>
                      <div className="truncate text-xs text-[var(--color-muted)]">{snippet}</div>
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-[10px] font-semibold text-[var(--color-ink)]">
                          {iniciales(t.solicitante?.nombre)}
                        </span>
                        <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">{t.solicitante?.nombre || "—"}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 align-top text-xs text-[var(--color-muted)]">{ESPERANDO[t.estado] || ""}</td>
                    <td className="py-3 pr-3 text-right align-top text-xs text-[var(--color-muted)]">{hace(t.created_at)}</td>
                    <td className="py-3 pr-4 text-right align-top">
                      <StatusTag estado={t.estado} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
