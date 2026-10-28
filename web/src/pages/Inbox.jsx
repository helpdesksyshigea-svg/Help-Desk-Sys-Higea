import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { FILTROS_POR_ROL, FILTRO_DEFAULT } from "../lib/filters";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { RequirePermission } from "../components/RequirePermission";

export function Inbox() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const filtros = FILTROS_POR_ROL[perfil?.rol] || FILTROS_POR_ROL.facturador;
  const [filtroActivo, setFiltroActivo] = useState(FILTRO_DEFAULT[perfil?.rol] || filtros[0][0]);
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // TODO: backend aún no expone GET /tickets (Fase 1). Esta página ya queda
    // lista para consumirlo en cuanto exista.
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
        <h2 className="text-xl font-light">Tiquetes</h2>
        <RequirePermission permisos={["tickets.crear"]}>
          <Button variant="accent" onClick={() => navigate("/tickets/nuevo")}>
            Nuevo tiquete
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

      {cargando && <p className="text-[var(--color-muted)]">Cargando tiquetes…</p>}

      {error && (
        <Card className="text-sm text-[var(--color-muted)]">
          Aún no hay endpoint de tickets en el backend (Fase 1 pendiente). Error: {error}
        </Card>
      )}

      {!cargando && !error && visibles.length === 0 && (
        <Card className="text-center text-[var(--color-muted)]">Ningún tiquete en esta vista.</Card>
      )}

      <div className="grid gap-3">
        {visibles.map((t) => (
          <Card
            key={t.id}
            className="cursor-pointer hover:border-[var(--color-ink)]/30"
            onClick={() => navigate(`/tickets/${t.id}`)}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-[var(--color-muted)]">{t.code}</span>
              <StatusTag estado={t.estado} />
            </div>
            <p className="mt-2 font-medium">
              {t.items?.map((i) => i.factura).filter(Boolean).join(", ") || "Sin factura"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
