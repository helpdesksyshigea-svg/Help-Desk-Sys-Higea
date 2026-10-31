// Borrador de "Nuevo ticket", guardado en el navegador (localStorage) para
// que no se pierda lo escrito si alguien navega fuera del formulario o cierra
// la pestaña sin radicar. Solo vive en el navegador de cada persona — no se
// sincroniza entre dispositivos ni cuenta como un ticket real en el backend.
// El archivo del oficio (File) nunca se guarda aquí: no es serializable y de
// todas formas conviene volver a adjuntarlo al retomar el borrador.
const PREFIJO = "higea.borrador-ticket.";

function clave(userId) {
  return `${PREFIJO}${userId}`;
}

export function leerBorrador(userId) {
  if (!userId) return null;
  try {
    const crudo = localStorage.getItem(clave(userId));
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    // Un borrador sin nada útil (nunca se tocó el formulario) no cuenta.
    const tieneContenido =
      datos.firmante?.trim() ||
      datos.observacion?.trim() ||
      datos.items?.some((it) => Object.values(it).some((v) => v?.toString().trim()));
    return tieneContenido ? datos : null;
  } catch {
    return null;
  }
}

export function guardarBorrador(userId, datos) {
  if (!userId) return;
  try {
    localStorage.setItem(clave(userId), JSON.stringify({ ...datos, guardadoEn: new Date().toISOString() }));
  } catch {
    // localStorage puede fallar (ventana privada, cuota llena) — perder el
    // autoguardado no debe romper el formulario.
  }
}

export function borrarBorrador(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(clave(userId));
  } catch {
    // ver guardarBorrador
  }
}
