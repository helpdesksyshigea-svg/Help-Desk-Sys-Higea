import { supabase } from "../config/supabase.js";
import { correosConPermiso, enviarCorreo } from "./correo.js";

export const LIMITE_STORAGE_BYTES = 1024 * 1024 * 1024; // 1 GB, plan gratuito de Supabase
export const LIMITE_DB_BYTES = 500 * 1024 * 1024; // 500 MB, plan gratuito de Supabase
const UMBRAL_ALERTA = 0.75;
const UMBRAL_RESET = 0.7; // histéresis: evita reenviar el aviso cada día al quedar justo en el borde del 75%
const CLAVE_FLAG_ALERTA_STORAGE = "alerta_almacenamiento_75_enviada";
const CLAVE_FLAG_ALERTA_DB = "alerta_base_datos_75_enviada";

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

// Supabase no expone el tamaño de la base por la API REST; esta función SQL
// (migración 0010) sí puede, vía pg_database_size(). Si la migración aún no
// se corrió, la función no existe y esto lanza — se trata como "no disponible"
// en vez de tumbar la pantalla de almacenamiento.
export async function medirBaseDatos() {
  const { data, error } = await supabase.rpc("tamano_base_datos");
  if (error) throw new Error(`midiendo tamaño de la base de datos: ${error.message}`);
  return { bytes: Number(data), limite: LIMITE_DB_BYTES };
}

async function leerFlag(clave) {
  const { data, error } = await supabase.from("config_sistema").select("valor").eq("clave", clave).maybeSingle();
  if (error) throw new Error(`leyendo ${clave}: ${error.message}`);
  return data?.valor === "true";
}

async function escribirFlag(clave, valor) {
  const { error } = await supabase.from("config_sistema").update({ valor: String(valor) }).eq("clave", clave);
  if (error) throw new Error(`actualizando ${clave}: ${error.message}`);
}

async function verificarUmbral({ nombre, medir, claveFlag, asuntoCorreo, cuerpoCorreo }) {
  const { bytes, limite } = await medir();
  const pct = bytes / limite;
  const yaAvisado = await leerFlag(claveFlag);

  if (pct >= UMBRAL_ALERTA && !yaAvisado) {
    const destinatarios = await correosConPermiso("config.editar");
    await enviarCorreo(destinatarios, asuntoCorreo(pct), cuerpoCorreo(pct));
    await escribirFlag(claveFlag, true);
    return { nombre, alertaEnviada: true, pct };
  }
  if (pct < UMBRAL_RESET && yaAvisado) {
    await escribirFlag(claveFlag, false);
    return { nombre, alertaEnviada: false, rearmado: true, pct };
  }
  return { nombre, alertaEnviada: false, pct };
}

// Revisa el uso de Storage y de la base de datos y, si alguno cruza el 75%,
// avisa por correo a quienes pueden administrar el sistema (permiso
// config.editar) — una sola vez por cruce, no en cada ejecución del cron. Si
// el uso vuelve a bajar del 70% (p. ej. tras la limpieza de adjuntos o el
// archivado de tickets viejos), se rearma para poder avisar de nuevo si
// vuelve a subir.
export async function verificarAlertaAlmacenamiento() {
  const storage = await verificarUmbral({
    nombre: "storage",
    medir: medirStorage,
    claveFlag: CLAVE_FLAG_ALERTA_STORAGE,
    asuntoCorreo: (pct) => `[Mesa de ayuda] Almacenamiento de archivos al ${(pct * 100).toFixed(0)}%`,
    cuerpoCorreo: (pct) =>
      `El almacenamiento de archivos adjuntos llegó al ${(pct * 100).toFixed(1)}% del límite del plan gratuito de Supabase (1 GB).\n\n` +
      `Ingrese a Administración → Almacenamiento para revisar el detalle, o ejecute la limpieza manual si hay tickets cerrados pendientes de archivar.`,
  });

  // La medición de BD depende de una función SQL que requiere haber corrido la
  // migración 0010; si todavía no se corrió, se omite en vez de romper el cron.
  let baseDatos = null;
  try {
    baseDatos = await verificarUmbral({
      nombre: "baseDatos",
      medir: medirBaseDatos,
      claveFlag: CLAVE_FLAG_ALERTA_DB,
      asuntoCorreo: (pct) => `[Mesa de ayuda] Base de datos al ${(pct * 100).toFixed(0)}%`,
      cuerpoCorreo: (pct) =>
        `El uso de la base de datos llegó al ${(pct * 100).toFixed(1)}% del límite del plan gratuito de Supabase (500 MB).\n\n` +
        `Ingrese a Administración → Almacenamiento para revisar el detalle. A diferencia de los adjuntos, este espacio no se libera solo: considere acortar el plazo de retención o archivar tickets más antiguos.`,
    });
  } catch (e) {
    console.error("[almacenamiento] no se pudo medir la base de datos (¿falta correr la migración 0010?):", e.message);
  }

  return { storage, baseDatos };
}
