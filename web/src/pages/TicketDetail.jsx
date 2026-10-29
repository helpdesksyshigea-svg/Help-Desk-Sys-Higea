import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { Adjuntos } from "../components/Adjuntos";
import { useToast } from "../context/ToastContext";
import { ESPERANDO } from "../lib/filters";
import { fechaCorta, fechaHora } from "../lib/fecha";
import { IconArrowLeft, IconCheck, IconReturn, IconInbox, IconInfo, IconSend, IconUser, IconClock, IconPaperclip } from "../components/icons";

function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

const ACCIONES = [
  { ruta: "aprobar", permiso: "tickets.aprobar", estados: ["pendiente"], label: "Aprobar y enviar a SYS HIGEA", icon: IconCheck, variant: "accent", notaObligatoria: false, exito: "Ticket aprobado y enviado a SYS HIGEA" },
  { ruta: "devolver", permiso: "tickets.devolver", estados: ["pendiente"], label: "Devolver al facturador", icon: IconReturn, variant: "danger", notaObligatoria: true, exito: "Ticket devuelto al facturador" },
  { ruta: "tomar", permiso: "tickets.tomar", estados: ["aprobado"], label: "Tomar caso", icon: IconInbox, variant: "ghost", notaObligatoria: false, exito: "Caso tomado" },
  { ruta: "pedir-info", permiso: "tickets.pedir_info", estados: ["en_proceso"], label: "Pedir información", icon: IconInfo, variant: "ghost", notaObligatoria: true, exito: "Se solicitó información al facturador", requiereAsignado: true },
  { ruta: "responder-info", permiso: "tickets.responder_info", estados: ["requiere_info"], label: "Responder a SYS HIGEA", icon: IconSend, variant: "ghost", notaObligatoria: true, exito: "Respuesta enviada a SYS HIGEA" },
  { ruta: "cerrar", permiso: "tickets.cerrar", estados: ["en_proceso"], label: "Reportar realizado y cerrar", icon: IconCheck, variant: "accent", notaObligatoria: true, exito: "Ticket cerrado", requiereAsignado: true },
  { ruta: "liberar", permiso: "tickets.tomar", estados: ["en_proceso"], label: "Liberar caso", icon: IconReturn, variant: "ghost", notaObligatoria: false, exito: "Caso liberado", soloAsignado: true },
  { ruta: "reabrir", permiso: "tickets.reabrir", estados: ["cerrado"], label: "Reabrir", icon: IconReturn, variant: "danger", notaObligatoria: true, exito: "Ticket reabierto" },
];

const EVENTO_LABEL = {
  creado: "Ticket radicado",
  aprobado: "Aprobado",
  devuelto: "Devuelto al facturador",
  editado: "Corregido y reenviado",
  tomado: "Caso tomado por SYS HIGEA",
  liberado: "Caso liberado, vuelve a estar disponible",
  requiere_info: "SYS HIGEA solicitó información",
  respondido: "Facturación respondió",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
  adjunto_subido: "Documento adjuntado",
};


