import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { filtrosPorRol } from "../lib/filters";
import { RequirePermission } from "./RequirePermission";
import { IconInbox, IconDashboard, IconSettings, IconInfo, IconClock, IconCheck, IconAlert, IconDatabase, IconBook } from "./icons";

const ICONOS = { accion: IconAlert, vencidos: IconClock, todos: IconCheck };

function kb(bytes) {
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return Math.max(0, Math.round(bytes / 1024)) + " KB";
}

function IndicadorAlmacenamiento() {
  const [datos, setDatos] = useState(null);
  useEffect(() => {
    apiFetch("/admin/almacenamiento")
      .then(setDatos)
      .catch(() => {});
  }, []);
  if (!datos) return null;
  const pct = (datos.storage.bytes / datos.storage.limite) * 100;
  const alerta = pct >= 75;
  return (
    <NavLink
      to="/admin?tab=almacenamiento"
      className={`flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2 text-xs hover:bg-[var(--color-ink)]/[0.05] ${
        alerta ? "font-medium text-[#b3362a] hover:text-[#b3362a]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      }`}
      title={`Almacenamiento: ${kb(datos.storage.bytes)} de ${kb(datos.storage.limite)}${alerta ? " — por encima del 75%" : ""}`}
    >
      <IconDatabase size={14} className="shrink-0" />
      <span>Almacenamiento {pct < 0.01 ? "< 0.01" : pct.toFixed(2)}%</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { perfil } = useAuth();
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const filtroActivo = params.get("filtro") || "accion";
  const filtros = filtrosPorRol(perfil?.rol, perfil?.id);

  useEffect(() => {
    function cargar() {
      apiFetch("/tickets")
        .then((data) => {
          if (Array.isArray(data)) setTickets(data);
        })
        .catch((e) => console.error("No se pudo actualizar el contador de tickets:", e));
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
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-4 md:flex">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-5 -mx-3 -mt-4 px-3 pt-4">
          <img src="/branding/logo-hospital-orito-sm.png" alt="E.S.E. Hospital Orito" className="mb-3 w-full object-contain" />
          <p className="px-2 text-base font-bold leading-tight">Mesa de ayuda</p>
          <p className="px-2 text-xs text-[var(--color-muted)]">SYS HIGEA</p>
        </div>

        <RequirePermission permisos={["reportes.ver_dashboard"]}>
          <NavLink to="/dashboard" className={({ isActive }) => itemClass(isActive)}>
            <span className="flex items-center gap-2">
              <IconDashboard size={16} />
              Dashboard ejecutivo
            </span>
          </NavLink>
        </RequirePermission>

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
      </div>

      <div className="grid shrink-0 gap-0.5 border-t border-[var(--color-border)] pt-3">
        <RequirePermission permisos={["config.editar"]}>
          <IndicadorAlmacenamiento />
        </RequirePermission>
        <RequirePermission permisos={["usuarios.gestionar", "roles.gestionar"]}>
          <NavLink to="/admin" className={({ isActive }) => itemClass(isActive)}>
            <span className="flex items-center gap-2">
              <IconSettings size={16} />
              Administración
            </span>
          </NavLink>
        </RequirePermission>
        <NavLink to="/manual" className={({ isActive }) => itemClass(isActive)}>
          <span className="flex items-center gap-2">
            <IconBook size={16} />
            Manual de usuario
          </span>
        </NavLink>
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
