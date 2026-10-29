import { Card } from "../components/Card";

const FAQ = [
  {
    q: "No veo el botón para aprobar o cerrar un ticket.",
    a: "Revise que el ticket esté en el estado que le corresponde actuar y que su rol tenga el permiso. Si el ticket está esperando la acción de otra persona, la aplicación se lo indica en vez de mostrar botones. Si cree que debería poder actuar, pídale al administrador que revise sus permisos en Roles.",
  },
  {
    q: "Radiqué un ticket con un dato mal escrito.",
    a: "Mientras el ticket esté en Pendiente o Devuelto, ábralo y pulse \"Corregir ticket\". Al guardar, vuelve a quedar pendiente de aprobación.",
  },
  {
    q: "Un ticket aparece como vencido pero SYS HIGEA ya respondió.",
    a: "El ticket deja de estar vencido solo cuando cambia de estado (por ejemplo, al cerrarse). Mientras siga en \"Enviado a SYS HIGEA\" o \"En gestión SYS HIGEA\" después de su fecha límite, se marca vencido.",
  },
  {
    q: "Olvidé mi contraseña o no puedo ingresar.",
    a: "Contacte al administrador del sistema; él gestiona las cuentas desde el panel de Usuarios.",
  },
  {
    q: "Tengo una duda sobre un caso específico.",
    a: "Use el campo de nota en el detalle del ticket para dejar constancia; todo el historial queda visible a quien tenga acceso al ticket.",
  },
  {
    q: "¿Por qué SYS HIGEA no ve mi ticket recién radicado?",
    a: "Un ticket solo cuenta como aprobado cuando la supervisora lo aprueba expresamente. Mientras eso no pase, SYS HIGEA no lo ve, aunque figure en su propia bandeja.",
  },
  {
    q: "¿Por qué el oficio es obligatorio para radicar?",
    a: "El oficio firmado respalda la solicitud ante el proveedor externo. Sin él, el sistema no permite crear el ticket ni aprobarlo.",
  },
];

export function Ayuda() {
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Preguntas frecuentes</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Dudas comunes sobre cómo usar la mesa de ayuda, según el manual de usuario.
        </p>
      </div>
      <div className="grid gap-3">
        {FAQ.map((item) => (
          <Card key={item.q} className="grid gap-1.5">
            <p className="font-medium">{item.q}</p>
            <p className="text-sm text-[var(--color-muted)]">{item.a}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
