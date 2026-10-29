import { Component } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { hashInicial } from "./lib/inviteHash.js";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { Layout } from "./components/Layout";
import { RequirePermission } from "./components/RequirePermission";
import { Login } from "./pages/Login";
import { Inbox } from "./pages/Inbox";
import { TicketDetail } from "./pages/TicketDetail";
import { NewTicket } from "./pages/NewTicket";
import { EditTicket } from "./pages/EditTicket";
import { Admin } from "./pages/Admin";
import { Ayuda } from "./pages/Ayuda";
import { Manual } from "./pages/Manual";
import { SetPassword } from "./pages/SetPassword";

// El cliente de Supabase limpia el hash de la URL al construirse —apenas se
// importa lib/supabase.js, antes de que React monte nada—, así que se usa el
// valor capturado en inviteHash.js (importado de primero en main.jsx) en vez
// de leer window.location.hash acá, que para este punto ya estaría vacío.
const esEnlaceDeContrasenaInicial = /type=invite|type=recovery/.test(hashInicial);

class ErrorBoundary extends Component {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  componentDidCatch(error) {
    console.error("Error no controlado al mostrar la aplicación:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6 text-center">
          <div>
            <h1 className="text-lg font-semibold">No se pudo mostrar esta pantalla</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Actualice la página. Si el problema continúa, contacte al administrador.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Protegido({ children }) {
  const { autenticado, cargando, error } = useAuth();
  if (cargando) return <div className="flex min-h-screen items-center justify-center">Cargando…</div>;
  if (!autenticado) return <Navigate to="/login" replace />;
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--color-muted)]">
        No se pudo cargar su perfil: {error}
      </div>
    );
  }
  return children;
}

function RutaLogin() {
  const { autenticado, cargando } = useAuth();
  if (!cargando && autenticado) return <Navigate to="/" replace />;
  return <Login />;
}

function Rutas() {
  if (esEnlaceDeContrasenaInicial) return <SetPassword />;
  return (
    <Routes>
      <Route path="/login" element={<RutaLogin />} />
      <Route
        element={
          <Protegido>
            <Layout />
          </Protegido>
        }
      >
        <Route path="/" element={<Inbox />} />
        <Route path="/tickets/nuevo" element={<NewTicket />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/tickets/:id/editar" element={<EditTicket />} />
        <Route path="/ayuda" element={<Ayuda />} />
        <Route path="/manual" element={<Manual />} />
        <Route
          path="/admin"
          element={
            <RequirePermission
              permisos={["usuarios.gestionar", "roles.gestionar"]}
              fallback={<Navigate to="/" replace />}
            >
              <Admin />
            </RequirePermission>
          }
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ErrorBoundary>
            <Rutas />
          </ErrorBoundary>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
