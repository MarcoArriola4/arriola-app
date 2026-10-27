// Se ejecuta al arrancar el servidor: toda la app usa la hora de la Ciudad de México.
export function register() {
  process.env.TZ = "America/Mexico_City";
}
