import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { filtrosPorRol, FILTRO_DEFAULT, necesitaAccion, textoSla } from "../lib/filters";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { StatusTag } from "../components/StatusTag";
import { RequirePermission } from "../components/RequirePermission";
import { useToast } from "../context/ToastContext";
import { SkeletonRow } from "../components/Skeleton";
import { IconInbox, IconPlus, IconDownload, IconEdit } from "../components/icons";
import { supabase } from "../lib/supabase";
import { leerBorrador } from "../lib/borrador";
import { fechaHora } from "../lib/fecha";

const API_URL = import.meta.env.VITE_API_URL;

async function exportarExcel() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_URL}/tickets/exportar`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "No se pudo exportar");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

const PRIORIDAD_LABEL = { alta: "Alta", normal: "Normal", baja: "Baja" };
const PRIORIDAD_COLOR = { alta: "#e02424", normal: "#f59e0b", baja: "#16a34a" };

function hace(iso) {
  const horas = (Date.now() - new Date(iso)) / 36e5;
  if (horas < 1) return "hace minutos";
  if (horas < 24) return `hace ${Math.floor(horas)} h`;
  return `hace ${Math.floor(horas / 24)} d`;
}

function iniciales(nombre) {
  if (!nombre) return "?";
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase();
}

function PrioridadDot({ color }) {
  return <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden="true" />;
}

export function Inbox() {
  const { perfil } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filtros = filtrosPorRol(perfil?.rol, perfil?.id);
  const filtroActivo = params.get("filtro") || FILTRO_DEFAULT[perfil?.rol] || filtros[0][0];
  const busqueda = (params.get("q") || "").trim().toLowerCase();
  const [tickets, setTickets] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(false);
  const { fallo } = useToast();
  const borrador = leerBorrador(perfil?.id);

  useEffect(() => {
    apiFetch("/catalogos/tipos")
      .then((data) => setTipos(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  const etiquetaTipo = (clave) => tipos.find((t) => t.clave === clave)?.etiqueta || clave;

  async function manejarExportar() {
    setExportando(true);
    try {
      await exportarExcel();
    } catch (e) {
      fallo(e.message);
    } finally {
      setExportando(false);
    }
  }

  useEffect(() => {
    function cargar() {
      apiFetch("/tickets")
        .then((data) => {
          if (!Array.isArray(data)) throw new Error("La respuesta del servidor no tiene el formato esperado.");
          setTickets(data);
        })
        .catch((e) => setError(e.message))
        .finally(() => setCargando(false));
    }
    cargar();
    // Otra persona (ej. la supervisora) puede cambiar un ticket desde otra
    // sesión/dispositivo mientras esta pestaña sigue abierta — sin esto, la
    // bandeja se queda con el estado viejo hasta que alguien recarga a mano.
    // "tickets-changed" cubre acciones propias en esta misma pestaña;
    // "visibilitychange" cubre cambios ajenos, al volver a esta pestaña.
    function alVolverVisible() {
      if (document.visibilityState === "visible") cargar();
    }
    window.addEventListener("tickets-changed", cargar);
    document.addEventListener("visibilitychange", alVolverVisible);
    return () => {
      window.removeEventListener("tickets-changed", cargar);
      document.removeEventListener("visibilitychange", alVolverVisible);
    };
  }, []);

  const [, , fn] = filtros.find(([k]) => k === filtroActivo) || filtros[0];
  const visibles = useMemo(() => {
    const base = busqueda
      ? tickets.filter((t) => {
          const texto = [t.code, t.firmante, ...(t.items?.flatMap((i) => [i.factura, i.paciente, i.documento]) || [])]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return texto.includes(busqueda);
        })
      : tickets.filter(fn);
    return [...base].sort((a, b) =>
      b.vencido === a.vencido ? new Date(b.created_at) - new Date(a.created_at) : b.vencido ? 1 : -1
    );
  }, [tickets, fn, busqueda]);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Tickets</h2>
        <div className="flex items-center gap-2">
          <RequirePermission permisos={["reportes.exportar"]}>
            <Button variant="ghost" onClick={manejarExportar} disabled={exportando}>
              <IconDownload size={15} />
              {exportando ? "Exportando…" : "Exportar a Excel"}
            </Button>
          </RequirePermission>
          <RequirePermission permisos={["tickets.crear"]}>
            <Button variant="accent" onClick={() => navigate("/tickets/nuevo")}>
              <IconPlus size={15} />
              Nuevo ticket
            </Button>
          </RequirePermission>
        </div>
      </div>

      {borrador && !busqueda && (
        <Card
          onClick={() => navigate("/tickets/nuevo")}
          className="flex cursor-pointer flex-wrap items-center justify-between gap-2 border-dashed hover:border-[var(--color-ink)]/40"
        >
          <span className="flex items-center gap-2 text-sm">
            <IconEdit size={15} className="shrink-0 text-[var(--color-muted)]" />
            <span>
              <span className="rounded-[var(--radius-tag)] bg-[var(--color-ink)]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                Borrador
              </span>{" "}
              {etiquetaTipo(borrador.tipo) || "Ticket sin enviar"}
              {borrador.firmante ? ` — ${borrador.firmante}` : ""}
              {borrador.guardadoEn ? ` · guardado ${fechaHora(borrador.guardadoEn)}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-[var(--color-muted)]">Continuar →</span>
        </Card>
      )}

      {busqueda ? (
        <p className="text-sm text-[var(--color-muted)]">
          Resultados para "<span className="font-medium text-[var(--color-ink)]">{busqueda}</span>" — {visibles.length} ticket(s).{" "}
          <button onClick={() => navigate("/")} className="underline hover:text-[var(--color-ink)]">
            Quitar búsqueda
          </button>
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 md:hidden">
          {filtros.map(([clave, etiqueta, fn]) => (
            <button
              key={clave}
              onClick={() => navigate(`/?filtro=${clave}`)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                filtroActivo === clave
                  ? "border-[var(--color-ink)] bg-[var(--color-ink)] text-[var(--color-canvas)]"
                  : "border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-ink)]/40 hover:text-[var(--color-ink)]"
              }`}
            >
              {etiqueta} <span className="opacity-70">{tickets.filter(fn).length}</span>
            </button>
          ))}
        </div>
      )}

      {cargando && (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {error && (
        <Card className="text-sm text-[var(--color-muted)]">No se pudo cargar la bandeja. Error: {error}</Card>
      )}

      {!cargando && !error && visibles.length === 0 && (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <IconInbox size={28} className="text-[var(--color-muted)]" />
          <p className="font-medium">Ningún ticket en esta vista</p>
          <p className="text-sm text-[var(--color-muted)]">Prueba otro filtro, o espera a que algo necesite tu atención aquí.</p>
        </Card>
      )}

      {!cargando && !error && visibles.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)]">
          {/* table-fixed: sin esto, un "Tipo de solicitud" largo con
              whitespace-nowrap (por el truncate de abajo) hace crecer esa
              columna más allá de lo que el layout "auto" le asigna y se
              desborda encima de la columna de al lado (Solicitante) en vez
              de recortarse con "…" — table-fixed + anchos por columna hace
              que cada <td> respete su ancho y el truncate funcione de verdad. */}
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-header-bg)] text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-header-ink)]">
                <th className="w-20 py-3 pl-4">Prioridad</th>
                <th className="w-36 py-3 pr-3">Ticket</th>
                <th className="w-56 py-3 pr-3">Tipo de solicitud</th>
                <th className="w-44 py-3 pr-3">Solicitante</th>
                <th className="w-24 py-3 pr-3">Creado</th>
                <th className="w-28 py-3 pr-3 text-right">Plazo</th>
                <th className="w-40 py-3 pr-4 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => {
                const destacado = necesitaAccion(t, perfil?.rol, perfil?.id);
                const sla = textoSla(t);
                return (
                  <tr
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)]"
                  >
                    <td className="py-3.5 pl-4 align-top">
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-muted)]">
                        <PrioridadDot color={PRIORIDAD_COLOR[t.prioridad] || "var(--color-muted)"} />
                        {PRIORIDAD_LABEL[t.prioridad] || t.prioridad}
                      </span>
                    </td>
                    <td className="overflow-hidden py-3.5 pr-3 align-top">
                      <div className={`truncate text-base leading-tight ${destacado ? "font-bold" : "font-semibold"}`}>{t.code}</div>
                      {t.vencido && (
                        <span className="mt-0.5 inline-block rounded-[var(--radius-tag)] bg-[#f8e0dc] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#b3362a]">
                          Vencido
                        </span>
                      )}
                    </td>
                    <td className="overflow-hidden py-3.5 pr-3 align-top">
                      <span className="block truncate text-sm">{etiquetaTipo(t.tipo)}</span>
                    </td>
                    <td className="overflow-hidden py-3.5 pr-3 align-top">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)]/[0.06] text-[10px] font-semibold text-[var(--color-ink)]">
                          {iniciales(t.firmante)}
                        </span>
                        <span className="truncate text-xs text-[var(--color-muted)]">{t.firmante || "—"}</span>
                      </div>
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap py-3.5 pr-3 align-top text-xs text-[var(--color-muted)]">
                      {hace(t.created_at)}
                    </td>
                    <td className="py-3.5 pr-3 text-right align-top">
                      {sla ? (
                        <span
                          className={`font-variant-numeric-tabular text-xs ${sla.urgente ? "font-semibold text-[#b3362a]" : "text-[var(--color-muted)]"}`}
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {sla.texto}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 text-right align-top">
                      <StatusTag estado={t.estado} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
