import { useParams } from "react-router-dom";
import { Card } from "../components/Card";

export function TicketDetail() {
  const { id } = useParams();
  return (
    <Card className="text-[var(--color-muted)]">
      Detalle del tiquete {id}. Pendiente de implementar junto con los endpoints de
      transición de estado (Fase 1 del backend).
    </Card>
  );
}
