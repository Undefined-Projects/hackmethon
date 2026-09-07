/* ============================================================
   HACK(ME)THON — landing
   ────────────────────────────────────────────────────────────
   ⚠  TODO LO QUE HAY QUE EDITAR ESTÁ EN ESTE BLOQUE.
   Cambia estos valores y toda la página se actualiza sola.
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

  // ⚠ OBLIGATORIO EN PRODUCCIÓN. Dónde viven las funciones de Vercel.
  //
  // Esta portada se sirve desde GitHub Pages (undefinedclub.org/hackmethon)
  // y las funciones desde Vercel, así que hay que decirle dónde buscarlas.
  // Pega aquí la URL que te dé Vercel al desplegar, SIN barra final:
  //
  //     api: "https://hackmethon-servidor.vercel.app",
  //
  // Y en Vercel pon la variable ORIGENES_PERMITIDOS con el dominio de la
  // portada, o el navegador va a bloquear las peticiones por CORS.
  //
  // Si lo dejas vacío, la API se busca en el mismo sitio que la página.
  api: "https://hackmethon-servidor.vercel.app",
};

/* ============================================================
   De aquí para abajo no hace falta tocar nada.
   ============================================================ */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* — 1. Inyectar los datos del evento en la página — */
document.querySelectorAll("[data-cfg]").forEach(el => {
  const v = EVENTO[el.dataset.cfg];
  if (v) el.textContent = v;
});
document.querySelectorAll("[data-cfg-href]").forEach(el => {
  const v = EVENTO[el.dataset.cfgHref];
  if (!v || v === "#") return;                 // sin link todavía: se queda en el ancla
  el.href = v;
  if (/^https?:/.test(v)) { el.target = "_blank"; el.rel = "noopener"; }
});

/* — 2. Cuenta regresiva, formato DD:HH:MM:SS — */
(function countdown(){
  const box = document.getElementById("countdown");
  const out = { d: document.getElementById("cd-d"), h: document.getElementById("cd-h"),
                m: document.getElementById("cd-m"), s: document.getElementById("cd-s") };
  const target = new Date(EVENTO.inicio).getTime();
  if (!box || Number.isNaN(target)) return;

  const pad = (n, w = 2) => String(n).padStart(w, "0");

  function tick(){
    const left = target - Date.now();
    if (left <= 0){
      box.querySelector(".tminus__k").textContent = "EN CURSO";
      Object.values(out).forEach(el => el.textContent = "00");
      clearInterval(timer);
      return;
    }
    const s = Math.floor(left / 1000);
    out.d.textContent = pad(Math.floor(s / 86400), 3);
    out.h.textContent = pad(Math.floor(s / 3600) % 24);
    out.m.textContent = pad(Math.floor(s / 60) % 60);
    out.s.textContent = pad(s % 60);
  }
  tick();
  const timer = setInterval(tick, 1000);
})();

