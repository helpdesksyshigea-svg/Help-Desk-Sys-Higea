import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { IconLogin } from "../components/icons";
import { supabase } from "../lib/supabase";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/[0.04] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--color-ink)] focus:bg-[var(--color-canvas)]";

export function Login({ enlaceVencido = false }) {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [recuperado, setRecuperado] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const { error } = await iniciarSesion(email, password);
      if (error) setError("Correo o contraseña incorrectos.");
    } catch {
      setError("No se pudo iniciar sesión. Verifique su conexión e inténtelo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  async function onRecuperar() {
    if (!email.trim()) {
      setError("Escriba su correo arriba y luego pulse \"¿Olvidó su contraseña?\".");
      return;
    }
    setError(null);
    setRecuperando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) throw error;
      setRecuperado(true);
    } catch {
      setError("No se pudo enviar el enlace. Verifique su conexión e inténtelo de nuevo.");
    } finally {
      setRecuperando(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[var(--color-canvas)] px-6 py-16">
      <img
        src="/branding/logo-hospital-orito-sm.png"
        alt="E.S.E. Hospital Orito"
        className="mb-10 h-20 w-auto sm:h-24"
      />

      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 shadow-[0_1px_2px_rgba(17,17,13,0.04),0_24px_48px_rgba(17,17,13,0.06)]"
      >
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-forest)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">E.S.E. Hospital Orito</p>
            <p className="text-base font-semibold leading-tight">Mesa de ayuda SYS HIGEA</p>
          </div>
        </div>

        <h2 className="mb-1 text-xl font-semibold">Ingresar</h2>
        <p className="mb-6 text-sm text-[var(--color-muted)]">Use el correo con el que fue invitado.</p>

        <label className="mb-4 block text-sm">
          <span className="mb-1.5 block font-medium">Correo</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="mb-5 block text-sm">
          <span className="mb-1.5 block font-medium">Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>

        {enlaceVencido && (
          <p className="mb-4 rounded-[var(--radius-input)] bg-[#f8e0dc] px-3 py-2 text-sm text-[#b3362a]">
            El enlace que usó ya expiró o ya fue utilizado. Pida al administrador que le envíe uno nuevo, o use "¿Olvidó su
            contraseña?" abajo si ya tiene cuenta.
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-[var(--radius-input)] bg-[#f8e0dc] px-3 py-2 text-sm text-[#b3362a]">{error}</p>
        )}
        {recuperado && (
          <p className="mb-4 rounded-[var(--radius-input)] bg-[var(--color-accent)]/20 px-3 py-2 text-sm">
            Si ese correo tiene una cuenta, le enviamos un enlace para definir una nueva contraseña.
          </p>
        )}

        <Button variant="accent" type="submit" disabled={cargando} className="w-full justify-center">
          <IconLogin size={15} />
          {cargando ? "Ingresando…" : "Ingresar"}
        </Button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onRecuperar}
            disabled={recuperando}
            className="text-sm text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {recuperando ? "Enviando…" : "¿Olvidó su contraseña?"}
          </button>
        </div>
      </form>

      <p className="mt-8 text-xs text-[var(--color-muted)]">Aprobación obligatoria · Oficio firmado · Historial permanente</p>
    </div>
  );
}
