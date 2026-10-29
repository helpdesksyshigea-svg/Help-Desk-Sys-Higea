import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Button } from "../components/Button";

const inputClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/[0.04] px-3.5 py-2.5 outline-none transition-colors focus:border-[var(--color-ink)] focus:bg-[var(--color-canvas)]";

// Pantalla a la que llega quien hace clic en el enlace de invitación o de
// "olvidé mi contraseña": Supabase ya abrió una sesión válida a partir del
// token en la URL, pero nunca pide definir una contraseña propia por sí solo
// — sin esta pantalla, la persona queda logueada "de una" y jamás llega a
// tener una contraseña con la que volver a entrar.
export function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setListo(true);
    window.location.hash = "";
    setTimeout(() => window.location.replace("/"), 1500);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <h2 className="mb-1 text-2xl font-semibold">Defina su contraseña</h2>
        <p className="mb-8 text-sm text-[var(--color-muted)]">
          Esta es la contraseña que usará para ingresar a la Mesa de ayuda SYS HIGEA de ahora en adelante.
        </p>

        {listo ? (
          <p className="rounded-[var(--radius-input)] bg-[var(--color-accent)]/20 px-3 py-2 text-sm">
            Contraseña guardada. Entrando…
          </p>
        ) : (
          <>
            <label className="mb-4 block text-sm">
              <span className="mb-1.5 block font-medium">Nueva contraseña</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="mb-5 block text-sm">
              <span className="mb-1.5 block font-medium">Confirmar contraseña</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                className={inputClass}
              />
            </label>
            {error && (
              <p className="mb-4 rounded-[var(--radius-input)] bg-[#f8e0dc] px-3 py-2 text-sm text-[#b3362a]">{error}</p>
            )}
            <Button variant="accent" type="submit" disabled={guardando} className="w-full justify-center">
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}
