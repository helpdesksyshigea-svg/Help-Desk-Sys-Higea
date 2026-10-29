import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { Adjuntos } from "../components/Adjuntos";
import { RequirePermission } from "../components/RequirePermission";
import { IconArrowLeft, IconCheck, IconReturn, IconInbox, IconInfo, IconSend } from "../components/icons";

const EVENTO_LABEL = {
  creado: "Ticket radicado",
  aprobado: "Aprobado",
  devuelto: "Devuelto al facturador",
  editado: "Corregido y reenviado",
  tomado: "Caso tomado por HIGEA",
  requiere_info: "HIGEA solicitó información",
  respondido: "Facturación respondió",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
  adjunto_subido: "Documento adjuntado",
};

function fmt(iso) {
  return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

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

  const hayAcciones = [
    "tickets.aprobar",
    "tickets.devolver",
    "tickets.tomar",
    "tickets.pedir_info",
    "tickets.responder_info",
    "tickets.cerrar",
    "tickets.reabrir",
  ].some((p) => tienePermiso(p));

  const esSolicitante = perfil.id === ticket.solicitante_id && tienePermiso("tickets.crear");
  const puedeEditar =
    (esSolicitante && ["pendiente", "devuelto"].includes(ticket.estado)) ||
    (tienePermiso("tickets.aprobar") && ticket.estado === "devuelto");

  return (
    <div className="grid gap-6">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 justify-self-start text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        <IconArrowLeft size={14} />
        Bandeja
      </button>

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="font-mono text-xs text-[var(--color-muted)]">{ticket.code}</span>
            <h2 className="text-xl font-semibold">{ticket.items?.map((i) => i.factura).filter(Boolean).join(", ") || "Ticket"}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusTag estado={ticket.estado} />
            {ticket.dueAt && (
              <span className={`text-xs ${ticket.vencido ? "font-semibold text-[#b3362a]" : "text-[var(--color-muted)]"}`}>
                {ticket.vencido ? "Vencido desde" : "Vence"} {fmt(ticket.dueAt)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--color-border)] pt-4 text-sm sm:grid-cols-4">
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
        </div>

        {puedeEditar && (
          <Button variant="ghost" className="justify-self-start" onClick={() => navigate(`/tickets/${ticket.id}/editar`)}>
            Corregir ticket
          </Button>
        )}
      </Card>

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

      <Card className="grid gap-4">
        <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Historial</h3>
        <ol className="grid gap-4">
          {ticket.eventos.map((ev, i) => (
            <li key={ev.id} className="grid grid-cols-[20px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--color-ink)]" />
                {i < ticket.eventos.length - 1 && <span className="w-px flex-1 bg-[var(--color-border)]" />}
              </div>
              <div className="pb-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium">{EVENTO_LABEL[ev.tipo_evento] || ev.tipo_evento}</span>
                  <span className="text-xs text-[var(--color-muted)]">{fmt(ev.created_at)}</span>
                </div>
                {ev.texto && <div className="mt-0.5 text-sm text-[var(--color-muted)]">{ev.texto}</div>}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}

      {hayAcciones && (
        <Card className="grid gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Acciones</h3>
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
                  <IconCheck size={15} />
                  Aprobar y enviar a HIGEA
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.devolver"]}>
              {ticket.estado === "pendiente" && (
                <Button variant="danger" disabled={procesando} onClick={() => accion("devolver")}>
                  <IconReturn size={15} />
                  Devolver al facturador
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.tomar"]}>
              {ticket.estado === "aprobado" && (
                <Button variant="ghost" disabled={procesando} onClick={() => accion("tomar")}>
                  <IconInbox size={15} />
                  Tomar caso
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.pedir_info"]}>
              {ticket.estado === "en_proceso" && (
                <Button variant="ghost" disabled={procesando} onClick={() => accion("pedir-info")}>
                  <IconInfo size={15} />
                  Pedir información
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.responder_info"]}>
              {ticket.estado === "requiere_info" && (
                <Button variant="ghost" disabled={procesando} onClick={() => accion("responder-info")}>
                  <IconSend size={15} />
                  Responder a HIGEA
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.cerrar"]}>
              {ticket.estado === "en_proceso" && (
                <Button variant="accent" disabled={procesando} onClick={() => accion("cerrar")}>
                  <IconCheck size={15} />
                  Reportar realizado y cerrar
                </Button>
              )}
            </RequirePermission>
            <RequirePermission permisos={["tickets.reabrir"]}>
              {ticket.estado === "cerrado" && (
                <Button variant="danger" disabled={procesando} onClick={() => accion("reabrir")}>
                  <IconReturn size={15} />
                  Reabrir
                </Button>
              )}
            </RequirePermission>
          </div>
        </Card>
      )}
    </div>
  );
}
