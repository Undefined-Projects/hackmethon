/* ============================================================
   HACK(ME)THON 2.0 — portada
   Los datos del evento viven en config.js, que se carga antes.
   ============================================================ */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* — 1. Inyectar los datos del evento en la página — */
document.querySelectorAll("[data-cfg]").forEach(el => {
  const v = EVENTO[el.dataset.cfg];
  if (v) el.textContent = v;
});
// Sin mapa todavía, el botón de "abrir en mapas" no tiene a dónde ir.
if (!EVENTO.mapa) document.querySelectorAll(".maplink").forEach(el => { el.hidden = true; });
document.querySelectorAll("[data-cfg-href]").forEach(el => {
  const v = EVENTO[el.dataset.cfgHref];
  if (!v || v === "#") return;                 // sin link todavía: se queda en el ancla
  el.href = v;
  if (/^https?:/.test(v)) { el.target = "_blank"; el.rel = "noopener"; }
});

/* — 1½. Lo que dice el servidor, y el modo "próximamente" —
       Una sola consulta al cargar: el cupo y si la portada está en modo
       "próximamente" (se activa desde el panel). En ese modo solo se ve
       la primera pantalla —título, monitor y minijuego—, se asoma el
       primer panel y le sigue un aviso de PRÓXIMAMENTE.

       Para que no se vea todo y luego desaparezca, un script en el
       <head> ya dejó puesto el último modo conocido (guardado en este
       navegador) y esconde lo que va debajo de la primera pantalla hasta
       que el servidor conteste. Si no contesta en 3 s, manda el último
       modo conocido; sin ninguno, EVENTO.proximamente de config.js. */
const ESTADO = fetch(API + "/cupo")
  .then(r => {
    if (!r.ok && !EVENTO.api && location.hostname !== "localhost"){
      console.warn(
        "[HACK(ME)THON 2.0] No encuentro la API en " + API + ".\n" +
        "Si la portada está en GitHub Pages y las funciones en Vercel, " +
        "pon la URL del deploy en EVENTO.api dentro de config.js.");
    }
    return r.ok ? r.json() : null;
  })
  .catch(() => null);

(function modo(){
  const raiz = document.documentElement;
  const listo = proximo => {
    if (typeof proximo === "boolean"){
      raiz.classList.toggle("proximamente", proximo);
      try { localStorage.setItem("hmt2-modo", proximo ? "proximamente" : "abierto"); } catch {}
    } else {
      // el servidor no contestó: el último modo visto, o el de config.js
      let visto = null;
      try { visto = localStorage.getItem("hmt2-modo"); } catch {}
      raiz.classList.toggle("proximamente",
        visto ? visto === "proximamente" : EVENTO.proximamente !== false);
    }
    raiz.classList.remove("modo-pendiente");
    // Cambió lo que se ve: el jardín y el título se vuelven a medir.
    window.dispatchEvent(new Event("resize"));
  };
  Promise.race([ESTADO, new Promise(r => setTimeout(() => r(null), 3000))])
    .then(d => listo(d ? d.proximamente : null));
})();

/* — 2. El monitor de signos vitales —
       Trazo de ECG en barrido, como un monitor de quirófano: el punto
       avanza de izquierda a derecha y va borrando el trazo viejo por
       delante. De vez en cuando el gusano muta y el complejo sale
       deforme. Y si nadie atiende al paciente un rato, se empieza a ir:
       bradicardia primero, paro después, y con el paro se arma el
       dead man's switch. Basta mover el mouse para traerlo de vuelta. — */
