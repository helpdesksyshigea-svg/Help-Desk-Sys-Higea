import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { IconShield, IconClock, IconCheck } from "../components/icons";
import { supabase } from "../lib/supabase";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/[0.04] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--color-ink)] focus:bg-[var(--color-canvas)]";

export function Login() {
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
    const { error } = await iniciarSesion(email, password);
    if (error) setError("Correo o contraseña incorrectos.");
    setCargando(false);
  }

  async function onRecuperar() {
    if (!email.trim()) {
      setError("Escriba su correo arriba y luego pulse \"¿Olvidó su contraseña?\".");
      return;
    }
    setError(null);
    setRecuperando(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setRecuperando(false);
    setRecuperado(true);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-forest)] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="relative">
          <img src="/branding/logo-hospital-orito-sm.png" alt="E.S.E. Hospital Orito" className="mb-6 h-14 w-auto rounded-md bg-white px-3 py-2" />
          <h1 className="mt-2 text-3xl font-light leading-tight text-white">
            Mesa de ayuda
            <br />
            SYS HIGEA
          </h1>
        </div>

        <div className="relative grid gap-5">
          <div className="flex items-start gap-3 text-sm text-white/80">
            <IconShield size={18} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <span>Aprobación obligatoria y oficio firmado antes de que un dato llegue al proveedor externo.</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-white/80">
            <IconClock size={18} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <span>Plazos de respuesta medidos en días hábiles colombianos, con festivos ya cargados.</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-white/80">
            <IconCheck size={18} className="mt-0.5 shrink-0 text-[var(--color-accent)]" />
            <span>Historial de cada caso, imposible de editar o borrar una vez registrado.</span>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-[var(--color-canvas)] px-6 py-16">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <img src="/branding/logo-hospital-orito-sm.png" alt="E.S.E. Hospital Orito" className="mb-6 h-10 w-auto lg:hidden" />
          <h2 className="mb-1 text-2xl font-semibold">Ingresar</h2>
          <p className="mb-8 text-sm text-[var(--color-muted)]">Use el correo institucional que le fue invitado.</p>

          <label className="mb-4 block text-sm">
            <span className="mb-1.5 block font-medium">Correo institucional</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </label>

          <label className="mb-5 block text-sm">
            <span className="mb-1.5 block font-medium">Contraseña</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </label>

          {error && (
            <p className="mb-4 rounded-[var(--radius-input)] bg-[#f8e0dc] px-3 py-2 text-sm text-[#b3362a]">{error}</p>
          )}
          {recuperado && (
            <p className="mb-4 rounded-[var(--radius-input)] bg-[var(--color-accent)]/20 px-3 py-2 text-sm">
              Si ese correo tiene una cuenta, le enviamos un enlace para definir una nueva contraseña.
            </p>
          )}

          <Button variant="accent" type="submit" disabled={cargando} className="w-full justify-center">
            {cargando ? "Ingresando…" : "Ingresar"}
          </Button>

          <button
            type="button"
            onClick={onRecuperar}
            disabled={recuperando}
            className="mt-4 text-sm text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {recuperando ? "Enviando…" : "¿Olvidó su contraseña?"}
          </button>
        </form>
      </div>
    </div>
  );
}
