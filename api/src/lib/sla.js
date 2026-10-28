import { supabase } from "../config/supabase.js";

/** Suma `n` días hábiles colombianos (sin sábados/domingos/festivos) a partir de `desde`. */
export async function vencimiento(desde, dias) {
  const festivos = await festivosComo(new Set());
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

async function festivosComo() {
  const { data, error } = await supabase.from("festivos_colombia").select("fecha");
  if (error) throw error;
  return new Set((data || []).map((f) => f.fecha));
}

/**
 * Calcula el estado de SLA de un ticket ya aprobado.
 * `requiere_info` pausa el reloj: el tiempo transcurrido en esa fase se resta
 * de la fecha límite en vez de dejar que el vencimiento corra durante la espera.
 */
export async function calcularSla(ticket, eventos, diasHabiles) {
  if (!ticket.aprobado_at) return { dueAt: null, vencido: false };

  const pausas = segundosEnRequiereInfo(eventos);
  const fechaLimite = new Date(await vencimiento(ticket.aprobado_at, diasHabiles));
  fechaLimite.setUTCSeconds(fechaLimite.getUTCSeconds() + pausas);

  const activo = ["aprobado", "en_proceso"].includes(ticket.estado);
  const vencido = activo && new Date() > fechaLimite;
  return { dueAt: fechaLimite.toISOString(), vencido };
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
