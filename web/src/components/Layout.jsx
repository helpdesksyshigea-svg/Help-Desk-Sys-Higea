import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { nombreLegible } from "../lib/roles";
import { RequirePermission } from "./RequirePermission";
import { Button } from "./Button";
import { IconInbox, IconSettings, IconInfo } from "./icons";

const navLinkClass = ({ isActive }) =>
  `inline-flex items-center gap-1.5 rounded-[var(--radius-button)] px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-[var(--color-ink)]/[0.06] text-[var(--color-ink)]"
      : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
  }`;

export function Layout() {
  const { perfil, cerrarSesion } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-6 py-3.5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              E.S.E. Hospital Orito
            </p>
            <h1 className="text-base font-semibold leading-tight">Mesa de ayuda SYS HIGEA</h1>
          </div>
          <nav className="flex flex-1 items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <IconInbox size={15} />
              Bandeja
            </NavLink>
            <RequirePermission permisos={["usuarios.gestionar", "roles.gestionar"]}>
              <NavLink to="/admin" className={navLinkClass}>
                <IconSettings size={15} />
                Administración
              </NavLink>
            </RequirePermission>
          </nav>
          <div className="flex items-center gap-3">
            <NavLink to="/ayuda" className={navLinkClass} title="Preguntas frecuentes">
              <IconInfo size={15} />
              <span className="hidden sm:inline">Ayuda</span>
            </NavLink>
            <div className="hidden text-right text-sm sm:block">
              <div className="font-medium leading-tight">{perfil?.nombre}</div>
              <div className="text-xs text-[var(--color-muted)]">{nombreLegible(perfil?.rol)}</div>
            </div>
            <Button variant="ghost" onClick={cerrarSesion}>
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
