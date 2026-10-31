import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { nombreLegible } from "../lib/roles";
import { Sidebar } from "./Sidebar";
import { Button } from "./Button";
import { IconSearch, IconLogout, IconMenu } from "./icons";

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
  // El dashboard "Control de Gestión" usa su propio fondo gris verdoso y más
  // ancho útil (6 KPI y 3 columnas en escritorio); el resto de pantallas
  // conserva el lienzo blanco y el ancho de lectura de 1100px.
  const esDashboard = useLocation().pathname === "/dashboard";
  const [menuAbierto, setMenuAbierto] = useState(false);

  function buscar(e) {
    e.preventDefault();
    const q = e.target.elements.q.value.trim();
    navigate(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-canvas)]">
      <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/90 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú de navegación"
              className="shrink-0 rounded-[var(--radius-button)] p-2 text-[var(--color-ink)] hover:bg-[var(--color-ink)]/[0.06] md:hidden"
            >
              <IconMenu size={20} />
            </button>
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
          {/* La búsqueda en la fila de arriba se oculta bajo "sm" (poco
              espacio junto al botón de menú y el avatar) — sin esto, en un
              celular no existe forma de buscar un ticket por factura o
              paciente, solo filtrar la bandeja. */}
          <form onSubmit={buscar} className="relative px-4 pb-3 sm:hidden">
            <IconSearch size={15} className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              name="q"
              type="search"
              placeholder="Buscar ticket, factura o paciente…"
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--color-ink)]"
            />
          </form>
        </header>
        <main className={`flex-1 px-4 py-6 sm:px-6 sm:py-8 ${esDashboard ? "bg-dash-bg" : ""}`}>
          <div className={`mx-auto ${esDashboard ? "max-w-[1480px]" : "max-w-[1100px]"}`}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
