import { supabase } from "../config/supabase.js";
import { correosConPermiso, enviarCorreo } from "./correo.js";

export const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB, plan gratuito de Supabase
const UMBRAL_ALERTA = 0.75;
const UMBRAL_RESET = 0.7; // histéresis: evita reenviar el aviso cada día al quedar justo en el borde del 75%
const CLAVE_FLAG_ALERTA = "alerta_almacenamiento_75_enviada";

export async function medirStorage() {
  let bytes = 0;
  let archivos = 0;
  const { data: carpetas, error: listError } = await supabase.storage.from("adjuntos").list("", { limit: 1000 });
  if (listError) throw new Error(`listando Storage: ${listError.message}`);
  for (const carpeta of carpetas || []) {
    const { data: archivosCarpeta, error: carpetaError } = await supabase.storage
      .from("adjuntos")
      .list(carpeta.name, { limit: 1000 });
    if (carpetaError) throw new Error(`listando Storage/${carpeta.name}: ${carpetaError.message}`);
    for (const archivo of archivosCarpeta || []) {
      bytes += archivo.metadata?.size || 0;
      archivos++;
    }
  }
  return { bytes, archivos, limite: LIMITE_STORAGE_BYTES };
}

async function leerFlagAlerta() {
  const { data, error } = await supabase.from("config_sistema").select("valor").eq("clave", CLAVE_FLAG_ALERTA).maybeSingle();
  if (error) throw new Error(`leyendo ${CLAVE_FLAG_ALERTA}: ${error.message}`);
  return data?.valor === "true";
}

async function escribirFlagAlerta(valor) {
  const { error } = await supabase.from("config_sistema").update({ valor: String(valor) }).eq("clave", CLAVE_FLAG_ALERTA);
  if (error) throw new Error(`actualizando ${CLAVE_FLAG_ALERTA}: ${error.message}`);
}

// Revisa el uso de Storage y, si cruza el 75%, avisa por correo a quienes
// pueden administrar el sistema (permiso config.editar) — una sola vez por
// cruce, no en cada ejecución del cron. Si el uso vuelve a bajar del 70%
// (p. ej. tras la limpieza de adjuntos), se rearma para poder avisar de nuevo
// si vuelve a subir.
export async function verificarAlertaAlmacenamiento() {
  const { bytes, limite } = await medirStorage();
  const pct = bytes / limite;
  const yaAvisado = await leerFlagAlerta();

  if (pct >= UMBRAL_ALERTA && !yaAvisado) {
    const destinatarios = await correosConPermiso("config.editar");
    await enviarCorreo(
      destinatarios,
      `[Mesa de ayuda] Almacenamiento al ${(pct * 100).toFixed(0)}%`,
      `El almacenamiento de archivos adjuntos llegó al ${(pct * 100).toFixed(1)}% del límite del plan gratuito de Supabase (1 GB).\n\n` +
        `Ingrese a Administración → Almacenamiento para revisar el detalle, o ejecute la limpieza manual si hay tickets cerrados pendientes de archivar.`,
    );
    await escribirFlagAlerta(true);
    return { alertaEnviada: true, pct };
  }
  if (pct < UMBRAL_RESET && yaAvisado) {
    await escribirFlagAlerta(false);
    return { alertaEnviada: false, rearmado: true, pct };
  }
  return { alertaEnviada: false, pct };
}
