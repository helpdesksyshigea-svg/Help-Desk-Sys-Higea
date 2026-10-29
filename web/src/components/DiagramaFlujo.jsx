import { useState } from "react";

// Diagrama BPMN simplificado del ciclo de vida de un ticket: carriles por
// rol (Facturación / Supervisora / SYS HIGEA), tareas (rectángulos
// redondeados), compuertas exclusivas (rombos) y eventos de inicio/fin
// (círculos). Interactivo: clic en cualquier nodo muestra quién lo ejecuta,
// qué permiso requiere y qué pasa. Coordenadas fijas (no es un motor BPMN
// genérico) porque el proceso siempre es el mismo.

const GUTTER = 150; // ancho reservado para el nombre del carril, a la izquierda
const LANE_FACT = 90;
const LANE_SUP = 270;
const LANE_HIGEA = 460;
const LANE_HIGEA2 = 620;

const NODOS = [
  { id: "inicio", tipo: "start", x: 60, y: LANE_FACT, label: "Inicio" },
  {
    id: "radicar",
    tipo: "task",
    x: 230,
    y: LANE_FACT,
    w: 160,
    h: 64,
    label: "Radicar ticket\n(oficio firmado)",
    quien: "Facturación",
    permiso: "tickets.crear",
    detalle:
      "El facturador completa factura, paciente, documento, CUPS, fecha, motivo y descripción por cada registro, y adjunta el oficio firmado. Sin oficio, el sistema no deja radicar.",
  },
  {
    id: "revisar",
    tipo: "task",
    x: 230,
    y: LANE_SUP,
    w: 160,
    h: 64,
    label: "Revisar ticket\npendiente",
    quien: "Supervisora",
    permiso: "tickets.aprobar / tickets.devolver",
    detalle: "La supervisora ve el ticket con el oficio y todos los registros a eliminar, listos para revisar.",
  },
  {
    id: "gw_aprueba",
    tipo: "gateway",
    x: 480,
    y: LANE_SUP,
    label: "¿Aprueba?",
    quien: "Supervisora",
    detalle: "Decisión exclusiva: si aprueba, el ticket queda sellado con los registros tal como están en ese momento.",
  },
  {
    id: "corregir",
    tipo: "task",
    x: 480,
    y: LANE_FACT,
    w: 160,
    h: 64,
    label: "Corregir y\nreenviar",
    quien: "Facturación",
    permiso: "tickets.crear (edición)",
    detalle:
      "La supervisora devolvió el ticket con una nota explicando qué corregir. El facturador ajusta y lo reenvía; vuelve a quedar pendiente de aprobación.",
  },
  {
    id: "tomar",
    tipo: "task",
    x: 730,
    y: LANE_HIGEA,
    w: 180,
    h: 64,
    label: "Tomar caso y\ngestionar",
    quien: "SYS HIGEA",
    permiso: "tickets.tomar",
    detalle: "SYS HIGEA solo ve tickets ya aprobados. Al tomar el caso, pasa a 'En proceso'.",
  },
  {
    id: "gw_info",
    tipo: "gateway",
    x: 980,
    y: LANE_HIGEA,
    label: "¿Necesita\ninformación?",
    quien: "SYS HIGEA",
    detalle: "Si falta algo para resolver el caso, SYS HIGEA puede pedir información antes de continuar.",
  },
  {
    id: "pedir_info",
    tipo: "task",
    x: 1210,
    y: LANE_HIGEA,
    w: 170,
    h: 64,
    label: "Pedir\ninformación",
    quien: "SYS HIGEA",
    permiso: "tickets.pedir_info",
    detalle: "El reloj del plazo se pausa mientras se espera la respuesta del facturador.",
  },
  {
    id: "responder",
    tipo: "task",
    x: 1210,
    y: LANE_FACT,
    w: 170,
    h: 64,
    label: "Responder\ninformación",
    quien: "Facturación",
    permiso: "tickets.responder_info",
    detalle: "El facturador responde lo solicitado y el ticket vuelve a 'En proceso' con SYS HIGEA.",
  },
  {
    id: "reportar",
    tipo: "task",
    x: 980,
    y: LANE_HIGEA2,
    w: 180,
    h: 64,
    label: "Reportar\nrealizado",
    quien: "SYS HIGEA",
    permiso: "tickets.cerrar",
    detalle: "SYS HIGEA confirma que el registro fue eliminado o corregido, con una nota obligatoria que queda en el historial permanente.",
  },
  { id: "cerrado", tipo: "end", x: 1210, y: LANE_HIGEA2, label: "Cerrado" },
  {
    id: "reabierto",
    tipo: "task",
    x: 1380,
    y: LANE_HIGEA2,
    w: 160,
    h: 64,
    label: "Reabrir\n(excepción)",
    quien: "Supervisora",
    permiso: "tickets.reabrir",
    detalle: "Si aparece un error después de cerrado, la supervisora puede reabrir el ticket; vuelve a 'En proceso' con SYS HIGEA.",
  },
].map((n) => ({ ...n, x: n.x + GUTTER }));

