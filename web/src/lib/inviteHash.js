// Captura window.location.hash al evaluarse este módulo — lo más temprano
// posible en el ciclo de carga, antes de que se cree el cliente de Supabase.
// El cliente de Supabase limpia el hash de la URL (history.replaceState) tan
// pronto se construye, lo cual ocurre al importarse lib/supabase.js, mucho
// antes de que React monte el primer componente. Por eso este módulo debe
// importarse de primero en main.jsx, antes que App.jsx.
export const hashInicial = typeof window !== "undefined" ? window.location.hash : "";