/* — 3. El panel se pinta renglón por renglón, como a 1200 baud — */
(function paint(){
  const filas = [...document.querySelectorAll(".opt, .role, .sched li, .readout > div, .faq details")];
  filas.forEach(el => el.classList.add("paint"));

  if (reducedMotion || !("IntersectionObserver" in window)){
    filas.forEach(el => el.classList.add("on"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("on");
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: .12 });
  filas.forEach(el => io.observe(el));

  // Red de seguridad: si el observador no dispara, a los 4 s se muestra todo.
  setTimeout(() => filas.forEach(el => el.classList.add("on")), 4000);
})();

/* — 4. Línea de comando: se teclea sola — */
(function typing(){
  const el = document.getElementById("typed");
  if (!el) return;
  const texto = "INFILTRAR";
  if (reducedMotion){ el.textContent = texto; return; }

  let i = 0;
  const timer = setInterval(() => {
    el.textContent = texto.slice(0, ++i);
    if (i >= texto.length) clearInterval(timer);
  }, 95);
})();

/* — 5. Área de información del operador: la línea 24 del 3277.
       "X SYSTEM" bloquea el teclado mientras el host procesa; el
       indicador de posición sigue el scroll, como el cursor. — */
(function oia(){
  const sys   = document.getElementById("oia-sys");
  const panel = document.getElementById("oia-panel");
  const pos   = document.getElementById("oia-pos");
  if (!sys || !panel || !pos) return;

  setTimeout(() => { sys.textContent = ""; }, 1600);

  const secciones = [...document.querySelectorAll("main > section")].map(s => ({
    el: s,
    nombre: (s.querySelector(".panel__name")?.textContent || "ARRANQUE").trim(),
  }));

  let pendiente = false;
  function actualizar(){
    pendiente = false;
    const alto = document.documentElement.scrollHeight - window.innerHeight;
    const avance = alto > 0 ? Math.min(Math.max(window.scrollY / alto, 0), 1) : 0;
    const fila = 1 + Math.round(avance * 23);          // 24 renglones, como el modelo 2
    pos.textContent = `${String(fila).padStart(3, "0")}/024`;

    const medio = window.scrollY + window.innerHeight * 0.4;
    let actual = secciones[0];
    for (const s of secciones){
      if (s.el.offsetTop <= medio) actual = s;
    }
    if (panel.textContent !== actual.nombre) panel.textContent = actual.nombre;
  }

  window.addEventListener("scroll", () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(actualizar);
  }, { passive: true });
  window.addEventListener("resize", actualizar);
  actualizar();
})();

/* — 6. Alta de operadores: integrantes, emblema y envío —
       Sin backend a propósito. El envío abre el correo del organizador
       con la ficha ya escrita, y "COPIAR DATOS" deja lo mismo en el
       portapapeles por si prefieren pegarlo en WhatsApp. — */
