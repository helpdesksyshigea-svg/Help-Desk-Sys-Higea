import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { Adjuntos } from "../components/Adjuntos";
import { RequirePermission } from "../components/RequirePermission";

export function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil, tienePermiso } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [motivos, setMotivos] = useState({});
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

  useEffect(() => {
    apiFetch("/catalogos/motivos").then((data) => {
      setMotivos(Object.fromEntries(data.map((m) => [m.clave, m.etiqueta])));
    });
  }, []);

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
          <h2 className="text-xl font-light">Ticket</h2>
        </div>
        <StatusTag estado={ticket.estado} />
      </div>

      {(() => {
        const esSolicitante = perfil.id === ticket.solicitante_id && tienePermiso("tickets.crear");
        const puedeEditar =
          (esSolicitante && ["pendiente", "devuelto"].includes(ticket.estado)) ||
          (tienePermiso("tickets.aprobar") && ticket.estado === "devuelto");
        if (!puedeEditar) return null;
        return (
          <Button variant="ghost" className="justify-self-start" onClick={() => navigate(`/tickets/${ticket.id}/editar`)}>
            Corregir ticket
          </Button>
        );
      })()}

      <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Solicita</div>
          <div>{ticket.firmante}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Prioridad</div>
          <div className="capitalize">{ticket.prioridad}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Radicado</div>
          <div>{new Date(ticket.created_at).toLocaleDateString("es-CO")}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Aprobado</div>
          <div>{ticket.aprobado_at ? new Date(ticket.aprobado_at).toLocaleDateString("es-CO") : "—"}</div>
        </div>
      </Card>

      {ticket.dueAt && (
        <p className={`text-sm ${ticket.vencido ? "text-[#b3362a]" : "text-[var(--color-muted)]"}`}>
          {ticket.vencido ? "Vencido desde" : "Vence"} el{" "}
          {new Date(ticket.dueAt).toLocaleString("es-CO")}
        </p>
      )}

      <Card className="overflow-x-auto">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
          Registros ({ticket.items.length})
        </h3>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <th className="pb-2 pr-3 font-semibold">Factura</th>
              <th className="pb-2 pr-3 font-semibold">Paciente</th>
              <th className="pb-2 pr-3 font-semibold">Documento</th>
              <th className="pb-2 pr-3 font-semibold">{ticket.tipo === "elim_hc" ? "Folio HC" : "CUPS"}</th>
              <th className="pb-2 pr-3 font-semibold">Fecha</th>
              <th className="pb-2 pr-3 font-semibold">Motivo</th>
              <th className="pb-2 font-semibold">Descripción</th>
            </tr>
          </thead>
          <tbody>
            {ticket.items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                <td className="py-2 pr-3 font-mono text-xs">{item.factura || "—"}</td>
                <td className="py-2 pr-3">{item.paciente || "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs">{item.documento || "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs">{item.cups || "—"}</td>
                <td className="py-2 pr-3">{item.fecha || "—"}</td>
                <td className="py-2 pr-3">{motivos[item.motivo] || item.motivo}</td>
                <td className="py-2 text-[var(--color-muted)]">{item.descripcion || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <Adjuntos ticketId={ticket.id} kindsPermitidos={["soporte", "evidencia"]} />
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
