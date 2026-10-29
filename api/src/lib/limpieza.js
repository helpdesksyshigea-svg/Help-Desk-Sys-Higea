import { supabase } from "../config/supabase.js";

const BUCKET = "adjuntos";

async function diasRetencion() {
  const { data, error } = await supabase.from("config_sistema").select("valor").eq("clave", "dias_retencion_cierre").maybeSingle();
  // Si la consulta falla no se puede caer al valor por defecto: con una retención
  // configurada mayor a 90 días se borrarían adjuntos antes de tiempo.
  if (error) throw new Error(`consultando dias_retencion_cierre: ${error.message}`);
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
      const { data: adjuntos, error: adjError } = await supabase.from("ticket_adjuntos").select("id, storage_path").eq("ticket_id", ticket.id);
      // Sin este chequeo, un fallo de lectura dejaba rutas = [] y se borraban las
      // filas y se archivaba el ticket, con los archivos huérfanos en Storage.
      if (adjError) throw adjError;
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
      console.error(`[limpieza] error archivando ticket ${ticket.code}:`, e.message);
      resultado.errores.push({ code: ticket.code, error: e.message });
    }
  }

  return resultado;
}
