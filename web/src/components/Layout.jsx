import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { nombreLegible } from "../lib/roles";
import { Sidebar } from "./Sidebar";
import { Button } from "./Button";
import { IconSearch, IconLogout } from "./icons";

const COLORES_AVATAR = ["#2d6a4f", "#1d4ed8", "#9a3412", "#6d28d9", "#0f766e", "#b91c1c"];

function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  const letras = partes.length > 1 ? [partes[0][0], partes[partes.length - 1][0]] : [partes[0][0]];
  return letras.join("").toUpperCase();
}

function colorAvatar(nombre) {
  if (!nombre) return COLORES_AVATAR[0];
  const suma = [...nombre].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return COLORES_AVATAR[suma % COLORES_AVATAR.length];
}

function Avatar({ nombre }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: colorAvatar(nombre) }}
      title={nombre}
    >
      {iniciales(nombre)}
    </div>
  );
}

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
              <Avatar nombre={perfil?.nombre} />
              <div className="hidden text-right text-sm sm:block">
                <div className="font-medium leading-tight">{perfil?.nombre}</div>
                <div className="text-xs text-[var(--color-muted)]">{nombreLegible(perfil?.rol)}</div>
              </div>
              <Button variant="ghost" onClick={cerrarSesion}>
                <IconLogout size={15} />
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