const Monitor = (function monitor(){
  const box = document.getElementById("monitor");
  const cv  = document.getElementById("ecg");
  if (!box || !cv || !cv.getContext) return null;

  const ctx     = cv.getContext("2d");
  const fcEl    = document.getElementById("v-fc");
  const mutEl   = document.getElementById("v-mut");
  const nodEl   = document.getElementById("v-nod");
  const alarma  = document.getElementById("mon-alarm");
  const corazon = box.querySelector(".vital__heart");
  const oiaSys  = document.getElementById("oia-sys");

  const raiz   = getComputedStyle(document.documentElement);
  const tono   = (n, d) => raiz.getPropertyValue(n).trim() || d;
  const PHOS   = tono("--phos",   "#fa39ba");
  const AZUL   = tono("--blue-hi","#4f86ee");
  const SANGRE = tono("--sangre", "#ff3355");

  /* Cuánto aguanta sin que nadie lo atienda, en segundos. Solo corre
     mientras el monitor está a la vista: leer otro panel no lo mata. */
  const BRADI = 20, PARO = 35, MECHA = 10;

  /* El complejo P-QRS-T como suma de campanas: [centro, ancho, alto],
     con la fase del latido de 0 a 1. */
  const ONDA = [
    [.12, .024,  .12],   // P
    [.245,.007, -.14],   // Q
    [.27, .010,  1.0],   // R
    [.295,.010, -.28],   // S
    [.47, .045,  .30],   // T
  ];
  /* Latido mutado: el QRS se parte en dos y la T se invierte. */
  const MUTADA = [
    [.12, .024,  .10],
    [.25, .009,  .75],
    [.285,.008, -.55],
    [.32, .010,  .62],
    [.47, .05,  -.24],
  ];
  const campanas = (forma, f) => forma.reduce((y, [c, w, a]) =>
    y + a * Math.exp(-(((f - c) / w) ** 2) / 2), 0);

  let W = 0, H = 0, x = 0, yPrev = null;
  function medir(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    x = 0; yPrev = null;
  }

  let estado = "sinusal";
  let bpm = 72, meta = 72, amp = 1, ampMeta = 1;
  let fase = 0, mutado = false;
  let mutacion = 3.1, nodos = 4096;
  let ultimo = performance.now();   // última vez que alguien hizo algo
  let ocioso = 0;                    // segundos sin atención, con el monitor a la vista
  let visible = true;
  let mecha = MECHA, tMecha = 0, tVuelta = 0;
  const pulsoActual = () => estado === "paro" ? 0 : Math.round(bpm);

  const pad3 = n => String(n).padStart(3, "0");
  function pintaPulso(){
    const v = pulsoActual();
    fcEl.textContent = v;
    if (oiaSys) oiaSys.textContent = "♥ " + pad3(v);
  }

  function latido(){
    mutado = Math.random() < .12;
    if (mutado){
      mutacion = Math.min(9.9, mutacion + Math.random() * .6);
    } else {
      mutacion = Math.max(1.8, mutacion - Math.random() * .08);
    }
    nodos += Math.floor(Math.random() * (mutado ? 40 : 6));
    mutEl.textContent = mutacion.toFixed(1).padStart(4, "0");
    nodEl.textContent = nodos.toLocaleString("es-MX").replace(/,/g, " ");
    pintaPulso();
    if (corazon){
      corazon.classList.remove("late");
      void corazon.offsetWidth;          // reinicia la animación
      corazon.classList.add("late");
    }
    // El corazón del espécimen y las raíces laten con el monitor (jardin.js).
    document.dispatchEvent(new CustomEvent("latido", { detail: { mutado } }));
    // Un poco de variabilidad: un corazón que late a ritmo exacto es una máquina.
    if (estado === "sinusal") meta = 68 + Math.random() * 10;
  }

  function pon(nuevo){
    if (estado === nuevo) return;
    // El monitor solo suena en lo raro: el aviso, el pitido plano del
    // paro y el doble pitido al revivir (sonido.js; mudo si está apagado).
    const suena = n => window.Sonido?.toca(n);
    if (nuevo === "bradi") suena("alarma");
    if (nuevo === "paro") suena("plano");
    if (nuevo === "vuelta" && (estado === "paro" || estado === "bradi")) suena("vuelta");
    estado = nuevo;
    box.dataset.estado = nuevo;
    document.body.classList.toggle("paro", nuevo === "paro");
    if (nuevo === "sinusal"){ meta = 72;  ampMeta = 1;   alarma.textContent = "RITMO SINUSAL"; }
    if (nuevo === "bradi"){   meta = 36;  ampMeta = .7;  alarma.textContent = "■ BRADICARDIA · ¿SIGUES AHÍ?"; }
    if (nuevo === "paro"){    meta = 0;   ampMeta = 0;   mecha = MECHA; tMecha = 0;
                              alarma.textContent = `■ PARO · SWITCH ARMADO T−${mecha}`; pintaPulso(); }
    if (nuevo === "vuelta"){  meta = 112; ampMeta = 1.1; tVuelta = 0;
                              alarma.textContent = "RITMO RECUPERADO"; bpm = Math.max(bpm, 60); }
  }

  function atendido(){
    ultimo = performance.now();
    ocioso = 0;
    if (estado === "bradi" || estado === "paro") pon("vuelta");
  }
  ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"].forEach(ev =>
    window.addEventListener(ev, atendido, { passive: true }));
  document.querySelector(".tubo")?.addEventListener("scroll", atendido, { passive: true });

  if ("IntersectionObserver" in window){
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: .35 }).observe(box);
  }

  /* Con movimiento reducido: una tira quieta de cuatro latidos y nada más. */
  function tiraQuieta(){
    medir();
    ctx.strokeStyle = PHOS; ctx.lineWidth = 2; ctx.lineJoin = "round";
    ctx.beginPath();
    for (let px = 0; px <= W; px++){
      const f = (px / W * 4) % 1;
      const y = H * .58 - campanas(ONDA, f) * H * .38;
      px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
    }
    ctx.stroke();
  }
  if (reducedMotion){
    tiraQuieta();
    addEventListener("resize", tiraQuieta);
    return { pulso: pulsoActual };
  }

  medir();
  let rz = false;
  addEventListener("resize", () => {
    if (rz) return; rz = true;
    requestAnimationFrame(() => { rz = false; medir(); });
  });

  let antes = performance.now();
  function cuadro(ahora){
    const dt = Math.min((ahora - antes) / 1000, .1);
    antes = ahora;

    /* — el paciente — */
    if (visible && document.visibilityState === "visible") ocioso += dt;
    if (estado === "sinusal" && ocioso > BRADI) pon("bradi");
    if (estado === "bradi"   && ocioso > PARO)  pon("paro");
    if (estado === "paro" && mecha > 0){
      tMecha += dt;
      if (tMecha >= 1){
        tMecha -= 1; mecha--;
        alarma.textContent = mecha > 0
          ? `■ PARO · SWITCH ARMADO T−${mecha}`
          : "■ REFLEJO POST-MORTEM · EJECUTANDO";
      }
    }
    if (estado === "vuelta"){
      tVuelta += dt;
      if (tVuelta > 4) pon("sinusal");
      if (tVuelta > 1.2) meta = 72;
    }
    bpm += (meta - bpm) * Math.min(1, dt * .9);
    amp += (ampMeta - amp) * Math.min(1, dt * 1.5);

    /* — el trazo —
       Todo lo que avanza en un cuadro va en un solo trazo, pintado dos
       veces: uno ancho y tenue que hace de brillo y uno fino encima.
       Sale igual que shadowBlur y cuesta una fracción. */
    const rapidez = Math.max(W / 4, 90);           // la pantalla entera en ~4 s
    const pasos   = Math.max(1, Math.ceil(rapidez * dt));
    const color   = estado === "paro" ? SANGRE : (mutado ? AZUL : PHOS);
    let trazo = [];
    const pinta = () => {
      if (trazo.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(trazo[0][0], trazo[0][1]);
      for (let k = 1; k < trazo.length; k++) ctx.lineTo(trazo[k][0], trazo[k][1]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = .22; ctx.lineWidth = 6; ctx.stroke();
      ctx.globalAlpha = 1;   ctx.lineWidth = 2; ctx.stroke();
    };
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (yPrev !== null) trazo.push([x, yPrev]);

    for (let i = 0; i < pasos; i++){
      const avance = dt / pasos;
      if (bpm > 1){
        fase += avance * bpm / 60;
        if (fase >= 1){ fase -= 1; if (estado !== "paro") latido(); }
      }
      const forma = mutado ? MUTADA : ONDA;
      const ruido = (Math.random() - .5) * (estado === "paro" ? .03 : .012);
      const y = H * .58 - (campanas(forma, fase) * amp + ruido) * H * .38;
      x += rapidez * avance; yPrev = y;
      trazo.push([x, y]);
      if (x > W){
        ctx.clearRect(trazo[0][0], 0, x - trazo[0][0] + 16, H);
        pinta();
        x = 0; yPrev = null; trazo = [];
        ctx.clearRect(0, 0, 16, H);
      }
    }
    // Borra un hueco por delante del punto, como el barrido de un monitor.
    if (trazo.length) ctx.clearRect(trazo[0][0] + 1, 0, x - trazo[0][0] + 16, H);
    pinta();

    if (enPantalla || estado === "paro") requestAnimationFrame(cuadro);
    else dormido = true;
  }
  let dormido = false, enPantalla = true;
  requestAnimationFrame(cuadro);

  /* Fuera de pantalla el monitor se duerme: no tiene caso dibujar un
     trazo que nadie ve. Al volver, retoma donde iba. */
  if ("IntersectionObserver" in window){
    new IntersectionObserver(([e]) => {
      enPantalla = e.isIntersecting;
      if (enPantalla && dormido){
        dormido = false;
        antes = performance.now();
        requestAnimationFrame(cuadro);
      }
    }).observe(box);
  }

  // Al volver a la pestaña no se cobra el tiempo que estuvo escondida.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"){ antes = performance.now(); atendido(); }
  });

  return { pulso: pulsoActual };
})();

