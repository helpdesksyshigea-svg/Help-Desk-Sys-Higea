import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { TicketForm } from "../components/TicketForm";
import { Card } from "../components/Card";

export function EditTicket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/tickets/${id}`)
      .then(setTicket)
      .catch((e) => setError(e.message));
  }, [id]);

  async function guardar(form) {
    await apiFetch(`/tickets/${id}`, { method: "PATCH", body: form });
    navigate(`/tickets/${id}`);
  }

  if (error) return <Card className="text-[var(--color-danger)]">{error}</Card>;
  if (!ticket) return <p className="text-[var(--color-muted)]">Cargando…</p>;

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-light">Corregir ticket {ticket.code}</h2>
      <p className="-mt-4 text-sm text-[var(--color-muted)]">
        Al guardar, el ticket vuelve a quedar pendiente de aprobación.
      </p>
      <TicketForm modo="editar" inicial={ticket} onSubmit={guardar} submitLabel="Guardar y reenviar a aprobación" />
    </div>
  );
}
