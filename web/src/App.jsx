import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

// Supabase procesa el token de la URL (invitación o "olvidé mi contraseña") y
// abre sesión automáticamente antes de que React alcance a renderizar nada;
// sin esta comprobación, Protegido vería "ya autenticado" y mandaría
// directo a la bandeja sin pedir nunca definir una contraseña.
function esEnlaceDeContrasena() {
  return /type=invite|type=recovery/.test(window.location.hash);
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
  if (esEnlaceDeContrasena()) return <SetPassword />;
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
          <Rutas />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
