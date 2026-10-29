import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando, null = sin sesión
  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPerfil(null);
      return;
    }
    setError(null);
    apiFetch("/me")
      .then(setPerfil)
      .catch((e) => {
        setError(e.message);
        setPerfil(null);
      });
  }, [session]);

  const value = {
    cargando: session === undefined || (session && perfil === null && !error),
    autenticado: !!session,
    perfil, // { id, email, nombre, rol, proveedor, permisos }
    error,
    tienePermiso: (...claves) => claves.some((c) => perfil?.permisos?.includes(c)),
    iniciarSesion: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    cerrarSesion: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
