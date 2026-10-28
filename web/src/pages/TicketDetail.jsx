import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { Adjuntos } from "../components/Adjuntos";
import { RequirePermission } from "../components/RequirePermission";

export function TicketDetail() {
  const { id } = useParams();
  const { perfil } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(false);

  async function cargar() {
    try {
      setTicket(await apiFetch(`/tickets/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, [id]);

  async function accion(ruta) {
    setProcesando(true);
    setError(null);
    try {
      await apiFetch(`/tickets/${id}/${ruta}`, { method: "POST", body: JSON.stringify({ nota }) });
      setNota("");
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setProcesando(false);
    }
  }

  if (error && !ticket) return <Card className="text-[#b3362a]">{error}</Card>;
  if (!ticket) return <p className="text-[var(--color-muted)]">Cargando…</p>;

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs text-[var(--color-muted)]">{ticket.code}</span>
          <h2 className="text-xl font-light">Tiquete</h2>
        </div>
        <StatusTag estado={ticket.estado} />
      </div>

      {ticket.dueAt && (
        <p className={`text-sm ${ticket.vencido ? "text-[#b3362a]" : "text-[var(--color-muted)]"}`}>
          {ticket.vencido ? "Vencido desde" : "Vence"} el{" "}
          {new Date(ticket.dueAt).toLocaleString("es-CO")}
        </p>
      )}

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Registros
        </h3>
        <div className="grid gap-2">
          {ticket.items.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-3 text-sm">
              <div className="font-medium">{item.factura || item.paciente || "Sin factura"}</div>
              <div className="text-[var(--color-muted)]">{item.descripcion}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Adjuntos ticketId={ticket.id} />
      </Card>

      <Card className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Historial
        </h3>
        {ticket.eventos.map((ev) => (
          <div key={ev.id} className="text-sm">
            <span className="font-medium">{ev.tipo_evento}</span>{" "}
            <span className="text-[var(--color-muted)]">
              · {new Date(ev.created_at).toLocaleString("es-CO")}
            </span>
            {ev.texto && <div className="text-[var(--color-muted)]">{ev.texto}</div>}
          </div>
        ))}
      </Card>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}

      <Card className="grid gap-3">
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (obligatoria según la acción)"
          className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 outline-none focus:border-[var(--color-ink)]"
        />
        <div className="flex flex-wrap gap-2">
          <RequirePermission permisos={["tickets.aprobar"]}>
            {ticket.estado === "pendiente" && (
              <Button variant="accent" disabled={procesando} onClick={() => accion("aprobar")}>
                Aprobar y enviar a HIGEA
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.devolver"]}>
            {ticket.estado === "pendiente" && (
              <Button variant="danger" disabled={procesando} onClick={() => accion("devolver")}>
                Devolver al facturador
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.tomar"]}>
            {ticket.estado === "aprobado" && (
              <Button variant="ghost" disabled={procesando} onClick={() => accion("tomar")}>
                Tomar caso
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.pedir_info"]}>
            {ticket.estado === "en_proceso" && (
              <Button variant="ghost" disabled={procesando} onClick={() => accion("pedir-info")}>
                Pedir información
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.responder_info"]}>
            {ticket.estado === "requiere_info" && (
              <Button variant="ghost" disabled={procesando} onClick={() => accion("responder-info")}>
                Responder a HIGEA
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.cerrar"]}>
            {ticket.estado === "en_proceso" && (
              <Button variant="accent" disabled={procesando} onClick={() => accion("cerrar")}>
                Reportar realizado y cerrar
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permisos={["tickets.reabrir"]}>
            {ticket.estado === "cerrado" && (
              <Button variant="danger" disabled={procesando} onClick={() => accion("reabrir")}>
                Reabrir
              </Button>
            )}
          </RequirePermission>
        </div>
      </Card>
    </div>
  );
}
