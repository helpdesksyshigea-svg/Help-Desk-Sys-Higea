import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { TicketForm } from "../components/TicketForm";

export function NewTicket() {
  const navigate = useNavigate();

  async function crear(form) {
    const ticket = await apiFetch("/tickets", { method: "POST", body: form });
    navigate(`/tickets/${ticket.id}`);
  }

  return (
    <div className="grid gap-6">
      <h2 className="text-xl font-light">Nuevo ticket para SYS HIGEA</h2>
      <p className="-mt-4 text-sm text-[var(--color-muted)]">
        Al radicar, el ticket pasa a aprobación de la supervisora antes de llegar a SYS HIGEA.
      </p>
      <TicketForm modo="crear" onSubmit={crear} submitLabel="Radicar ticket" />
    </div>
  );
}
