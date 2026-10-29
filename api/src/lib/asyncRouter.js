// Express 4 no captura promesas rechazadas en handlers async: el error queda
// como unhandledRejection y en Node >= 15 eso termina el proceso completo
// (todas las peticiones en curso de todos los usuarios). Este helper envuelve
// cada handler registrado en el router para que cualquier excepción —síncrona
// o asíncrona— llegue a next(err) y la responda el manejador global de
// server.js con JSON, sin tumbar el servidor.
const METODOS = ["use", "all", "get", "post", "put", "patch", "delete"];

function envolver(handler) {
  if (Array.isArray(handler)) return handler.map(envolver);
  // Los manejadores de error (4 argumentos) se dejan tal cual: Express los
  // identifica por su aridad.
  if (typeof handler !== "function" || handler.length === 4) return handler;
  return function handlerEnvuelto(req, res, next) {
    try {
      const resultado = handler(req, res, next);
      if (resultado && typeof resultado.then === "function") resultado.catch(next);
    } catch (e) {
      next(e);
    }
  };
}

export function conManejoAsync(router) {
  for (const metodo of METODOS) {
    const original = router[metodo].bind(router);
    router[metodo] = (...args) => original(...args.map(envolver));
  }
  return router;
}
