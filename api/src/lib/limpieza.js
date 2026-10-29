import { supabase } from "../config/supabase.js";

const BUCKET = "adjuntos";

async function diasRetencion() {
  const { data } = await supabase.from("config_sistema").select("valor").eq("clave", "dias_retencion_cierre").single();
  return Number(data?.valor ?? 90);
}

/**
 * Borra permanentemente los tickets cerrados hace más de N días (configurable).
 * Sin respaldo: decisión explícita del administrador. Borra primero los archivos
 * en Storage (ticket_adjuntos no libera el espacio del bucket por sí solo) y
 * luego el ticket completo vía eliminar_ticket_permanente(), que es el único
 * camino autorizado para borrar su historial append-only.
 */
export async function limpiarTicketsAntiguos() {
  const dias = await diasRetencion();
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: elegibles, error } = await supabase
    .from("tickets")
    .select("id, code")
    .eq("estado", "cerrado")
    .lt("cerrado_at", limite);
  if (error) throw error;

  const resultado = { evaluados: elegibles.length, eliminados: [], errores: [] };

  for (const ticket of elegibles) {
    try {
      const { data: adjuntos } = await supabase.from("ticket_adjuntos").select("storage_path").eq("ticket_id", ticket.id);
      const rutas = (adjuntos || []).map((a) => a.storage_path);
      if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas);

      const { error: rpcError } = await supabase.rpc("eliminar_ticket_permanente", { p_ticket_id: ticket.id });
      if (rpcError) throw rpcError;

      resultado.eliminados.push(ticket.code);
    } catch (e) {
      resultado.errores.push({ code: ticket.code, error: e.message });
    }
  }

  return resultado;
}
