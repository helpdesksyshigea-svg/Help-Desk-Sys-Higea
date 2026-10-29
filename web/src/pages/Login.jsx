import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";
import { IconShield, IconClock, IconCheck } from "../components/icons";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-border)] bg-white/[0.02] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--color-border-strong)] focus:bg-[var(--color-surface)]";

export function Login() {
  const { iniciarSesion } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const { error } = await iniciarSesion(email, password);
    if (error) setError("Correo o contraseña incorrectos.");
    setCargando(false);
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-elevated)] p-12 text-white lg:flex">
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
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-white/60">E.S.E. Hospital Orito</p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)] lg:hidden">
            E.S.E. Hospital Orito
          </p>
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
            <p className="mb-4 rounded-[var(--radius-input)] bg-[var(--color-danger-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>
          )}

          <Button variant="accent" type="submit" disabled={cargando} className="w-full justify-center">
            {cargando ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