(function alta(){
  const form = document.getElementById("alta");
  if (!form) return;

  const N          = 12;                                   // celdas por lado
  const INTEGRANTES = 3;                                   // uno por rol
  const FONDO      = "#0d0410";
  const TINTAS     = [null, "#ff2d95", "#a855f7", "#ffd9ee"];

  /* ---- integrantes ---- */
  const crew = document.getElementById("crew");
  for (let i = 1; i <= INTEGRANTES; i++){
    const fila = document.createElement("p");
    fila.className = "crew__row";
    fila.innerHTML = `
      <label class="crew__lead">
        <input type="radio" name="lider" value="${i}" ${i === 1 ? "checked" : ""}
               aria-label="Marcar al integrante ${i} como líder">
        <span>0${i}</span>
      </label>
      <input type="text" name="nombre${i}" maxlength="60" autocomplete="off"
             placeholder="NOMBRE COMPLETO" aria-label="Nombre del integrante ${i}">
      <input type="tel" name="tel${i}" maxlength="20" autocomplete="off"
             placeholder="614 000 0000" aria-label="Teléfono del integrante ${i}">`;
    crew.appendChild(fila);
  }

  /* ---- cuadrícula del emblema ---- */
  const grid   = document.getElementById("grid");
  const celdas = [];
  let lienzo   = new Array(N * N).fill(0);
  let tinta    = 1;
  let simetria = true;

  for (let i = 0; i < N * N; i++){
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.v = "0";
    b.dataset.i = String(i);
    b.setAttribute("aria-label", `Celda ${Math.floor(i / N) + 1}, ${(i % N) + 1}`);
    grid.appendChild(b);
    celdas.push(b);
  }

  function pinta(i, valor){
    const fila = Math.floor(i / N), col = i % N;
    const destinos = simetria ? [i, fila * N + (N - 1 - col)] : [i];
    for (const d of destinos){
      lienzo[d] = valor;
      celdas[d].dataset.v = String(valor);
    }
  }

  let pintando = false;
  grid.addEventListener("pointerdown", e => {
    const b = e.target.closest("button");
    if (!b) return;
    e.preventDefault();
    pintando = true;
    pinta(+b.dataset.i, tinta);
    dibujaPrevia();
  });
  grid.addEventListener("pointerover", e => {
    if (!pintando) return;
    const b = e.target.closest("button");
    if (b){ pinta(+b.dataset.i, tinta); dibujaPrevia(); }
  });
  window.addEventListener("pointerup", () => { pintando = false; });
  // teclado: Enter o Espacio sobre una celda la pinta
  grid.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b && !pintando){ pinta(+b.dataset.i, tinta); dibujaPrevia(); }
  });

  /* ---- paleta y acciones ---- */
  document.querySelectorAll(".sw").forEach(sw => {
    sw.addEventListener("click", () => {
      tinta = +sw.dataset.tinta;
      document.querySelectorAll(".sw").forEach(o =>
        o.setAttribute("aria-pressed", String(o === sw)));
    });
  });

  const bSim = document.getElementById("b-sim");
  bSim.addEventListener("click", () => {
    simetria = !simetria;
    bSim.setAttribute("aria-pressed", String(simetria));
    bSim.textContent = `SIMETRÍA: ${simetria ? "SÍ" : "NO"}`;
  });

  document.getElementById("b-clr").addEventListener("click", () => {
    lienzo = new Array(N * N).fill(0);
    celdas.forEach(c => { c.dataset.v = "0"; });
    dibujaPrevia();
  });

  document.getElementById("b-rnd").addEventListener("click", () => {
    // Solo la mitad izquierda y se espeja: un emblema simétrico
    // sale reconocible casi siempre, uno al azar puro no.
    lienzo = new Array(N * N).fill(0);
    for (let f = 0; f < N; f++){
      for (let c = 0; c < N / 2; c++){
        const r = Math.random();
        const v = r < 0.58 ? 0 : r < 0.82 ? 1 : r < 0.95 ? 2 : 3;
        lienzo[f * N + c] = v;
        lienzo[f * N + (N - 1 - c)] = v;
      }
    }
    celdas.forEach((c, i) => { c.dataset.v = String(lienzo[i]); });
    dibujaPrevia();
  });

  /* ---- vista previa ---- */
  const prev  = document.getElementById("prev");
  const pctx  = prev.getContext("2d");
  const pName = document.getElementById("prev-name");

  function dibujaEn(ctx, lado){
    const paso = lado / N;
    ctx.fillStyle = FONDO;
    ctx.fillRect(0, 0, lado, lado);
    for (let i = 0; i < N * N; i++){
      const v = lienzo[i];
      if (!v) continue;
      ctx.fillStyle = TINTAS[v];
      ctx.fillRect((i % N) * paso, Math.floor(i / N) * paso, Math.ceil(paso), Math.ceil(paso));
    }
  }
  function dibujaPrevia(){ dibujaEn(pctx, prev.width); }
  dibujaPrevia();

  const iEquipo = document.getElementById("f-equipo");
  iEquipo.addEventListener("input", () => {
    pName.textContent = iEquipo.value.trim().toUpperCase() || "SIN NOMBRE";
  });

  /* ---- PNG del emblema ---- */
  const bPng = document.getElementById("b-png");

  function componePng(){
    const lado = 480, alto = lado + 92;
    const c = document.createElement("canvas");
    c.width = lado; c.height = alto;
    const ctx = c.getContext("2d");
    ctx.fillStyle = FONDO;
    ctx.fillRect(0, 0, lado, alto);
    dibujaEn(ctx, lado);
    ctx.fillStyle = "#ffd9ee";
    ctx.font = "600 30px 'IBM Plex Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText((iEquipo.value.trim().toUpperCase() || "SIN NOMBRE").slice(0, 22), lado / 2, lado + 44);
    ctx.fillStyle = "#a86ab8";
    ctx.font = "400 16px 'IBM Plex Mono', monospace";
    ctx.fillText("HACK(ME)THON", lado / 2, lado + 74);
    return c;
  }
  const nombrePng = () =>
    "emblema-" + (iEquipo.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "equipo") + ".png";

  // En un hosting propio no existe window.claude y basta con <a download>.
  // Dentro del visor de Artifacts esa descarga está bloqueada, así que ahí
  // se usa la capacidad "downloads"; si no la conceden, se esconde el botón.
  const enVisor = typeof window.claude?.use === "function";
  let guardar = null;

  if (!enVisor){
    bPng.hidden = false;
    bPng.addEventListener("click", () => {
      const a = document.createElement("a");
      a.download = nombrePng();
      a.href = componePng().toDataURL("image/png");
      a.click();
    });
  } else {
    window.claude.use("downloads").then(d => {
      if (!d) return;                       // no concedida: el botón se queda oculto
      guardar = d;
      bPng.hidden = false;
    }).catch(() => {});
    bPng.addEventListener("click", () => {
      if (!guardar) return;
      componePng().toBlob(blob => {
        guardar.save({ filename: nombrePng(), data: blob })
          .catch(() => avisa("NO SE PUDO GUARDAR EL PNG.", true));
      }, "image/png");
    });
  }

  /* ---- ficha, validación y envío ---- */
  const msg = document.getElementById("msg");
  function avisa(texto, error){
    msg.textContent = texto ? (error ? ">>> " : "*** ") + texto : "";
    msg.className = "msg " + (texto ? (error ? "msg--err" : "msg--ok") : "");
  }

  const val = n => (form.elements[n]?.value || "").trim();

  function revisa(){
    [...form.querySelectorAll("input")].forEach(i => i.removeAttribute("aria-invalid"));
    if (!val("equipo")){
      form.elements.equipo.setAttribute("aria-invalid", "true");
      form.elements.equipo.focus();
      return "FALTA EL NOMBRE DEL EQUIPO.";
    }
    const correo = val("correo");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)){
      form.elements.correo.setAttribute("aria-invalid", "true");
      form.elements.correo.focus();
      return "EL CORREO DE CONTACTO NO ES VÁLIDO.";
    }
    // No se aceptan equipos incompletos: los tres nombres son obligatorios.
    for (let i = 1; i <= INTEGRANTES; i++){
      if (!val("nombre" + i)){
        form.elements["nombre" + i].setAttribute("aria-invalid", "true");
        form.elements["nombre" + i].focus();
        return `FALTA EL NOMBRE DEL INTEGRANTE 0${i}. EL EQUIPO DEBE IR COMPLETO.`;
      }
    }
    // Del teléfono basta el del líder: es a quien se le escribe.
    const lider = +(form.elements.lider.value || 1);
    if (!val("tel" + lider)){
      form.elements["tel" + lider].setAttribute("aria-invalid", "true");
      form.elements["tel" + lider].focus();
      return "FALTA EL TELÉFONO DEL LÍDER.";
    }
    return null;
  }

  function ficha(){
    const lider = +(form.elements.lider.value || 1);
    const filas = [];
    for (let i = 1; i <= INTEGRANTES; i++){
      const n = val("nombre" + i);
      const t = val("tel" + i) || "sin teléfono";
      filas.push(`  0${i} ${i === lider ? "[LÍDER]" : "       "} ${n} — ${t}`);
    }
    return [
      "REGISTRO HACK(ME)THON",
      "=====================",
      `EQUIPO ......... ${val("equipo")}`,
      `CORREO ......... ${val("correo")}`,
      "",
      "INTEGRANTES:",
      ...filas,
      "",
      `EMBLEMA (${N}x${N}, 0=apagado 1=magenta 2=violeta 3=brillo):`,
      lienzo.join(""),
      "",
      `EVENTO ......... ${EVENTO.fecha}, ${EVENTO.duracion}`,
      `SEDE ........... ${EVENTO.sede}`,
    ].join("\n");
  }

  /* El registro se manda al servidor. El correo queda solo como último
     recurso: si no hay API (vista previa del artifact, archivo abierto
     desde el disco, o el servidor caído) nadie se queda sin registrarse. */
  // Se calcula desde la carpeta de la página, así que la portada funciona
  // igual en la raíz del dominio que colgada de /hackmethon/.
  const API = EVENTO.api
    ? EVENTO.api.replace(/\/+$/, "") + "/api"
    : location.pathname.replace(/[^/]*$/, "") + "api";
  const boton = form.querySelector('button[type="submit"]');

  function paquete(){
    const lider = +(form.elements.lider.value || 1);
    const integrantes = [];
    for (let i = 1; i <= INTEGRANTES; i++){
      integrantes.push({ nombre: val("nombre" + i), telefono: val("tel" + i) });
    }
    return {
      equipo: val("equipo"), correo: val("correo"), lider, integrantes,
      emblema: lienzo.join(""), empresa: val("empresa"),
    };
  }

  function bloquea(){
    form.querySelectorAll("input, .grid button, #b-copy, #b-sim, #b-rnd, #b-clr, .sw")
        .forEach(el => { el.disabled = true; });
    boton.disabled = true;
    // El PNG se deja vivo: el emblema es suyo y se lo pueden llevar.
  }

  function abreCorreo(){
    const destino = (EVENTO.registros || EVENTO.contacto).replace(/^mailto:/, "");
    const asunto  = `Registro HACK(ME)THON — ${val("equipo")}`;
    window.location.href =
      `mailto:${destino}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(ficha())}`;
    avisa("EL SERVIDOR NO RESPONDE. SE ABRIÓ TU CORREO CON LA FICHA: MÁNDALA ASÍ.", true);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const error = revisa();
    if (error) return avisa(error, true);

    boton.disabled = true;
    form.dataset.estado = "enviando";
    msg.textContent = "... ENVIANDO REGISTRO";
    msg.className = "msg msg--espera";

    try {
      const r = await fetch(API + "/registro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(paquete()),
      });
      const datos = await r.json().catch(() => ({}));
      form.dataset.estado = "";

      if (r.ok){
        bloquea();
        avisa(`REGISTRO ACEPTADO. FOLIO ${datos.folio}. TE ESCRIBIMOS AL CORREO DEL EQUIPO.`, false);
        pintaCupo(datos.quedan);
        return;
      }
      // 400 y 409 traen un motivo concreto del servidor: se muestra tal cual.
      if (r.status === 400 || r.status === 409){
        avisa(datos.mensaje || "REGISTRO RECHAZADO.", true);
        if (datos.lleno) bloquea(); else boton.disabled = false;
        return;
      }
      throw new Error("HTTP " + r.status);

    } catch {
      form.dataset.estado = "";
      boton.disabled = false;
      abreCorreo();
    }
  });

  document.getElementById("b-copy").addEventListener("click", async () => {
    const error = revisa();
    if (error) return avisa(error, true);
    try {
      await navigator.clipboard.writeText(ficha());
      avisa("FICHA COPIADA AL PORTAPAPELES.", false);
    } catch {
      avisa("EL NAVEGADOR NO DEJÓ COPIAR. USA ENVIAR REGISTRO.", true);
    }
  });

  /* Lugares restantes. Si no hay API se queda callado: la portada
     funciona igual sin este dato. */
  const spanQuedan = document.getElementById("quedan");
  function pintaCupo(quedan){
    if (!spanQuedan || quedan == null) return;
    spanQuedan.textContent = quedan > 0 ? ` · quedan ${quedan}` : " · CUPO LLENO";
  }
  fetch(API + "/cupo")
    .then(r => {
      if (!r.ok && !EVENTO.api && location.hostname !== "localhost"){
        console.warn(
          "[HACK(ME)THON] No encuentro la API en " + API + ".\n" +
          "Si la portada está en GitHub Pages y las funciones en Vercel, " +
          "pon la URL del deploy en EVENTO.api dentro de script.js.");
      }
      return r.ok ? r.json() : null;
    })
    .then(d => {
      if (!d || d.quedan == null) return;
      pintaCupo(d.quedan);
      if (d.quedan === 0){
        bloquea();
        avisa(`CUPO LLENO: LOS ${d.cupo} EQUIPOS YA ESTÁN REGISTRADOS.`, true);
      }
    })
    .catch(() => {});
})();
