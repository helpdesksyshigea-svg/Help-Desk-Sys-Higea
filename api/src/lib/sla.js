import { supabase } from "../config/supabase.js";

/** Trae el set de fechas festivas de Colombia. Se expone para que el llamador
 * (ej. el dashboard ejecutivo, que calcula SLA de muchos tickets a la vez)
 * la cargue una sola vez por request en vez de que cada ticket dispare su
 * propia consulta — ver `vencimiento`/`calcularSla` abajo. */
export async function festivosComo() {
  const { data, error } = await supabase.from("festivos_colombia").select("fecha");
  if (error) throw error;
  return new Set((data || []).map((f) => f.fecha));
}

/** Suma `n` días hábiles colombianos (sin sábados/domingos/festivos) a partir de
 * `desde`. `festivosPrecargados` es opcional: si no se pasa, se consulta la
 * tabla (comportamiento original, correcto para calcular un solo ticket). */
export async function vencimiento(desde, dias, festivosPrecargados) {
  const festivos = festivosPrecargados || (await festivosComo());
  const fecha = new Date(desde);
  let restantes = dias;
  while (restantes > 0) {
    fecha.setUTCDate(fecha.getUTCDate() + 1);
    const diaSemana = fecha.getUTCDay();
    const esFinde = diaSemana === 0 || diaSemana === 6;
    const esFestivo = festivos.has(fecha.toISOString().slice(0, 10));
    if (!esFinde && !esFestivo) restantes--;
  }
  return fecha.toISOString();
}

/** Fecha límite de un ticket ya aprobado, sin importar su estado actual (sirve
 * tanto para un ticket abierto como para evaluar, después del hecho, si un
 * ticket ya cerrado se cerró a tiempo). `requiere_info` pausa el reloj: el
 * tiempo transcurrido en esa fase se resta de la fecha límite. `null` si el
 * ticket nunca fue aprobado. */
export async function fechaLimiteDe(ticket, eventos, diasHabiles, festivosPrecargados) {
  if (!ticket.aprobado_at) return null;
  const pausas = segundosEnRequiereInfo(eventos);
  const fechaLimite = new Date(await vencimiento(ticket.aprobado_at, diasHabiles, festivosPrecargados));
  fechaLimite.setUTCSeconds(fechaLimite.getUTCSeconds() + pausas);
  return fechaLimite.toISOString();
}

/**
 * Calcula el estado de SLA de un ticket ya aprobado.
 * `festivosPrecargados` es opcional (ver `vencimiento`).
 */
export async function calcularSla(ticket, eventos, diasHabiles, festivosPrecargados) {
  const dueAt = await fechaLimiteDe(ticket, eventos, diasHabiles, festivosPrecargados);
  if (!dueAt) return { dueAt: null, vencido: false };

  const activo = ["aprobado", "en_proceso"].includes(ticket.estado);
  const vencido = activo && new Date() > new Date(dueAt);
  return { dueAt, vencido };
}

function segundosEnRequiereInfo(eventos) {
  let total = 0;
  let inicio = null;
  for (const ev of eventos) {
    if (ev.estado_nuevo === "requiere_info") inicio = new Date(ev.created_at);
    else if (inicio && ev.estado_anterior === "requiere_info") {
      total += (new Date(ev.created_at) - inicio) / 1000;
      inicio = null;
    }
  }
  return total;
}