function nodo(id) {
  return NODOS.find((n) => n.id === id);
}

// Cada conexión trae su ruta ya calculada a mano (punto de salida exacto del
// nodo origen -> quiebres intermedios -> punto de entrada exacto del nodo
// destino), para que las flechas lleguen siempre al borde correcto en vez de
// inferirse genéricamente.
const CONEXIONES = [
  { de: "inicio", a: "radicar", puntos: [[78 + GUTTER, LANE_FACT], [150 + GUTTER, LANE_FACT]] },
  { de: "radicar", a: "revisar", puntos: [[260 + GUTTER, LANE_FACT + 32], [260 + GUTTER, LANE_SUP - 32]] },
  { de: "revisar", a: "gw_aprueba", puntos: [[310 + GUTTER, LANE_SUP], [435 + GUTTER, LANE_SUP]] },
  { de: "gw_aprueba", a: "corregir", puntos: [[480 + GUTTER, LANE_SUP - 42], [480 + GUTTER, LANE_FACT + 32]], etiqueta: "No" },
  {
    de: "corregir",
    a: "revisar",
    puntos: [
      [480 + GUTTER, LANE_FACT - 32],
      [480 + GUTTER, LANE_FACT - 60],
      [200 + GUTTER, LANE_FACT - 60],
      [200 + GUTTER, LANE_SUP - 32],
    ],
    etiqueta: "reenvía",
    excepcion: true,
  },
  {
    de: "gw_aprueba",
    a: "tomar",
    puntos: [
      [525 + GUTTER, LANE_SUP],
      [640 + GUTTER, LANE_SUP],
      [640 + GUTTER, LANE_HIGEA],
    ],
    etiqueta: "Sí",
  },
  { de: "tomar", a: "gw_info", puntos: [[820 + GUTTER, LANE_HIGEA], [935 + GUTTER, LANE_HIGEA]] },
  { de: "gw_info", a: "pedir_info", puntos: [[1025 + GUTTER, LANE_HIGEA], [1125 + GUTTER, LANE_HIGEA]], etiqueta: "Sí" },
  { de: "pedir_info", a: "responder", puntos: [[1210 + GUTTER, LANE_HIGEA - 32], [1210 + GUTTER, LANE_FACT + 32]] },
  {
    de: "responder",
    a: "tomar",
    puntos: [
      [1295 + GUTTER, LANE_FACT],
      [1520 + GUTTER, LANE_FACT],
      [1520 + GUTTER, LANE_HIGEA - 32],
      [680 + GUTTER, LANE_HIGEA - 32],
    ],
    etiqueta: "vuelve a gestión",
    excepcion: true,
  },
  { de: "gw_info", a: "reportar", puntos: [[980 + GUTTER, LANE_HIGEA + 42], [980 + GUTTER, LANE_HIGEA2 - 32]], etiqueta: "No" },
  { de: "reportar", a: "cerrado", puntos: [[1070 + GUTTER, LANE_HIGEA2], [1192 + GUTTER, LANE_HIGEA2]] },
  { de: "cerrado", a: "reabierto", puntos: [[1228 + GUTTER, LANE_HIGEA2], [1300 + GUTTER, LANE_HIGEA2]], etiqueta: "si es necesario", excepcion: true },
  {
    de: "reabierto",
    a: "tomar",
    puntos: [
      [1380 + GUTTER, LANE_HIGEA2 + 32],
      [1380 + GUTTER, LANE_HIGEA2 + 70],
      [730 + GUTTER, LANE_HIGEA2 + 70],
      [730 + GUTTER, LANE_HIGEA + 32],
    ],
    etiqueta: "vuelve a gestión",
    etiquetaPos: [1000 + GUTTER, LANE_HIGEA2 + 85],
    excepcion: true,
  },
];

function Flecha({ puntos, excepcion, seleccionado }) {
  const d = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  return (
    <path
      d={d}
      fill="none"
      stroke="var(--color-ink)"
      strokeWidth={seleccionado ? 2.5 : 1.5}
      strokeDasharray={excepcion ? "5 4" : undefined}
      markerEnd="url(#flecha)"
      opacity={seleccionado ? 1 : excepcion ? 0.55 : 0.8}
    />
  );
}