/* — 3. Cuenta regresiva: en latidos, no en segundos.
       A 72 por minuto, el pulso de reposo del paciente. — */
(function countdown(){
  const box    = document.getElementById("countdown");
  const lat    = document.getElementById("latidos");
  const reloj  = document.getElementById("cd-reloj");
  if (!box || !lat) return;
  const target = new Date(EVENTO.inicio).getTime();
  const k      = box.querySelector(".tminus__k");

  if (!EVENTO.inicio || Number.isNaN(target)){
    lat.textContent = "SIN PROGRAMAR";
    return;
  }
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const miles = n => n.toLocaleString("es-MX").replace(/,/g, " ");

  function tick(){
    const left = target - Date.now();
    if (left <= 0){
      k.textContent = "EN QUIRÓFANO";
      lat.textContent = "0";
      if (reloj) reloj.textContent = "00:00:00:00";
      clearInterval(timer);
      return;
    }
    const s = Math.floor(left / 1000);
    lat.textContent = miles(Math.floor(left / 1000 * 72 / 60));
    if (reloj) reloj.textContent =
      `${pad(Math.floor(s / 86400), 3)}:${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  tick();
  const timer = setInterval(tick, 250);
})();

/* — 4. El panel se pinta renglón por renglón, como a 1200 baud — */
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

/* — 5. Línea de comando: se teclea sola — */
(function typing(){
  const el = document.getElementById("typed");
  if (!el) return;
  const texto = "OPERAR";
  if (reducedMotion){ el.textContent = texto; return; }

  let i = 0;
  const timer = setInterval(() => {
    el.textContent = texto.slice(0, ++i);
    if (i >= texto.length) clearInterval(timer);
  }, 95);
})();

/* — 6. Área de información del operador: la línea 24 del 3277.
       Donde iba "X SYSTEM" ahora va el pulso del paciente (lo escribe
       el monitor); el indicador de posición sigue el scroll, como el
       cursor. — */
(function oia(){
  const sys   = document.getElementById("oia-sys");
  const panel = document.getElementById("oia-panel");
  const pos   = document.getElementById("oia-pos");
  if (!sys || !panel || !pos) return;

  const secciones = [...document.querySelectorAll("main > section")].map(s => ({
    el: s,
    nombre: (s.querySelector(".panel__name")?.textContent || "ARRANQUE").trim(),
  }));

  /* Quien se desplaza es .tubo, no la ventana. Si el tubo no
     estuviera, se lee la ventana y todo esto sigue funcionando igual. */
  const tubo  = document.querySelector(".tubo");
  const fuente = tubo || window;
  const leer = () => tubo
    ? { y: tubo.scrollTop,
        alto: tubo.scrollHeight - tubo.clientHeight,
        vh: tubo.clientHeight }
    : { y: window.scrollY,
        alto: document.documentElement.scrollHeight - window.innerHeight,
        vh: window.innerHeight };

  let pendiente = false;
  function actualizar(){
    pendiente = false;
    const { y, alto, vh } = leer();
    const avance = alto > 0 ? Math.min(Math.max(y / alto, 0), 1) : 0;
    const fila = 1 + Math.round(avance * 23);          // 24 renglones, como el modelo 2
    pos.textContent = `${String(fila).padStart(3, "0")}/024`;

    const medio = y + vh * 0.4;
    let actual = secciones[0];
    for (const s of secciones){
      // las escondidas (modo próximamente) no cuentan
      if (s.el.offsetParent && s.el.offsetTop <= medio) actual = s;
    }
    if (panel.textContent !== actual.nombre) panel.textContent = actual.nombre;
  }

  fuente.addEventListener("scroll", () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(actualizar);
  }, { passive: true });
  window.addEventListener("resize", actualizar);
  actualizar();
})();

/* — 7. Consentimiento informado: integrantes, marca y envío —
       Sin backend a propósito. El envío abre el correo del organizador
       con la ficha ya escrita, y "COPIAR DATOS" deja lo mismo en el
       portapapeles por si prefieren pegarlo en WhatsApp. — */
(function alta(){
  const form = document.getElementById("alta");
  if (!form) return;

  const N          = 12;                                   // celdas por lado
  const INTEGRANTES = 3;                                   // uno por rol
  const FONDO      = "#0d0410";
  const TINTAS     = [null, "#ff2d95", "#a855f7", "#ffd9ee", "#3ddc97"];

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

  /* ---- SEMILLA: la marca crece sola ----
     Un tallo sube por el centro, echa ramas de circuito hacia los lados
     con hojas y puntos de soldadura en las puntas, y abre una flor arriba.
     Se dibuja solo la mitad izquierda y se espeja, como ALEATORIO. Las
     celdas se pintan una por una para que se vea crecer. */
  let creciendo = null;
  function semilla(){
    const pasos = [];                       // [fila, col, tinta] en orden de crecimiento
    const M = N / 2 - 1;                    // columna del tallo (5); su espejo es la 6
    const r = Math.random;
    const alto = 4 + Math.floor(r() * 3);   // dónde termina el tallo: fila 4 a 6
    // raíces
    pasos.push([N - 1, M, 2], [N - 1, M - 1, 2]);
    if (r() < .6) pasos.push([N - 1, M - 3, 2], [N - 2, M - 2, 2]);
    // tallo
    for (let f = N - 2; f >= alto; f--) pasos.push([f, M, 4]);
    // ramas de circuito
    const ramas = 2 + Math.floor(r() * 2);
    for (let k = 0; k < ramas; k++){
      let f = alto + 1 + Math.floor(r() * (N - alto - 4)), c = M;
      const largo = 2 + Math.floor(r() * 3);
      for (let i = 0; i < largo && c > 0; i++){
        c--; if (r() < .55 && f > 1) f--;
        pasos.push([f, c, 1]);
      }
      if (r() < .65){
        pasos.push([f, Math.max(0, c - 1), 4]);
        if (f > 0) pasos.push([f - 1, c, 4]);
      } else {
        pasos.push([f, Math.max(0, c - 1), 3]);
      }
    }
    // la flor
    const fc = alto - 2;
    pasos.push([alto - 1, M, 4], [fc + 1, M - 1, r() < .5 ? 1 : 2], [fc - 1, M, r() < .5 ? 1 : 2],
               [fc, M - 1, r() < .5 ? 1 : 2], [fc, M, 3]);
    return pasos.filter(([f, c]) => f >= 0 && c >= 0);
  }

  document.getElementById("b-sem").addEventListener("click", () => {
    clearInterval(creciendo);
    lienzo = new Array(N * N).fill(0);
    celdas.forEach(c => { c.dataset.v = "0"; });
    const pasos = semilla();
    const pon = ([f, c, v]) => {
      for (const col of [c, N - 1 - c]){
        lienzo[f * N + col] = v;
        celdas[f * N + col].dataset.v = String(v);
      }
    };
    if (reducedMotion){ pasos.forEach(pon); dibujaPrevia(); return; }
    let i = 0;
    creciendo = setInterval(() => {
      pon(pasos[i++]); dibujaPrevia();
      if (i >= pasos.length) clearInterval(creciendo);
    }, 45);
  });
  // Si alguien pinta o limpia a media siembra, la siembra se detiene.
  grid.addEventListener("pointerdown", () => clearInterval(creciendo));
  ["b-clr", "b-rnd"].forEach(id =>
    document.getElementById(id).addEventListener("click", () => clearInterval(creciendo)));

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
    ctx.fillText("HACK(ME)THON 2.0 · THE ANATOMY OF A MACHINE", lado / 2, lado + 74);
    return c;
  }
  const nombrePng = () =>
    "marca-" + (iEquipo.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "equipo") + ".png";

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
    const firma = form.elements.consiento;
    if (firma && !firma.checked){
      firma.setAttribute("aria-invalid", "true");
      firma.focus();
      return "FALTA FIRMAR EL CONSENTIMIENTO.";
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
      "REGISTRO HACK(ME)THON 2.0",
      "=========================",
      `EQUIPO ......... ${val("equipo")}`,
      `CORREO ......... ${val("correo")}`,
      "",
      "INTEGRANTES:",
      ...filas,
      "",
      `MARCA (${N}x${N}, 0=apagado 1=magenta 2=violeta 3=brillo 4=clorofila):`,
      lienzo.join(""),
      "",
      `EVENTO ......... ${EVENTO.fecha}, ${EVENTO.duracion}`,
      `SEDE ........... ${EVENTO.sede}`,
    ].join("\n");
  }

  /* El registro se manda al servidor. El correo queda solo como último
     recurso: si no hay API (vista previa del artifact, archivo abierto
     desde el disco, o el servidor caído) nadie se queda sin registrarse. */
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
    form.querySelectorAll("input, .grid button, #b-copy, #b-sim, #b-rnd, #b-sem, #b-clr, .sw")
        .forEach(el => { el.disabled = true; });
    boton.disabled = true;
    // El PNG se deja vivo: el emblema es suyo y se lo pueden llevar.
  }

  function abreCorreo(){
    const destino = (EVENTO.registros || EVENTO.contacto).replace(/^mailto:/, "");
    const asunto  = `Registro HACK(ME)THON 2.0 — ${val("equipo")}`;
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
    // con el cupo por definir, "quedan N" contradiría al texto
    if (!spanQuedan || quedan == null || /por definir/i.test(EVENTO.cupo)) return;
    spanQuedan.textContent = quedan > 0 ? ` · quedan ${quedan}` : " · CUPO LLENO";
  }
  ESTADO
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

/* — 8. El título ASCII, siempre de una pieza y dentro del marco —
   Son 69 columnas monoespaciadas repartidas en tres bloques. El CSS
   las escala suponiendo 0.6em por carácter, pero █ (U+2588) no viene
   en la subserie latina de IBM Plex Mono: cada sistema lo presta de
   otra fuente y el avance real cambia, así que en un teléfono el
   título podía asomarse por la derecha. Aquí se mide el ancho que de
   verdad ocupa y se calcula la talla que lo hace caber. */
(function ajustaBanner(){
  const banner = document.querySelector(".banner");
  const fila   = banner && banner.querySelector(".banner__row");
  if (!fila) return;

  const MAX    = 19;    // misma talla tope que el CSS
  const REF    = 100;   // talla de medición: da el ancho en em
  const SOMBRA = 0.16;  // la sombra dura sobresale .16em a la derecha
  const SALTO  = 3;     // y el desgarro empuja hasta 3px más

  function ajusta(){
    const hueco = banner.clientWidth - SALTO;
    banner.style.setProperty("--banner-fs", REF + "px");
    const ancho = [...fila.children]
      .reduce((suma, blk) => suma + blk.getBoundingClientRect().width, 0) / REF;
    banner.style.setProperty("--banner-fs",
      Math.min(MAX, hueco / (ancho + SOMBRA)) + "px");
  }

  ajusta();
  // Las webfonts llegan después del primer trazo y cambian el avance.
  if (document.fonts) document.fonts.ready.then(ajusta).catch(() => {});
  addEventListener("resize", ajusta);
})();
