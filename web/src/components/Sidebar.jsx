import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { FILTROS_POR_ROL } from "../lib/filters";
import { RequirePermission } from "./RequirePermission";
import { IconInbox, IconSettings, IconInfo, IconClock, IconCheck, IconAlert } from "./icons";

const ICONOS = { accion: IconAlert, vencidos: IconClock, todos: IconCheck };

export function Sidebar() {
  const { perfil } = useAuth();
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const filtroActivo = params.get("filtro") || "accion";
  const filtros = FILTROS_POR_ROL[perfil?.rol] || FILTROS_POR_ROL.facturador;

  useEffect(() => {
    function cargar() {
      apiFetch("/tickets")
        .then(setTickets)
        .catch(() => {});
    }
    cargar();
    window.addEventListener("tickets-changed", cargar);
    return () => window.removeEventListener("tickets-changed", cargar);
  }, []);

  const itemClass = (activo) =>
    `flex items-center justify-between gap-2 rounded-[var(--radius-button)] px-3 py-2 text-sm font-medium transition-colors ${
      activo
        ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
        : "text-[var(--color-ink)] hover:bg-[var(--color-ink)]/[0.05]"
    }`;

  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-4 md:flex md:flex-col md:gap-1">
      <div className="mb-4 px-2">
        <p className="text-base font-bold leading-tight">Mesa de ayuda</p>
        <p className="text-xs text-[var(--color-muted)]">SYS HIGEA</p>
      </div>

      <NavLink to="/" end className={({ isActive }) => itemClass(isActive && !params.get("filtro"))}>
        <span className="flex items-center gap-2">
          <IconInbox size={16} />
          Bandeja
        </span>
        <span className="text-xs opacity-70">{tickets.length || ""}</span>
      </NavLink>

      <div className="mt-2 grid gap-0.5">
        {filtros.map(([clave, etiqueta, fn]) => {
          const Icono = ICONOS[clave] || IconClock;
          return (
            <NavLink key={clave} to={`/?filtro=${clave}`} className={() => itemClass(filtroActivo === clave)}>
              <span className="flex min-w-0 items-center gap-2">
                <Icono size={14} className="shrink-0" />
                <span className="truncate">{etiqueta}</span>
              </span>
              <span className="text-xs opacity-70">{tickets.filter(fn).length}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="mt-auto grid gap-0.5 border-t border-[var(--color-border)] pt-3">
        <RequirePermission permisos={["usuarios.gestionar", "roles.gestionar"]}>
          <NavLink to="/admin" className={({ isActive }) => itemClass(isActive)}>
            <span className="flex items-center gap-2">
              <IconSettings size={16} />
              Administración
            </span>
          </NavLink>
        </RequirePermission>
        <NavLink to="/ayuda" className={({ isActive }) => itemClass(isActive)}>
          <span className="flex items-center gap-2">
            <IconInfo size={16} />
            Ayuda
          </span>
        </NavLink>
      </div>
    </aside>
  );
}