function Nodo({ n, activo, onClick }) {
  const relleno = activo ? "var(--color-accent)" : "var(--color-surface)";
  const borde = activo ? "var(--color-ink)" : "var(--color-border)";
  const lineas = n.label.split("\n");

  if (n.tipo === "start" || n.tipo === "end") {
    return (
      <g onClick={() => onClick(n)} className="cursor-pointer">
        <circle cx={n.x} cy={n.y} r={18} fill={relleno} stroke={borde} strokeWidth={n.tipo === "end" ? 3 : 1.5} />
        <text x={n.x} y={n.y + 34} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-muted)">
          {n.label}
        </text>
      </g>
    );
  }
  if (n.tipo === "gateway") {
    const s = 30;
    return (
      <g onClick={() => onClick(n)} className="cursor-pointer">
        <rect x={n.x - s} y={n.y - s} width={s * 2} height={s * 2} fill={relleno} stroke={borde} strokeWidth={1.5} transform={`rotate(45 ${n.x} ${n.y})`} rx={4} />
        {lineas.map((l, i) => (
          <text key={i} x={n.x} y={n.y - (lineas.length - 1) * 6 + i * 12 + 4} textAnchor="middle" fontSize="10" fontWeight={600} fill="var(--color-ink)">
            {l}
          </text>
        ))}
      </g>
    );
  }
  return (
    <g onClick={() => onClick(n)} className="cursor-pointer">
      <rect x={n.x - n.w / 2} y={n.y - n.h / 2} width={n.w} height={n.h} rx={10} fill={relleno} stroke={borde} strokeWidth={activo ? 2 : 1.5} />
      {lineas.map((l, i) => (
        <text key={i} x={n.x} y={n.y - (lineas.length - 1) * 7 + i * 14 + 4} textAnchor="middle" fontSize="11" fontWeight={600} fill="var(--color-ink)">
          {l}
        </text>
      ))}
    </g>
  );
}

export function DiagramaFlujo() {
  const [seleccionado, setSeleccionado] = useState(null);

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
        <svg viewBox={`0 0 ${1620 + GUTTER} 720`} className="h-auto w-full min-w-[1200px]">
          <defs>
            <marker id="flecha" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--color-ink)" />
            </marker>
          </defs>

          {[
            { y: LANE_FACT, label: "Facturación" },
            { y: LANE_SUP, label: "Supervisora" },
            { y: (LANE_HIGEA + LANE_HIGEA2) / 2, label: "SYS HIGEA" },
          ].map((l) => (
            <text key={l.label} x={16} y={l.y + 4} fontSize="12" fontWeight={700} fill="var(--color-muted)">
              {l.label.toUpperCase()}
            </text>
          ))}
          <line x1={0} y1={180} x2={1620 + GUTTER} y2={180} stroke="var(--color-border)" strokeDasharray="2 4" />
          <line x1={0} y1={370} x2={1620 + GUTTER} y2={370} stroke="var(--color-border)" strokeDasharray="2 4" />
          <line x1={GUTTER - 20} y1={0} x2={GUTTER - 20} y2={720} stroke="var(--color-border)" />

          {CONEXIONES.map((c, i) => {
            const activo = seleccionado && (seleccionado === c.de || seleccionado === c.a);
            return (
              <g key={i}>
                <Flecha puntos={c.puntos} excepcion={c.excepcion} seleccionado={activo} />
                {c.etiqueta &&
                  (() => {
                    const [lx, ly] = c.etiquetaPos || [c.puntos[0][0] + 10, c.puntos[0][1] - 10];
                    return (
                      <text x={lx} y={ly} fontSize="10" fontStyle="italic" fill="var(--color-muted)">
                        {c.etiqueta}
                      </text>
                    );
                  })()}
              </g>
            );
          })}

          {NODOS.map((n) => (
            <Nodo key={n.id} n={n} activo={seleccionado === n.id} onClick={(nn) => setSeleccionado(seleccionado === nn.id ? null : nn.id)} />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-muted)]">
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" /></svg>
          Inicio / fin
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="12"><rect x="1" y="1" width="14" height="10" rx="3" fill="none" stroke="currentColor" /></svg>
          Tarea
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="14" height="14"><rect x="2" y="2" width="10" height="10" fill="none" stroke="currentColor" transform="rotate(45 7 7)" /></svg>
          Decisión
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="4"><line x1="0" y1="2" x2="20" y2="2" stroke="currentColor" strokeDasharray="4 3" /></svg>
          Excepción
        </span>
        <span>Haz clic en cualquier paso para ver el detalle.</span>
      </div>

      {seleccionado && (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-ink)] bg-[var(--color-canvas)] p-4">
          {(() => {
            const n = nodo(seleccionado);
            return (
              <div className="grid gap-1.5">
                <p className="font-semibold">{n.label.replace("\n", " ")}</p>
                {n.quien && (
                  <p className="text-sm">
                    <span className="font-medium">Quién:</span> {n.quien}
                  </p>
                )}
                {n.permiso && (
                  <p className="text-sm">
                    <span className="font-medium">Permiso requerido:</span> {n.permiso}
                  </p>
                )}
                {n.detalle && <p className="text-sm text-[var(--color-muted)]">{n.detalle}</p>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
