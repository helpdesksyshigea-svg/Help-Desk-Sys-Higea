import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/Button";

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          E.S.E. Hospital Orito
        </p>
        <h1 className="mb-6 text-2xl font-light">Mesa de ayuda SYS HIGEA</h1>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Correo institucional</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 outline-none focus:border-[var(--color-ink)]"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium">Contraseña</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 outline-none focus:border-[var(--color-ink)]"
          />
        </label>

        {error && <p className="mb-4 text-sm text-[#b3362a]">{error}</p>}

        <Button variant="accent" type="submit" disabled={cargando} className="w-full justify-center">
          {cargando ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
    </div>
  );
}
