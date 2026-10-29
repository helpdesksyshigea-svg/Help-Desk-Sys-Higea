import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { nombreLegible } from "../lib/roles";
import { Sidebar } from "./Sidebar";
import { Button } from "./Button";
import { IconSearch } from "./icons";

export function Layout() {
  const { perfil, cerrarSesion } = useAuth();
  const navigate = useNavigate();

  function buscar(e) {
    e.preventDefault();
    const q = e.target.elements.q.value.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/90 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-6 py-3">
            <form onSubmit={buscar} className="relative hidden w-full max-w-sm sm:block">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                name="q"
                type="search"
                placeholder="Buscar ticket, factura o paciente…"
                className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-ink)]"
              />
            </form>
            <div className="flex items-center gap-3">
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
        <main className="flex-1 px-6 py-8">
          <div className="mx-auto max-w-[1100px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
