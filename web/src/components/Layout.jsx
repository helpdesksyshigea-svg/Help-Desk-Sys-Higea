import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RequirePermission } from "./RequirePermission";
import { Button } from "./Button";

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 text-sm font-medium ${isActive ? "text-[var(--color-ink)]" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`;

export function Layout() {
  const { perfil, cerrarSesion } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <header className="border-b border-[var(--color-border)]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              E.S.E. Hospital Orito
            </p>
            <h1 className="text-lg font-semibold">Mesa de ayuda SYS HIGEA</h1>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink to="/" className={navLinkClass}>
              Bandeja
            </NavLink>
            <RequirePermission permisos={["usuarios.gestionar", "roles.gestionar"]}>
              <NavLink to="/admin" className={navLinkClass}>
                Administración
              </NavLink>
            </RequirePermission>
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="font-medium">{perfil?.nombre}</div>
              <div className="text-xs text-[var(--color-muted)]">{perfil?.rol}</div>
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
