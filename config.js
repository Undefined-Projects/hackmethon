/* ============================================================
   HACK(ME)THON 2.0 — configuración
   ────────────────────────────────────────────────────────────
   ⚠  ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE EDITAR.
   Lo cargan tanto la portada como el panel de participantes,
   así que un cambio aquí sirve para las dos.
   ============================================================ */

const EVENTO = {
  // Fecha y hora de inicio, formato ISO. Chihuahua capital es UTC-6 todo el año
  // desde que México quitó el horario de verano en 2022 (Ciudad Juárez y los
  // municipios fronterizos sí siguen cambiando: ahí sería -07:00 en invierno).
  //
  // ⚠ PENDIENTE: vacío mientras no haya fecha. El monitor dice
  //   "SIN PROGRAMAR" en vez de la cuenta en latidos.
  //   Ejemplo: "2026-11-23T18:00:00-06:00"
  inicio:    "",

  // ⚠ PENDIENTE: todo por definir. Se escriben aquí y la página se
  //   actualiza sola en los dos lugares donde aparece cada dato.
  //   Ejemplos: "Lunes 23 de noviembre, 2026" · "4 horas · 18:00 a 22:00" ·
  //   "Auditorio MENLO · Parque Orión"
  fecha:     "Próximamente",
  duracion:  "Por definir",
  sede:      "Por definir",

  // Sin límite de equipos y sin costo. Si algún día se pone un tope, va
  // aquí el texto (p. ej. "10 equipos · 30 integrantes") y el número en el
  // panel; con un tope, la portada agrega sola "· quedan N".
  cupo:      "Sin límite",
  costo:     "Gratuito · sin costo alguno",

  // Ubicación de la sede. Con `mapa` vacío, el botón ABRIR EN MAPAS no sale.
  // Ejemplo (la de la 1ª edición, Auditorio MENLO):
  //   coordenadas: "28.674655, -106.080233",
  //   mapa: "https://www.google.com/maps/search/?api=1&query=28.674654589507416,-106.08023320217369",
  coordenadas: "Por definir",
  mapa:        "",

  // Modo "próximamente" cuando el servidor no contesta (vista previa sin
  // API, servidor caído). El que manda de verdad es el del panel; esto es
  // solo el respaldo. true = solo la primera pantalla.
  proximamente: true,

  // El premio del minijuego BYPASS. Se muestra bajo la tabla de pulsos.
  // La fecha de cierre del torneo NO va aquí: la manda el servidor
  // (variable TORNEO_CIERRE en Vercel), para que nadie la pueda mover.
  // Los lugares que pasan a la dinámica los manda el servidor (FINALISTAS
  // en servidor/lib/bypass.js); si cambias ese número, cambia este texto.
  premio: "Los 8 mejores puntajes al cierre del torneo concursarán en una dinámica el día del evento para ganar un premio adicional.",

  // Correo al que llegan las fichas del formulario del panel 06.
  registros: "contacto@undefinedclub.org",

  // Correo general del pie de página. Puede ser el mismo que registros.
  contacto:  "mailto:contacto@undefinedclub.org",

  // Integrantes por equipo cuando el servidor no contesta. El que manda
  // es el del panel de administración (1 a 6).
  integrantes: 3,

  // Aviso de privacidad (privacidad.html). ⚠ Que lo revise alguien con
  // conocimiento legal antes de abrir el registro, sobre todo el
  // responsable y el domicilio.
  privacidad: {
    responsable: "Startup Chihuahua y Undefined",
    domicilio:   "Chihuahua, Chihuahua, México",
    correo:      "contacto@undefinedclub.org",   // para ejercer derechos ARCO
    actualizado: "8 de octubre de 2026",
  },

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
  //
  // La 2.0 usa el mismo servidor que la 1ª: los equipos de la 1ª quedaron
  //   archivados en la tabla registros_1a_edicion al primer arranque.
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
