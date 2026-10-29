import { supabase } from "../config/supabase.js";

const BUCKET = "adjuntos";

async function diasRetencion() {
  const { data } = await supabase.from("config_sistema").select("valor").eq("clave", "dias_retencion_cierre").single();
  return Number(data?.valor ?? 90);
}

/**
 * Archiva los tickets cerrados hace más de N días (configurable): borra sus
 * archivos adjuntos del Storage (lo pesado) y marca archivado_at, pero el
 * ticket, sus registros y su historial completo quedan para siempre, solo de
 * consulta. No se borra ningún ticket — decisión explícita del usuario, en
 * lugar del borrado total sin respaldo que tenía antes.
 */
export async function limpiarTicketsAntiguos() {
  const dias = await diasRetencion();
  const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const { data: elegibles, error } = await supabase
    .from("tickets")
    .select("id, code")
    .eq("estado", "cerrado")
    .lt("cerrado_at", limite)
    .is("archivado_at", null);
  if (error) throw error;

  const resultado = { evaluados: elegibles.length, archivados: [], errores: [] };

  for (const ticket of elegibles) {
    try {
      const { data: adjuntos } = await supabase.from("ticket_adjuntos").select("id, storage_path").eq("ticket_id", ticket.id);
      const rutas = (adjuntos || []).map((a) => a.storage_path);
      if (rutas.length) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(rutas);
        if (storageError) throw storageError;
      }

      const { error: delError } = await supabase.from("ticket_adjuntos").delete().eq("ticket_id", ticket.id);
      if (delError) throw delError;

      const { error: updError } = await supabase.from("tickets").update({ archivado_at: new Date().toISOString() }).eq("id", ticket.id);
      if (updError) throw updError;

      resultado.archivados.push(ticket.code);
    } catch (e) {
      resultado.errores.push({ code: ticket.code, error: e.message });
    }
  }

  return resultado;
}
