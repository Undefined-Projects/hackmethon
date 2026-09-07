/* ============================================================
   HACK(ME)THON — configuración
   ────────────────────────────────────────────────────────────
   ⚠  ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE EDITAR.
   Lo cargan tanto la portada como el panel de participantes,
   así que un cambio aquí sirve para las dos.
   ============================================================ */

const EVENTO = {
  // Fecha y hora de inicio, formato ISO. Chihuahua capital es UTC-6 todo el año
  // desde que México quitó el horario de verano en 2022 (Ciudad Juárez y los
  // municipios fronterizos sí siguen cambiando: ahí sería -07:00 en invierno).
  inicio:    "2026-09-21T18:00:00-06:00",

  fecha:     "Lunes 21 de septiembre, 2026",
  duracion:  "4 horas · 18:00 a 22:00",
  sede:      "Auditorio MENLO · Parque Orión",
  cupo:      "10 equipos · 30 operadores",
  costo:     "Gratuito · sin costo alguno",

  coordenadas: "28.674655, -106.080233",
  mapa:        "https://www.google.com/maps/search/?api=1&query=28.674654589507416,-106.08023320217369",

  // Correo al que llegan las fichas del formulario del panel 06.
  registros: "contacto@undefinedclub.org",

  // Correo general del pie de página. Puede ser el mismo que registros.
  contacto:  "mailto:contacto@undefinedclub.org",

  // OPCIONAL. Déjalo en "#" para que los botones lleven al formulario de la
  // página. Si aquí pones un link externo (Google Forms, Luma), los botones
  // del encabezado y del arranque se van a ese link en vez de al formulario.
  registro:  "#",

  // Dónde viven las funciones de Vercel. Sin barra final.
  //
  // Esta portada se sirve desde GitHub Pages (undefinedclub.org/hackmethon)
  // y las funciones desde Vercel, así que hay que decirle dónde buscarlas.
  // En Vercel tiene que estar ORIGENES_PERMITIDOS con el dominio de esta
  // portada, o el navegador bloquea las peticiones por CORS.
  //
  // Vacío = buscar la API en el mismo sitio que la página.
  api: "https://hackmethon-servidor.vercel.app",
};

/* ------------------------------------------------------------
   De aquí para abajo no hace falta tocar nada.
   ------------------------------------------------------------ */

/* Dónde buscar las funciones. Si EVENTO.api está vacío se usan las de la
   misma carpeta que la página, así que esto funciona igual en la raíz de un
   dominio, colgado de /hackmethon, o apuntando a otro dominio. */
const API = EVENTO.api
  ? EVENTO.api.replace(/\/+$/, "") + "/api"
  : location.pathname.replace(/[^/]*$/, "") + "api";
