import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch, apiFetchBlob } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { Adjuntos } from "../components/Adjuntos";
import { ModalFirmarOficio, oficioGeneradoDe } from "../components/ModalFirmarOficio";
import { useToast } from "../context/ToastContext";
import { esperando } from "../lib/filters";
import { fechaCorta, fechaHora } from "../lib/fecha";
import { IconArrowLeft, IconCheck, IconReturn, IconInbox, IconInfo, IconSend, IconUser, IconPaperclip, IconTrash, IconEdit } from "../components/icons";

const readOnlyClass =
  "w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2";

function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

const ACCIONES = [
  // Primera instancia, solo para tickets radicados por un médico (ticket.etapa_aprobacion
  // === "coordinador_medico"): el coordinador médico revisa antes que cualquier
  // supervisora pueda actuar — ver etapaRequerida/etapaBloqueada en el filtro "disponibles".
  { ruta: "aprobar-coordinador", permiso: "tickets.aprobar_coordinador", estados: ["pendiente"], etapaRequerida: "coordinador_medico", label: "Aprobar como coordinador médico", icon: IconCheck, variant: "accent", notaObligatoria: false, exito: "Ticket aprobado, enviado a facturación" },
  { ruta: "devolver-coordinador", permiso: "tickets.devolver_coordinador", estados: ["pendiente"], etapaRequerida: "coordinador_medico", label: "Devolver al médico", icon: IconReturn, variant: "danger", notaObligatoria: true, exito: "Ticket devuelto al médico" },
  { ruta: "aprobar", permiso: "tickets.aprobar", estados: ["pendiente"], etapaBloqueada: "coordinador_medico", label: "Aprobar y enviar a SYS HIGEA", icon: IconCheck, variant: "accent", notaObligatoria: false, exito: "Ticket aprobado y enviado a SYS HIGEA" },
  { ruta: "devolver", permiso: "tickets.devolver", estados: ["pendiente"], etapaBloqueada: "coordinador_medico", label: "Devolver al facturador", icon: IconReturn, variant: "danger", notaObligatoria: true, exito: "Ticket devuelto al facturador" },
  { ruta: "tomar", permiso: "tickets.tomar", estados: ["aprobado"], label: "Tomar caso", icon: IconInbox, variant: "accent", notaObligatoria: false, exito: "Caso tomado" },
  { ruta: "pedir-info", permiso: "tickets.pedir_info", estados: ["en_proceso"], label: "Pedir información", icon: IconInfo, variant: "ghost", notaObligatoria: true, exito: "Se solicitó información al facturador", requiereAsignado: true },
  { ruta: "responder-info", permiso: "tickets.responder_info", estados: ["requiere_info"], label: "Responder a SYS HIGEA", icon: IconSend, variant: "ghost", notaObligatoria: true, exito: "Respuesta enviada a SYS HIGEA" },
  { ruta: "cerrar", permiso: "tickets.cerrar", estados: ["en_proceso"], label: "Reportar realizado y cerrar", icon: IconCheck, variant: "accent", notaObligatoria: true, exito: "Ticket cerrado", requiereAsignado: true },
  { ruta: "liberar", permiso: "tickets.tomar", estados: ["en_proceso"], label: "Liberar caso", icon: IconReturn, variant: "ghost", notaObligatoria: false, exito: "Caso liberado", soloAsignado: true },
  { ruta: "reabrir", permiso: "tickets.reabrir", estados: ["cerrado"], label: "Reabrir", icon: IconReturn, variant: "danger", notaObligatoria: true, exito: "Ticket reabierto" },
];

const EVENTO_LABEL = {
  creado: "Ticket radicado",
  aprobado_coordinador: "Aprobado por coordinador médico",
  aprobado: "Aprobado",
  devuelto: "Devuelto",
  editado: "Corregido y reenviado",
  tomado: "Caso tomado por SYS HIGEA",
  liberado: "Caso liberado, vuelve a estar disponible",
  requiere_info: "SYS HIGEA solicitó información",
  respondido: "Facturación respondió",
  cerrado: "Cerrado",
  reabierto: "Reabierto",
  adjunto_subido: "Documento adjuntado",
};

