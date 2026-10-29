import { useState } from "react";
import { Card } from "../components/Card";
import { IconUser, IconShield, IconInbox, IconSend } from "../components/icons";

function Captura({ src, alt, caption }) {
  return (
    <figure className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
      <img src={src} alt={alt} className="w-full" loading="lazy" />
      {caption && <figcaption className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">{caption}</figcaption>}
    </figure>
  );
}

function Paso({ numero, titulo, children }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)]/10 text-xs font-semibold">
        {numero}
      </span>
      <div className="grid gap-1">
        <p className="font-medium">{titulo}</p>
        {children && <p className="text-sm text-[var(--color-muted)]">{children}</p>}
      </div>
    </div>
  );
}

const SECCIONES = [
  { k: "flujo", l: "Cómo funciona", icon: IconSend },
  { k: "facturador", l: "Facturación", icon: IconUser },
  { k: "supervisora", l: "Supervisora", icon: IconShield },
  { k: "higea", l: "SYS HIGEA", icon: IconInbox },
];

export function Manual() {
  const [seccion, setSeccion] = useState("flujo");

  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Manual de usuario</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Guía paso a paso de la Mesa de ayuda SYS HIGEA, con capturas reales del sistema.
        </p>
        <nav className="mt-4 flex flex-wrap gap-1 border-b border-[var(--color-border)] pb-0">
          {SECCIONES.map((s) => (
            <button
              key={s.k}
              onClick={() => setSeccion(s.k)}
              className={`flex items-center gap-2 rounded-t-[var(--radius-button)] border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                seccion === s.k
                  ? "border-[var(--color-ink)] text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <s.icon size={15} />
              {s.l}
            </button>
          ))}
        </nav>
      </div>

      {seccion === "flujo" && (
        <div className="grid gap-4">
          <Card className="grid gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              Ciclo de vida de un ticket
            </h3>
            <p className="text-sm text-[var(--color-muted)]">
              Todo ticket pasa por estos estados. Solo la persona indicada en cada flecha puede mover el ticket al
              siguiente paso — el sistema oculta los botones de acción a quien no le corresponde.
            </p>
            <Captura src="/manual/diagrama-flujo-ticket.jpg" alt="Diagrama del ciclo de vida de un ticket" />
          </Card>
          <Card className="grid gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              Reglas que siempre aplican
            </h3>
            <ul className="grid gap-1.5 text-sm text-[var(--color-muted)]">
              <li>• No se puede radicar un ticket sin adjuntar el oficio firmado.</li>
              <li>• SYS HIGEA nunca ve un ticket que no haya sido aprobado por la supervisora.</li>
              <li>• Cada registro (factura/paciente) requiere todos sus campos completos para poder enviarse.</li>
              <li>• El historial de cada ticket es permanente: ninguna nota o cambio de estado se puede borrar ni editar después.</li>
              <li>• Los tickets cerrados hace más de 3 meses (configurable por el administrador) se eliminan automáticamente.</li>
            </ul>
          </Card>
        </div>
      )}

      {seccion === "facturador" && (
        <div className="grid gap-4">
          <Card className="grid gap-3">
            <Paso numero="1" titulo="Inicie sesión con su correo institucional">
              La pantalla de ingreso pide correo y contraseña. Si no tiene cuenta, pídale al administrador que lo invite.
            </Paso>
            <Captura src="/manual/01-login.jpg" alt="Pantalla de inicio de sesión" />
          </Card>
          <Card className="grid gap-3">
            <Paso numero="2" titulo='Pulse "Nuevo ticket" desde la bandeja'>
              Verá sus propios tickets agrupados por filtro (Requiere su acción, Vencidos, Todos).
            </Paso>
            <Captura src="/manual/02-bandeja-facturador.jpg" alt="Bandeja del facturador" />
          </Card>
          <Card className="grid gap-3">
            <Paso numero="3" titulo="Complete el formulario">
              Indique tipo de solicitud, prioridad y quién firma el oficio. Por cada factura o resultado que deba
              eliminarse, agregue un registro con: factura, paciente, documento, CUPS/folio, fecha, motivo y
              descripción — los siete campos son obligatorios.
            </Paso>
            <Paso numero="4" titulo="Adjunte el oficio firmado">
              Es obligatorio (PDF, PNG, JPEG o WEBP). Sin él, el sistema no deja radicar el ticket.
            </Paso>
            <Captura src="/manual/03-nuevo-ticket.jpg" alt="Formulario de nuevo ticket" />
          </Card>
          <Card className="grid gap-3">
            <Paso numero="5" titulo="Siga el ticket desde su detalle">
              Mientras está "Pendiente de aprobación" puede corregirlo. Una vez aprobado, solo puede consultarlo o
              responder si SYS HIGEA pide información.
            </Paso>
            <Captura src="/manual/04-ticket-pendiente-facturador.jpg" alt="Detalle de ticket pendiente" />
          </Card>
        </div>
      )}

      {seccion === "supervisora" && (
        <div className="grid gap-4">
          <Card className="grid gap-3">
            <Paso numero="1" titulo="Revise los tickets pendientes de aprobación">
              Aparecen en el filtro "Requiere su acción". Cada uno trae el oficio firmado y todos los registros a
              eliminar listos para revisar.
            </Paso>
            <Captura src="/manual/05-bandeja-supervisora.jpg" alt="Bandeja de la supervisora" />
          </Card>
          <Card className="grid gap-3">
            <Paso numero="2" titulo="Apruebe o devuelva">
              Al aprobar, el ticket queda sellado con los registros tal como están en ese momento (si alguien los
              cambia después, hay que volver a aprobar antes de poder cerrarlo). Al devolver, debe escribir una nota
              explicando qué corregir — el facturador la verá en el historial.
            </Paso>
            <Captura src="/manual/06-detalle-pendiente-aprobacion.jpg" alt="Detalle de ticket esperando aprobación" />
          </Card>
          <Card className="grid gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              También puede
            </h3>
            <ul className="grid gap-1.5 text-sm text-[var(--color-muted)]">
              <li>• Radicar tickets directamente, igual que un facturador.</li>
              <li>• Reabrir un ticket cerrado si aparece un error posterior.</li>
              <li>• Exportar a Excel todos los tickets visibles desde el botón en la bandeja.</li>
            </ul>
          </Card>
        </div>
      )}

      {seccion === "higea" && (
        <div className="grid gap-4">
          <Card className="grid gap-3">
            <Paso numero="1" titulo="Solo ve tickets ya aprobados">
              Un ticket "Pendiente" o "Devuelto" no aparece en su bandeja ni se puede abrir directamente por enlace:
              es información interna del hospital hasta que la supervisora lo aprueba.
            </Paso>
            <Captura src="/manual/07-bandeja-higea.jpg" alt="Bandeja de SYS HIGEA" />
          </Card>
          <Card className="grid gap-3">
            <Paso numero="2" titulo='Tome el caso y gestiónelo'>
              Al tomar un ticket aprobado pasa a "En proceso". Desde ahí puede pedir información adicional (el
              facturador recibe la solicitud y debe responder antes de que el caso siga) o reportarlo como realizado
              para cerrarlo.
            </Paso>
            <Captura src="/manual/08-detalle-aprobado-higea.jpg" alt="Detalle de ticket aprobado visto por SYS HIGEA" />
          </Card>
          <Card className="grid gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.054em] text-[var(--color-muted)]">
              Importante
            </h3>
            <p className="text-sm text-[var(--color-muted)]">
              Al cerrar un ticket es obligatorio dejar una nota confirmando qué se eliminó o corrigió. Esa nota queda
              en el historial permanente del ticket.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
