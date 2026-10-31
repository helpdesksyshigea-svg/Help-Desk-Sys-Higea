import { useEffect, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { filtrosPorRol } from "../lib/filters";
import { RequirePermission } from "./RequirePermission";
import {
  IconInbox,
  IconDashboard,
  IconSettings,
  IconInfo,
  IconClock,
  IconCheck,
  IconAlert,
  IconDatabase,
  IconBook,
  IconSend,
  IconReturn,
  IconEdit,
  IconEye,
} from "./icons";

const ICONOS = {
  accion: IconAlert,
  vencidos: IconClock,
  pendiente: IconClock,
  higea: IconSend,
  abiertos: IconInbox,
  en_proceso: IconEdit,
  requiere_info: IconInfo,
  devueltos: IconReturn,
  cerrados: IconCheck,
  todos: IconEye,
};

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
      className={`flex items-center gap-2 rounded-[var(--radius-button)] px-3 py-2.5 text-sm font-medium hover:bg-[var(--color-ink)]/[0.05] ${
        alerta ? "text-[#b3362a] hover:text-[#b3362a]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
      }`}
      title={`Almacenamiento: ${kb(datos.storage.bytes)} de ${kb(datos.storage.limite)}${alerta ? " — por encima del 75%" : ""}`}
    >
      <IconDatabase size={19} className="shrink-0" />
      <span>Almacenamiento {pct < 0.01 ? "< 0.01" : pct.toFixed(2)}%</span>
    </NavLink>
  );
}

export function Sidebar({ abierto = false, onCerrar }) {
  const { perfil } = useAuth();
  const [params] = useSearchParams();
  const [conteos, setConteos] = useState({ total: 0, porFiltro: {} });
  const filtroActivo = params.get("filtro") || "accion";
  const filtros = filtrosPorRol(perfil?.rol, perfil?.id);

  useEffect(() => {
    if (!abierto) return;
    function alPresionarTecla(e) {
      if (e.key === "Escape") onCerrar?.();
    }
    window.addEventListener("keydown", alPresionarTecla);
    return () => window.removeEventListener("keydown", alPresionarTecla);
  }, [abierto, onCerrar]);

  useEffect(() => {
    // /tickets/conteos en vez de /tickets completo: el sidebar solo necesita
    // números por filtro, no el listado enriquecido (items/eventos/
    // aprobaciones) de cada ticket — pedir eso solo para contar es justo el
    // patrón que ya hizo caer la app una vez con volumen alto, y este
    // componente se recarga en cada cambio de pestaña y cada mutación.
    function cargar() {
      apiFetch("/tickets/conteos")
        .then((data) => {
          if (data && typeof data === "object") setConteos({ total: data.total || 0, porFiltro: data.porFiltro || {} });
        })
        .catch((e) => console.error("No se pudo actualizar el contador de tickets:", e));
    }
    cargar();
    function alVolverVisible() {
      if (document.visibilityState === "visible") cargar();
    }
    window.addEventListener("tickets-changed", cargar);
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      window.removeEventListener("tickets-changed", cargar);
      document.removeEventListener("visibilitychange", alVolverVisible);
    };
  }, []);

  const itemClass = (activo, alerta) => {
    const base = "flex min-w-0 items-center justify-between gap-2 rounded-[var(--radius-button)] px-3 py-2.5 text-sm font-medium transition-colors";
    if (alerta) {
      return `${base} ${
        activo ? "bg-[#b3362a] text-white" : "bg-[#fbe6e3] text-[#b3362a] hover:bg-[#f6cdc5]"
      }`;
    }
    return `${base} ${
      activo ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]" : "text-[var(--color-ink)] hover:bg-[var(--color-ink)]/[0.05]"
    }`;
  };

  return (
    <>
      {/* Backdrop: solo existe en móvil mientras el drawer está abierto —
          en desktop el sidebar ya es fijo y visible, nunca hay backdrop. */}
      {abierto && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCerrar} aria-hidden="true" />
      )}
      <aside
        onClick={(e) => {
          // Un link de navegación (NavLink) dentro del aside cierra el drawer
          // en móvil al hacer clic — en desktop esto no tiene efecto visible
          // porque el drawer ya está siempre "abierto" (sticky, sin overlay).
          if (e.target.closest("a") && window.innerWidth < 768) onCerrar?.();
        }}
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-4 transition-transform duration-200 md:sticky md:top-0 md:z-auto md:w-60 md:translate-x-0 md:transition-none ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-5 -mx-3 -mt-4 px-3 pt-4">
          <img src="/branding/logo-hospital-orito-sm.png" alt="E.S.E. Hospital Orito" className="mb-3 w-full object-contain" />
          <p className="px-2 text-base font-bold leading-tight">Mesa de ayuda</p>
          <p className="px-2 text-xs text-[var(--color-muted)]">SYS HIGEA</p>
        </div>

        <RequirePermission permisos={["reportes.ver_dashboard"]}>
          <NavLink to="/dashboard" className={({ isActive }) => itemClass(isActive)}>
            <span className="flex items-center gap-2">
              <IconDashboard size={19} />
              Dashboard ejecutivo
            </span>
          </NavLink>
        </RequirePermission>

        <NavLink to="/" end className={({ isActive }) => itemClass(isActive && !params.get("filtro"))}>
          <span className="flex min-w-0 items-center gap-2">
            <IconInbox size={19} className="shrink-0" />
            <span className="truncate">Bandeja</span>
          </span>
          <span className="shrink-0 text-xs opacity-70">{conteos.total || ""}</span>
        </NavLink>

        <div className="mt-2 flex min-w-0 flex-col gap-0.5">
          {filtros.map(([clave, etiqueta]) => {
            const Icono = ICONOS[clave] || IconClock;
            const total = conteos.porFiltro[clave] ?? 0;
            // "Requiere tu acción" con pendientes reales se marca aparte de la
            // selección normal: fondo rojo sólido (relleno completo, no solo
            // texto) es la única señal de "esto necesita tu atención ahora",
            // para que no se pierda entre el resto de filtros en 0.
            const esAlerta = clave === "accion" && total > 0;
            const activo = filtroActivo === clave;
            return (
              <NavLink key={clave} to={`/?filtro=${clave}`} className={() => itemClass(activo, esAlerta)}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Icono size={19} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
                </span>
                <span
                  className={
                    esAlerta
                      ? `shrink-0 rounded-[var(--radius-tag)] px-1.5 py-0.5 text-[10px] font-bold ${
                          activo ? "animate-pulse bg-white text-[#b3362a]" : "animate-pulse bg-[#b3362a] text-white"
                        }`
                      : "shrink-0 text-xs opacity-70"
                  }
                >
                  {total}
                </span>
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
              <IconSettings size={19} />
              Administración
            </span>
          </NavLink>
        </RequirePermission>
        {perfil?.beta_firma_oficio && (
          <NavLink to="/mi-firma" className={({ isActive }) => itemClass(isActive)}>
            <span className="flex items-center gap-2">
              <IconEdit size={19} />
              Mi firma
            </span>
          </NavLink>
        )}
        <NavLink to="/manual" className={({ isActive }) => itemClass(isActive)}>
          <span className="flex items-center gap-2">
            <IconBook size={19} />
            Manual de usuario
          </span>
        </NavLink>
        <NavLink to="/ayuda" className={({ isActive }) => itemClass(isActive)}>
          <span className="flex items-center gap-2">
            <IconInfo size={19} />
            Ayuda
          </span>
        </NavLink>
      </div>
      </aside>
    </>
  );
}