// Solo para eventos donde "por" en la BD es una persona con su propia
// cuenta (facturador/supervisora) — "tomado"/"cerrado" ya llevan el nombre
// del ingeniero en el texto, porque "por" ahí es la cuenta compartida de
// SYS HIGEA, no la persona real.
const EVENTOS_CON_AUTOR = new Set(["creado", "aprobado_coordinador", "aprobado", "devuelto", "editado", "respondido", "reabierto"]);

function etiquetaEvento(ev) {
  const base = EVENTO_LABEL[ev.tipo_evento] || ev.tipo_evento;
  if (EVENTOS_CON_AUTOR.has(ev.tipo_evento) && ev.usuario?.nombre) {
    return `${base} por ${ev.usuario.nombre}`;
  }
  return base;
}


export function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { perfil, tienePermiso } = useAuth();
  const { exito: toastExito, fallo: toastFallo } = useToast();
  const [ticket, setTicket] = useState(null);
  const [motivos, setMotivos] = useState({});
  const [tipos, setTipos] = useState({});
  const [error, setError] = useState(null);
  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(null); // ruta de la acción en curso, o null
  const [ingenieros, setIngenieros] = useState([]);
  const [agenteHigea, setAgenteHigea] = useState("");
  const [accionPendienteFirma, setAccionPendienteFirma] = useState(null); // def de ACCIONES en espera de confirmar firma
  const [cargandoOficio, setCargandoOficio] = useState(false);

  async function cargar() {
    try {
      const data = await apiFetch(`/tickets/${id}`);
      if (!data || typeof data !== "object") throw new Error("No se pudo cargar la información del ticket.");
      setTicket(data);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
    // Si otra persona cambia este ticket desde otra sesión mientras esta
    // pestaña sigue abierta en su detalle, al volver a ella se refresca solo.
    function alVolverVisible() {
      if (document.visibilityState === "visible") cargar();
    }
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => document.removeEventListener("visibilitychange", alVolverVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    apiFetch("/catalogos/motivos")
      .then((data) => setMotivos(Object.fromEntries((Array.isArray(data) ? data : []).map((m) => [m.clave, m.etiqueta]))))
      .catch((e) => setError(`No se pudieron cargar los motivos. ${e.message}`));
  }, []);

  useEffect(() => {
    apiFetch("/catalogos/tipos")
      .then((data) => setTipos(Object.fromEntries((Array.isArray(data) ? data : []).map((t) => [t.clave, t.etiqueta]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/catalogos/ingenieros")
      .then((data) => setIngenieros(Array.isArray(data) ? data : []))
      .catch(() => {}); // solo hace falta para tomar un caso; si falla, el selector queda vacío
  }, []);

  async function accion(def, firmaConfirmada = false) {
    if (def.notaObligatoria && !nota.trim()) {
      toastFallo("Esta acción requiere que escribas una nota primero");
      return;
    }
    if (def.ruta === "tomar" && !agenteHigea) {
      toastFallo("Indique qué ingeniero de SYS HIGEA toma el caso");
      return;
    }
    // Beta: "Aprobar y enviar a SYS HIGEA" se intercepta con el modal "Firmar
    // oficio" antes de llegar aquí (ver el onClick del botón más abajo); este
    // flag solo confirma que ya se pasó por ahí, nunca se activa solo.
    if (def.ruta === "aprobar" && perfil?.beta_firma_oficio && !firmaConfirmada) {
      setAccionPendienteFirma(def);
      return;
    }
    setProcesando(def.ruta);
    setError(null);
    try {
      const body = { nota, firmaConfirmada };
      if (def.ruta === "tomar") body.agente_higea = agenteHigea;
      await apiFetch(`/tickets/${id}/${def.ruta}`, { method: "POST", body: JSON.stringify(body) });
      setNota("");
      setAgenteHigea("");
      await cargar();
      toastExito(def.exito);
    } catch (e) {
      setError(e.message);
      toastFallo(e.message);
    } finally {
      setProcesando(null);
    }
  }

  async function confirmarFirmaYAprobar() {
    const def = accionPendienteFirma;
    setAccionPendienteFirma(null);
    if (def) await accion(def, true);
  }

  async function descargarOficio(descargar) {
    if (!descargar) setCargandoOficio(true);
    try {
      const blob = await apiFetchBlob(`/tickets/${id}/oficio-generado.pdf${descargar ? "?descargar=1" : ""}`);
      const url = URL.createObjectURL(blob);
      if (descargar) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `oficio-${ticket.code}.pdf`;
        a.click();
      } else {
        window.open(url, "_blank", "noopener");
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toastFallo(e.message);
    } finally {
      setCargandoOficio(false);
    }
  }

  async function eliminarTicket() {
    if (!window.confirm(`Esto elimina PERMANENTEMENTE el ticket ${ticket.code}, con todo su historial y adjuntos. No se puede deshacer. ¿Continuar?`)) return;
    setProcesando("eliminar");
    try {
      await apiFetch(`/tickets/${id}`, { method: "DELETE" });
      toastExito(`Ticket ${ticket.code} eliminado`);
      navigate("/");
    } catch (e) {
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
  const disponibles = ACCIONES.filter(
    (a) =>
      tienePermiso(a.permiso) &&
      a.estados.includes(ticket.estado) &&
      !bloqueadoParaMi(a) &&
      (!a.etapaRequerida || ticket.etapa_aprobacion === a.etapaRequerida) &&
      (!a.etapaBloqueada || ticket.etapa_aprobacion !== a.etapaBloqueada),
  );

  const esSolicitante = perfil.id === ticket.solicitante_id && tienePermiso("tickets.crear");
  const puedeEditar =
    (esSolicitante && ["pendiente", "devuelto"].includes(ticket.estado)) ||
    ((tienePermiso("tickets.aprobar") || tienePermiso("tickets.aprobar_coordinador")) && ticket.estado === "devuelto");

  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const eventos = Array.isArray(ticket.eventos) ? ticket.eventos : [];
  const asunto = items.map((i) => i.factura).filter(Boolean).join(", ") || items[0]?.paciente || "";

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          <IconArrowLeft size={14} />
          Mesa de ayuda SYS HIGEA
        </button>
        {tienePermiso("tickets.eliminar") && (
          <button
            onClick={eliminarTicket}
            disabled={procesando === "eliminar"}
            className="inline-flex items-center gap-1.5 text-sm text-[#b3362a] transition-colors hover:underline disabled:opacity-50"
          >
            <IconTrash size={14} />
            {procesando === "eliminar" ? "Eliminando…" : "Eliminar ticket"}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{ticket.code}</h1>
          <StatusTag estado={ticket.estado} />
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

      {/* Misma estructura de campo (etiqueta + caja con borde) que TicketForm, en
          lectura: así el detalle se ve como "la solicitud ya radicada", no como un
          panel administrativo aparte — es la misma información, ahora fija. */}
      <h3 className="-mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        Datos de la solicitud
      </h3>
      <Card className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 text-sm">
          <span className="mb-1 block font-medium">Tipo de solicitud</span>
          <div className={`${readOnlyClass} truncate`}>{tipos[ticket.tipo] || ticket.tipo}</div>
        </div>
        <div className="min-w-0 text-sm">
          <span className="mb-1 block font-medium">Prioridad</span>
          <div className={`${readOnlyClass} flex items-center gap-1.5 capitalize`}>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: { alta: "#e02424", normal: "#f59e0b", baja: "#16a34a" }[ticket.prioridad] }}
            />
            {ticket.prioridad}
          </div>
        </div>
        <div className="min-w-0 text-sm md:col-span-2">
          <span className="mb-1 block font-medium">Solicita (nombre de quien firma el oficio)</span>
          <div className={`${readOnlyClass} flex min-w-0 items-center gap-2`}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-[10px] font-semibold">
              {iniciales(ticket.firmante)}
            </span>
            <span className="truncate">{ticket.firmante}</span>
          </div>
        </div>
        {(asunto || ticket.observacion) && (
          <div className="min-w-0 text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Observación general</span>
            <div className={readOnlyClass}>
              {asunto ? `Factura ${asunto}` : ""}
              {asunto && ticket.observacion ? " — " : ""}
              {ticket.observacion}
            </div>
          </div>
        )}
        {ticket.asignado && (
          <div className="min-w-0 text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Ingeniero SYS HIGEA</span>
            <div className={`${readOnlyClass} truncate`}>{ticket.agente_higea || ticket.asignado.nombre}</div>
          </div>
        )}
        {puedeEditar && (
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button variant="ghost" onClick={() => navigate(`/tickets/${ticket.id}/editar`)}>
              <IconEdit size={14} />
              Corregir ticket
            </Button>
          </div>
        )}
      </Card>

      <div className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          Registros ({items.length})
        </h3>
        {items.map((item, i) => (
          <Card key={item.id} className="grid gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-xs font-semibold text-[var(--color-ink)]">
              {i + 1}
            </span>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Factura</span>
                <div className={`${readOnlyClass} truncate`}>{item.factura || "—"}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Paciente</span>
                <div className={`${readOnlyClass} truncate`}>{item.paciente || "—"}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Documento</span>
                <div className={`${readOnlyClass} truncate`}>{item.documento || "—"}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">{ticket.tipo === "elim_hc" ? "Folio HC" : "CUPS"}</span>
                <div className={`${readOnlyClass} truncate`}>{item.cups || "—"}</div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr]">
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Fecha</span>
                <div className={`${readOnlyClass} truncate`}>{fechaCorta(item.fecha)}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Motivo</span>
                <div className={`${readOnlyClass} truncate`}>{motivos[item.motivo] || item.motivo || "—"}</div>
              </div>
              <div className="min-w-0 text-sm">
                <span className="mb-1 block font-medium">Descripción</span>
                <div className={readOnlyClass}>{item.descripcion || "—"}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          {ticket.archivado_at && (
            <p className="mb-3 rounded-[var(--radius-input)] bg-[var(--color-ink)]/5 px-3 py-2 text-xs text-[var(--color-muted)]">
              Los documentos adjuntos de este ticket se eliminaron automáticamente el {fechaCorta(ticket.archivado_at)}{" "}
              por antigüedad. El resto de la información queda disponible para siempre.
            </p>
          )}
          <Adjuntos
            ticketId={ticket.id}
            kindsPermitidos={["soporte", "evidencia"]}
            oficioGenerado={{
              nombre: `oficio-${ticket.code}.pdf`,
              meta: "Oficio generado automáticamente",
              cargandoVista: cargandoOficio,
              onVer: () => descargarOficio(false),
              onDescargar: () => descargarOficio(true),
            }}
          />
        </Card>

        <Card className="grid gap-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">Historial</h3>
          <ol className="grid gap-4">
            {eventos.map((ev, i) => {
              const esUltimo = i === eventos.length - 1;
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
                    <span className="font-medium">{etiquetaEvento(ev)}</span>
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
          No tienes ninguna acción disponible mientras el ticket esté <b>{esperando(ticket)?.toLowerCase()}</b>.
        </Card>
      )}

      {disponibles.length > 0 && (
        <Card className="flex flex-col gap-3">
          {disponibles.some((a) => a.ruta === "tomar") && (
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
                Ingeniero de SYS HIGEA que toma el caso
              </span>
              <select
                value={agenteHigea}
                onChange={(e) => setAgenteHigea(e.target.value)}
                className="w-full rounded-[var(--radius-input)] border border-[var(--color-ink)]/20 bg-[var(--color-ink)]/5 px-3 py-2 outline-none focus:border-[var(--color-ink)]"
              >
                <option value="">Seleccione…</option>
                {ingenieros.map((i) => (
                  <option key={i.clave} value={i.etiqueta}>
                    {i.etiqueta}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
          </div>
        </Card>
      )}

      {accionPendienteFirma && (
        <ModalFirmarOficio
          titulo="Firmar oficio"
          cargarPreview={() => oficioGeneradoDe(ticket.id)}
          onConfirmar={confirmarFirmaYAprobar}
          onCancelar={() => setAccionPendienteFirma(null)}
          confirmando={procesando === "aprobar"}
        />
      )}
    </div>
  );
}
