import { Card } from "../components/Card";

export function Admin() {
  return (
    <Card className="text-[var(--color-muted)]">
      Panel de administración de usuarios y roles. Pendiente de implementar junto
      con los endpoints /admin/usuarios y /admin/roles (Fase 5 del backend).
    </Card>
  );
}
