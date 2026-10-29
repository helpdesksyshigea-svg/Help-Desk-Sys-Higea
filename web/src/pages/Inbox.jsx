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
const PRIORIDAD_COLOR = { alta: "#b3362a", normal: "#9a5b06", baja: "#2c7536" };

function hace(iso) {
  const horas = (Date.now() - new Date(iso)) / 36e5;
  if (horas < 1) return "hace minutos";
  if (horas < 24) return `hace ${Math.floor(horas)} h`;
  return `hace ${Math.floor(horas / 24)} d`;
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
        <Card className="text-sm text-[var(--color-muted)]">
          No se pudo cargar la bandeja. Error: {error}
        </Card>
      )}

      {!cargando && !error && visibles.length === 0 && (
        <Card className="text-center text-[var(--color-muted)]">Ningún ticket en esta vista.</Card>
      )}

      {!cargando && !error && visibles.length > 0 && (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
          <ul className="divide-y divide-[var(--color-border)]">
            {visibles.map((t) => {
              const titulo = t.items?.map((i) => i.factura).filter(Boolean).join(", ") || t.items?.[0]?.paciente || "Sin factura";
              const ultimoEvento = t.eventos?.[t.eventos.length - 1];
              const snippet = ultimoEvento?.texto || t.observacion || "Sin notas adicionales";
              const destacado = necesitaAccion(t, perfil?.rol);
              return (
                <li
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className={`flex cursor-pointer items-center gap-4 px-4 py-3 text-sm hover:bg-[var(--color-surface)] ${
                    t.vencido ? "border-l-4 border-l-[#b3362a]" : "border-l-4 border-l-transparent"
                  }`}
                >
                  <span
                    title={`Prioridad ${PRIORIDAD_LABEL[t.prioridad] || t.prioridad}`}
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: PRIORIDAD_COLOR[t.prioridad] || "var(--color-muted)" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-[var(--color-muted)]">{t.code}</span>
                      {t.vencido && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-[#b3362a]">Vencido</span>
                      )}
                    </div>
                    <div className={`truncate ${destacado ? "font-semibold" : "font-medium"}`}>{titulo}</div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{snippet}</div>
                  </div>
                  <span className="hidden shrink-0 text-right text-xs text-[var(--color-muted)] sm:block">
                    <div>{ESPERANDO[t.estado] || ""}</div>
                    <div>{t.items?.length || 0} registro(s) · {hace(t.created_at)}</div>
                  </span>
                  <StatusTag estado={t.estado} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