export function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil, tienePermiso } = useAuth();
  const { exito: toastExito, fallo: toastFallo } = useToast();
  const [ticket, setTicket] = useState(null);
  const [motivos, setMotivos] = useState({});
  const [error, setError] = useState(null);
  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(null); // ruta de la acción en curso, o null

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

  async function accion(def) {
    if (def.notaObligatoria && !nota.trim()) {
      toastFallo("Esta acción requiere que escribas una nota primero");
      return;
    }
    setProcesando(def.ruta);
    setError(null);
    try {
      await apiFetch(`/tickets/${id}/${def.ruta}`, { method: "POST", body: JSON.stringify({ nota }) });
      setNota("");
      await cargar();
      toastExito(def.exito);
    } catch (e) {
      setError(e.message);
      toastFallo(e.message);
    } finally {
      setProcesando(null);
    }
  }

  if (error && !ticket) return <Card className="text-[#b3362a]">{error}</Card>;
  if (!ticket) return <p className="text-[var(--color-muted)]">Cargando…</p>;

  const tienePermisoAccion = ACCIONES.some((a) => tienePermiso(a.permiso));
  const bloqueadoParaMi = (a) => {
    if (a.requiereAsignado && ticket.asignado_a && ticket.asignado_a !== perfil.id) return true;
    if (a.soloAsignado && ticket.asignado_a !== perfil.id) return true;
    return false;
  };
  const disponibles = ACCIONES.filter((a) => tienePermiso(a.permiso) && a.estados.includes(ticket.estado) && !bloqueadoParaMi(a));

  const esSolicitante = perfil.id === ticket.solicitante_id && tienePermiso("tickets.crear");
  const puedeEditar =
    (esSolicitante && ["pendiente", "devuelto"].includes(ticket.estado)) ||
    (tienePermiso("tickets.aprobar") && ticket.estado === "devuelto");

  const asunto = ticket.items?.map((i) => i.factura).filter(Boolean).join(", ") || ticket.items?.[0]?.paciente || "";

  return (
    <div className="grid gap-6">
      <button
        onClick={() => navigate("/")}
        className="inline-flex items-center gap-1.5 justify-self-start text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        <IconArrowLeft size={14} />
        Mesa de ayuda SYS HIGEA
      </button>

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{ticket.code}</h1>
              <StatusTag estado={ticket.estado} />
            </div>
            {(asunto || ticket.observacion) && (
              <p className="mt-1 text-sm text-[var(--color-muted)]">{asunto ? `Factura ${asunto}` : ""}{asunto && ticket.observacion ? " — " : ""}{ticket.observacion}</p>
            )}
          </div>
          <div className="text-right text-xs text-[var(--color-muted)]">
            <div>Creado el {fechaHora(ticket.created_at)}</div>
            {ticket.dueAt && (
              <div className={ticket.vencido ? "font-semibold text-[#b3362a]" : ""}>
                {ticket.vencido ? "Vencido desde" : "Vence"} {fechaHora(ticket.dueAt)}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-[var(--color-border)] pt-4 text-sm sm:grid-cols-4">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              <IconUser size={13} /> Solicita
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-[10px] font-semibold">
                {iniciales(ticket.firmante)}
              </span>
              {ticket.firmante}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Prioridad</div>
            <div className="flex items-center gap-1.5 capitalize">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: { alta: "#e02424", normal: "#f59e0b", baja: "#16a34a" }[ticket.prioridad] }}
              />
              {ticket.prioridad}
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              <IconClock size={13} /> Radicado
            </div>
            <div>{fechaCorta(ticket.created_at)}</div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              <IconCheck size={13} /> Aprobado
            </div>
            <div>{ticket.aprobado_at ? fechaCorta(ticket.aprobado_at) : "Sin aprobación aún"}</div>
          </div>
          {ticket.asignado && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
                <IconUser size={13} /> Asignado a
              </div>
              <div>{ticket.asignado.nombre}</div>
            </div>
          )}
        </div>

        <p className="text-sm text-[var(--color-muted)]">{ESPERANDO[ticket.estado]}</p>

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
              <th className="w-8 pb-2 pr-3 font-semibold">#</th>
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
            {ticket.items.map((item, i) => (
              <tr key={item.id} className="border-b border-[var(--color-border)] last:border-0 align-top">
                <td className="py-2 pr-3 text-[var(--color-muted)]">{i + 1}</td>
                <td className="py-2 pr-3 text-xs">{item.factura || "—"}</td>
                <td className="py-2 pr-3">{item.paciente || "—"}</td>
                <td className="py-2 pr-3 text-xs">{item.documento || "—"}</td>
                <td className="py-2 pr-3 text-xs">{item.cups || "—"}</td>
                <td className="py-2 pr-3">{fechaCorta(item.fecha)}</td>
                <td className="py-2 pr-3">{motivos[item.motivo] || item.motivo}</td>
                <td className="py-2 text-[var(--color-muted)]">{item.descripcion || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {ticket.archivado_at && (
            <p className="mb-3 rounded-[var(--radius-input)] bg-[var(--color-ink)]/5 px-3 py-2 text-xs text-[var(--color-muted)]">
              Los documentos adjuntos de este ticket se eliminaron automáticamente el {fechaCorta(ticket.archivado_at)}{" "}
              por antigüedad. El resto de la información queda disponible para siempre.
            </p>
          )}
          <Adjuntos ticketId={ticket.id} kindsPermitidos={["soporte", "evidencia"]} />
        </Card>

        <Card className="grid gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Historial</h3>
          <ol className="grid gap-4">
            {ticket.eventos.map((ev, i) => {
              const esUltimo = i === ticket.eventos.length - 1;
              const enCurso = esUltimo && ticket.estado !== "cerrado";
              return (
              <li key={ev.id} className="grid grid-cols-[20px_1fr] gap-3">
                <div className="flex min-h-full flex-col items-center">
                  <span
                    className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full ${
                      enCurso ? "border-2 border-[var(--color-ink)] bg-transparent" : "bg-[var(--color-state-cerrado)]"
                    }`}
                  />
                  {!esUltimo && <span className="mt-1 w-0.5 flex-1 bg-[var(--color-ink)]/15" />}
                </div>
                <div className="pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{EVENTO_LABEL[ev.tipo_evento] || ev.tipo_evento}</span>
                    <span className="text-xs text-[var(--color-muted)]">{fechaHora(ev.created_at)}</span>
                  </div>
                  {ev.texto && <div className="mt-0.5 text-sm text-[var(--color-muted)]">{ev.texto}</div>}
                </div>
              </li>
              );
            })}
          </ol>
        </Card>
      </div>

      {error && <p className="text-sm text-[#b3362a]">{error}</p>}

      {tienePermisoAccion && disponibles.length === 0 && (
        <Card className="text-sm text-[var(--color-muted)]">
          No tienes ninguna acción disponible mientras el ticket esté <b>{ESPERANDO[ticket.estado]?.toLowerCase()}</b>.
        </Card>
      )}

      {disponibles.length > 0 && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              Nota {disponibles.some((a) => a.notaObligatoria) ? "(obligatoria según la acción)" : "(opcional)"}
            </span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escribe una observación sobre el ticket…"
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 outline-none focus:border-[var(--color-ink)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {disponibles.map((a) => (
              <Button key={a.ruta} variant={a.variant} disabled={!!procesando} onClick={() => accion(a)}>
                <a.icon size={15} />
                {procesando === a.ruta ? "Guardando…" : a.label}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
