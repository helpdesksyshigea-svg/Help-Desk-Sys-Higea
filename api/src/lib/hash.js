import { createHash } from "crypto";

const CAMPOS_ITEM = ["factura", "paciente", "documento", "cups", "descripcion", "fecha", "motivo"];

/** Hash canónico de los items de un ticket: detecta cualquier cambio posterior a la aprobación. */
export function hashItems(items) {
  const canonico = items
    .map((item) => CAMPOS_ITEM.map((campo) => String(item[campo] ?? "")).join("|"))
    .sort()
    .join("\n");
  return createHash("sha256").update(canonico).digest("hex");
}
