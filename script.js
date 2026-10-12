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

    if ((enPantalla || estado === "paro") && !porJuego) requestAnimationFrame(cuadro);
    else dormido = true;
  }
  let dormido = false, enPantalla = true;

  /* Con BYPASS en pantalla completa nadie ve el monitor: se duerme para
     dejarle al juego todo el teléfono, y despierta al salir. */
  let porJuego = false;
  window.addEventListener("juego-completo", ev => {
    porJuego = !!ev.detail;
    if (!porJuego && dormido){
      dormido = false;
      antes = performance.now();
      ultimo = performance.now(); ocioso = 0;       // no cobrarle el tiempo de juego
      requestAnimationFrame(cuadro);
    }
  });
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

/* — 7. Consentimiento informado: la inscripción —
       Una persona por registro (Paso 1 de FORMULARIO_REGISTRO_HACKMETHON_2026.md).
       Va al servidor (/api/registro), que es el que valida de verdad.
       Sobre el equipo hay tres caminos: unirse a uno de la lista con su
       contraseña, crear uno (nombre, contraseña y logo de 16 × 16) o pedir
       que lo acomoden en uno desde el panel. — */
(function alta(){
  const form = document.getElementById("alta");
  if (!form) return;

  const EDAD = { min: 12, max: 99, mayor: 18 };
  // cuántos periodos puede llevar cada forma de contar, y cómo se llama
  const PERIODO_MAX = { semestre: 12, cuatrimestre: 15, tetramestre: 15, anio: 5 };
  const PERIODO_NOMBRE = { semestre: "SEMESTRE", cuatrimestre: "CUATRIMESTRE", tetramestre: "TETRAMESTRE", anio: "AÑO" };

  /* ---- CURP: formato, dígito verificador y fecha (igual que el servidor) ---- */
  const ENTIDADES = "AS BC BS CC CL CM CS CH DF DG GT GR HG JC MC MN MS NT NL OC PL QT QR SP SL SR TC TS TL VZ YN ZS NE".split(" ");
  const FORMATO_CURP = /^[A-Z][AEIOUX][A-Z]{2}(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX]([A-Z]{2})[B-DF-HJ-NP-TV-Z]{3}([A-Z\d])(\d)$/;
  const DIC_CURP = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  const limpiaCurp = v => String(v || "").toUpperCase().replace(/\s+/g, "");
  function nacimiento(curp){
    const m = FORMATO_CURP.exec(curp);
    if (!m) return null;
    const anio = (/\d/.test(m[5]) ? 1900 : 2000) + Number(m[1]);
    const f = new Date(Date.UTC(anio, Number(m[2]) - 1, Number(m[3])));
    return f.getUTCMonth() === Number(m[2]) - 1 ? f : null;
  }
  function curpValida(curp){
    const m = FORMATO_CURP.exec(curp);
    if (!m || !ENTIDADES.includes(m[4]) || !nacimiento(curp)) return false;
    let suma = 0;
    for (let i = 0; i < 17; i++) suma += DIC_CURP.indexOf(curp[i]) * (18 - i);
    return (10 - (suma % 10)) % 10 === Number(curp[17]);
  }
  // edad a partir de "AAAA-MM-DD"
  function edadDe(fecha){
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || "");
    if (!m) return null;
    const hoy = new Date();
    let e = hoy.getFullYear() - m[1];
    if (hoy.getMonth() + 1 < +m[2] || (hoy.getMonth() + 1 === +m[2] && hoy.getDate() < +m[3])) e--;
    return e;
  }
  const limpiaTel = v => {
    let d = String(v || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
    return d.length === 10 ? d : null;
  };

  const el = n => form.elements[n];
  const val = n => (el(n)?.value || "").trim();
  const elegido = n => form.querySelector(`input[name="${n}"]:checked`)?.value || "";

  /* ---- «Ya tengo equipo»: la lista de equipos registrados ----
     Se pide al servidor al elegir la opción (y con «ACTUALIZAR»). Los
     llenos se ven pero no se pueden elegir. */
  const eqUnirse = document.getElementById("eq-unirse"), eqCrear = document.getElementById("eq-crear");
  const eqLista = document.getElementById("eq-lista"), eqEstado = document.getElementById("eq-estado");
  const plano = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  let equipos = null, pedidos = 0, idElegido = "";

  async function cargaEquipos(forzar){
    if (!forzar && Date.now() - pedidos < 15000) return;
    pedidos = Date.now();
    if (!equipos) eqEstado.textContent = "... BUSCANDO EQUIPOS";
    try {
      const r = await fetch(API + "/equipos", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !Array.isArray(d.equipos)) throw new Error();
      equipos = d;
      pintaEquipos();
    } catch {
      pedidos = 0;
      eqEstado.textContent = equipos
        ? "NO SE PUDO ACTUALIZAR LA LISTA."
        : "NO SE PUDO CARGAR LA LISTA DE EQUIPOS. DALE A «ACTUALIZAR».";
    }
  }

  function pintaEquipos(){
    if (!equipos) return;
    const { max } = equipos, todos = equipos.equipos, filtro = plano(val("buscaEquipo"));
    // el elegido se queda a la vista aunque no coincida con la búsqueda
    const vistos = todos.filter(e => String(e.id) === idElegido || plano(e.nombre).includes(filtro));
    if (idElegido && !todos.some(e => String(e.id) === idElegido)) idElegido = "";
    eqLista.textContent = "";
    for (const e of vistos){
      const lleno = e.integrantes >= max;
      const op = document.createElement("label");
      op.className = "eq-op";
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = "equipoId"; radio.value = e.id;
      radio.disabled = lleno || !!form.dataset.cerrado;
      radio.checked = String(e.id) === idElegido;
      const logo = pintaLogo(document.createElement("canvas"), e.logo);
      logo.setAttribute("aria-hidden", "true");
      const nombre = document.createElement("span");
      nombre.className = "eq-op__n"; nombre.textContent = e.nombre;
      const cuenta = document.createElement("span");
      cuenta.className = "eq-op__c"; cuenta.textContent = lleno ? `${max}/${max} · LLENO` : `${e.integrantes}/${max}`;
      op.append(radio, logo, nombre, cuenta);
      eqLista.appendChild(op);
    }
    const n = todos.length;
    eqEstado.textContent =
      !n ? "TODAVÍA NO HAY EQUIPOS. QUIEN LO VA A CREAR SE REGISTRA PRIMERO CON «CREAR UN EQUIPO»." :
      !vistos.length ? "NINGÚN EQUIPO SE LLAMA ASÍ." :
      `${n} EQUIPO${n === 1 ? "" : "S"}. ¿NO ESTÁ EL TUYO? QUIEN LO CREA TIENE QUE REGISTRARSE PRIMERO.`;
  }

  el("buscaEquipo").addEventListener("input", pintaEquipos);
  // Enter en la búsqueda no manda el formulario
  el("buscaEquipo").addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
  document.getElementById("eq-recarga").addEventListener("click", () => cargaEquipos(true));
  form.addEventListener("change", e => {
    if (e.target.name !== "equipoId") return;
    idElegido = e.target.value;
    eqLista.removeAttribute("aria-invalid");
  });

  /* ---- «Crear un equipo»: el editor del logo, 16 × 16 ----
     Un arreglo de 256 índices de LOGO.paleta (config.js); se manda como
     texto. Lápiz con trazo continuo, bote de pintura, espejo horizontal y
     deshacer. Clic derecho borra. Con el teclado: flechas, espacio, 0–7
     para el color y Ctrl+Z. */
  const N = LOGO.lado;
  const px = new Array(N * N).fill(0);
  const historia = [];
  let color = 1, herramienta = "lapiz", espejo = false, cursor = { x: 0, y: 0 }, trazo = null;

  const lienzo = document.getElementById("px-lienzo"), ctx = lienzo.getContext("2d");
  const CEL = lienzo.width / N;
  const vistas = [document.getElementById("px-vista1"), document.getElementById("px-vista3")];
  const posicion = document.getElementById("px-pos");
  const botones = Object.fromEntries([...eqCrear.querySelectorAll("[data-px]")].map(b => [b.dataset.px, b]));

  function dibuja(){
    ctx.fillStyle = "#0a070c";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    px.forEach((c, i) => {
      if (!c) return;
      ctx.fillStyle = LOGO.paleta[c];
      ctx.fillRect((i % N) * CEL, Math.floor(i / N) * CEL, CEL, CEL);
    });
    // retícula, con el eje del espejo más marcado
    for (let k = 1; k < N; k++){
      ctx.fillStyle = k === N / 2 && espejo ? "rgba(79,134,238,.75)" : "rgba(250,57,186,.16)";
      ctx.fillRect(k * CEL, 0, 1, lienzo.height);
      ctx.fillStyle = "rgba(250,57,186,.16)";
      ctx.fillRect(0, k * CEL, lienzo.width, 1);
    }
    // el cursor del teclado, solo cuando se llega con el teclado
    if (lienzo.matches(":focus-visible")){
      ctx.strokeStyle = "#ffd3ee"; ctx.lineWidth = 2;
      ctx.strokeRect(cursor.x * CEL + 1, cursor.y * CEL + 1, CEL - 2, CEL - 2);
    }
    const logo = px.join("");
    vistas.forEach(v => pintaLogo(v, logo));
    botones.deshacer.disabled = !historia.length;
    botones.limpiar.disabled = !px.some(Boolean);
  }

  const pon = (x, y, c) => {
    px[y * N + x] = c;
    if (espejo) px[y * N + (N - 1 - x)] = c;
  };
  // relleno por contigüidad (4 vecinos) del color que había en (x, y)
  function rellena(x, y, c){
    const viejo = px[y * N + x];
    if (viejo === c) return;
    const pila = [[x, y]];
    while (pila.length){
      const [i, j] = pila.pop();
      if (i < 0 || j < 0 || i >= N || j >= N || px[j * N + i] !== viejo) continue;
      px[j * N + i] = c;
      pila.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
    }
    if (espejo) rellena(N - 1 - x, y, c);
  }
  // Un cambio terminado (trazo, relleno, limpiar) se puede deshacer.
  function termina(antes){
    if (antes.some((v, i) => v !== px[i])){
      historia.push(antes);
      if (historia.length > 60) historia.shift();
      lienzo.removeAttribute("aria-invalid");
    }
    dibuja();
  }
  function deshacer(){
    if (!historia.length) return;
    px.splice(0, px.length, ...historia.pop());
    dibuja();
  }

  const celda = e => {
    const r = lienzo.getBoundingClientRect();
    const a = v => Math.max(0, Math.min(N - 1, Math.floor(v * N)));
    return { x: a((e.clientX - r.left) / r.width), y: a((e.clientY - r.top) / r.height) };
  };
  lienzo.addEventListener("pointerdown", e => {
    if (form.dataset.cerrado || e.button > 2) return;
    e.preventDefault();
    lienzo.focus({ preventScroll: true });
    const p = celda(e), c = e.button === 2 ? 0 : color, antes = px.slice();
    cursor = p;
    if (herramienta === "bote"){ rellena(p.x, p.y, c); return termina(antes); }
    lienzo.setPointerCapture(e.pointerId);
    trazo = { antes, c, ultimo: p };
    pon(p.x, p.y, c);
    dibuja();
  });
  lienzo.addEventListener("pointermove", e => {
    if (!trazo) return;
    // Bresenham entre la celda anterior y esta: un trazo rápido no deja huecos
    const p = celda(e);
    let { x, y } = trazo.ultimo;
    const dx = Math.abs(p.x - x), dy = -Math.abs(p.y - y), sx = x < p.x ? 1 : -1, sy = y < p.y ? 1 : -1;
    let err = dx + dy;
    while (true){
      pon(x, y, trazo.c);
      if (x === p.x && y === p.y) break;
      const e2 = 2 * err;
      if (e2 >= dy){ err += dy; x += sx; }
      if (e2 <= dx){ err += dx; y += sy; }
    }
    trazo.ultimo = cursor = p;
    dibuja();
  });
  const suelta = () => { if (trazo){ termina(trazo.antes); trazo = null; } };
  lienzo.addEventListener("pointerup", suelta);
  lienzo.addEventListener("pointercancel", suelta);
  lienzo.addEventListener("contextmenu", e => e.preventDefault());
  lienzo.addEventListener("focus", dibuja);
  lienzo.addEventListener("blur", () => { posicion.textContent = "LOGO · 16 × 16"; dibuja(); });

  const FLECHAS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  lienzo.addEventListener("keydown", e => {
    if (form.dataset.cerrado) return;
    const mov = FLECHAS[e.key];
    if (mov){
      e.preventDefault();
      cursor = { x: Math.max(0, Math.min(N - 1, cursor.x + mov[0])), y: Math.max(0, Math.min(N - 1, cursor.y + mov[1])) };
      const c = LOGO.nombres[px[cursor.y * N + cursor.x]];
      posicion.textContent = `FILA ${cursor.y + 1} · COLUMNA ${cursor.x + 1} · ${px[cursor.y * N + cursor.x] ? c : "VACÍO"}`;
      dibuja();
    } else if (e.key === " " || e.key === "Enter"){
      e.preventDefault();
      const antes = px.slice();
      if (herramienta === "bote") rellena(cursor.x, cursor.y, color); else pon(cursor.x, cursor.y, color);
      termina(antes);
    } else if (/^[0-7]$/.test(e.key)){
      eligeColor(Number(e.key));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){
      e.preventDefault();
      deshacer();
    }
  });

  // paleta: los siete colores y al final el borrador
  const paleta = document.getElementById("px-paleta");
  const muestras = [];
  [1, 2, 3, 4, 5, 6, 7, 0].forEach(i => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pixel__color" + (LOGO.paleta[i] ? "" : " pixel__color--vacio");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", `${LOGO.nombres[i]} (tecla ${i})`);
    b.title = LOGO.nombres[i];
    if (LOGO.paleta[i]) b.style.setProperty("--c", LOGO.paleta[i]);
    b.addEventListener("click", () => eligeColor(i));
    muestras[i] = b;
    paleta.appendChild(b);
  });
  function eligeColor(i){
    color = i;
    muestras.forEach((b, k) => b.setAttribute("aria-checked", String(k === i)));
  }
  eligeColor(1);

  for (const [h, b] of Object.entries(botones)){
    b.addEventListener("click", () => {
      if (h === "lapiz" || h === "bote"){
        herramienta = h;
        botones.lapiz.setAttribute("aria-pressed", String(h === "lapiz"));
        botones.bote.setAttribute("aria-pressed", String(h === "bote"));
      } else if (h === "espejo"){
        espejo = !espejo;
        b.setAttribute("aria-pressed", String(espejo));
        dibuja();
      } else if (h === "deshacer") deshacer();
      else if (h === "limpiar"){ const antes = px.slice(); px.fill(0); termina(antes); }
    });
  }
  dibuja();

  /* ---- lo que se muestra según lo que se contesta ---- */
  const escuela = document.getElementById("escuela");
  const tutor = document.getElementById("tutor");
  const periodoT = document.getElementById("periodo-t");
  function acomoda(){
    escuela.hidden = elegido("estudia") !== "si";
    // «¿Cuál?» solo se puede escribir si eligió «Otra»
    const esOtra = val("institucion") === "otra";
    el("otra").disabled = !esOtra;
    if (!esOtra) el("otra").value = "";
    const modo = elegido("equipoModo");
    eqUnirse.hidden = modo !== "unirse";
    eqCrear.hidden = modo !== "crear";
    if (modo === "unirse") cargaEquipos();
    const periodo = val("periodo") in PERIODO_MAX ? val("periodo") : "semestre";
    periodoT.textContent = `${PERIODO_NOMBRE[periodo]} QUE CURSAS`;
    el("semestre").max = PERIODO_MAX[periodo];
    const edad = edadDe(val("nacimiento"));
    tutor.hidden = !(edad != null && edad < EDAD.mayor);
  }
  form.addEventListener("change", acomoda);
  form.addEventListener("input", e => { if (e.target.name === "nacimiento") acomoda(); });

  // Con una CURP válida, la fecha de nacimiento se llena sola (y se puede corregir).
  el("curp").addEventListener("change", () => {
    el("curp").value = limpiaCurp(el("curp").value);
    const curp = el("curp").value;
    if (curpValida(curp) && !val("nacimiento")){
      el("nacimiento").value = nacimiento(curp).toISOString().slice(0, 10);
      acomoda();
    }
  });
  acomoda();

  /* ---- validación y envío ---- */
  const msg = document.getElementById("msg");
  function avisa(texto, error){
    msg.textContent = texto ? (error ? ">>> " : "*** ") + texto : "";
    msg.className = "msg " + (texto ? (error ? "msg--err" : "msg--ok") : "");
  }

  // Marca el campo, lo enfoca y devuelve el mensaje.
  function falla(nombre, texto){
    const c = el(nombre);
    const campo = c instanceof RadioNodeList ? c[0] : c;
    campo.setAttribute("aria-invalid", "true");
    campo.focus();
    return texto;
  }
  function revisa(){
    form.querySelectorAll("[aria-invalid]").forEach(i => i.removeAttribute("aria-invalid"));
    if (!val("nombre"))    return falla("nombre", "FALTA TU NOMBRE.");
    if (!val("apellidos")) return falla("apellidos", "FALTAN TUS APELLIDOS.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val("correo"))) return falla("correo", "EL CORREO NO ES VÁLIDO.");
    if (!limpiaTel(val("tel"))) return falla("tel", "EL TELÉFONO DEBE TENER 10 DÍGITOS.");
    const curp = limpiaCurp(val("curp"));
    if (!curpValida(curp)) return falla("curp", "LA CURP NO ES VÁLIDA. REVÍSALA LETRA POR LETRA.");
    if (!val("genero")) return falla("genero", "ELIGE UNA OPCIÓN DE GÉNERO.");
    if (!val("nacimiento")) return falla("nacimiento", "FALTA TU FECHA DE NACIMIENTO.");
    if (nacimiento(curp).toISOString().slice(0, 10) !== val("nacimiento"))
      return falla("nacimiento", "LA FECHA DE NACIMIENTO NO COINCIDE CON TU CURP.");
    const edad = edadDe(val("nacimiento"));
    if (edad < EDAD.min || edad > EDAD.max)
      return falla("nacimiento", `LA EDAD DEBE IR DE ${EDAD.min} A ${EDAD.max} AÑOS.`);
    if (!/^\d{5}$/.test(val("cp"))) return falla("cp", "EL CÓDIGO POSTAL DEBE TENER 5 DÍGITOS.");

    const estudia = elegido("estudia");
    if (!estudia) return falla("estudia", "DINOS SI ESTUDIAS ACTUALMENTE.");
    if (estudia === "si"){
      if (!val("institucion")) return falla("institucion", "ELIGE TU UNIVERSIDAD O INSTITUCIÓN.");
      if (val("institucion") === "otra" && !val("otra")) return falla("otra", "ESCRIBE EL NOMBRE DE TU ESCUELA.");
      if (!val("carrera")) return falla("carrera", "FALTA TU CARRERA.");
      const tope = PERIODO_MAX[val("periodo")], n = Number(val("semestre"));
      if (!Number.isInteger(n) || n < 1 || n > tope)
        return falla("semestre", `EL ${PERIODO_NOMBRE[val("periodo")]} VA DE 1 A ${tope}.`);
    }

    const modo = elegido("equipoModo");
    if (!modo) return falla("equipoModo", "DINOS SI YA TIENES EQUIPO.");
    if (modo === "unirse"){
      if (!idElegido){
        eqLista.setAttribute("aria-invalid", "true");
        (eqLista.querySelector("input:not(:disabled)") || el("buscaEquipo")).focus();
        return equipos && !equipos.equipos.length
          ? "TODAVÍA NO HAY EQUIPOS: QUIEN LO VA A CREAR TIENE QUE REGISTRARSE PRIMERO."
          : "ELIGE TU EQUIPO DE LA LISTA.";
      }
      if (!el("claveUnirse").value) return falla("claveUnirse", "FALTA LA CONTRASEÑA DE TU EQUIPO.");
    }
    if (modo === "crear"){
      if (val("equipo").length < 2) return falla("equipo", "FALTA EL NOMBRE DE TU EQUIPO.");
      if (el("claveCrear").value.length < 4)
        return falla("claveCrear", "LA CONTRASEÑA DEL EQUIPO DEBE TENER AL MENOS 4 CARACTERES.");
      if (!px.some(Boolean)){
        lienzo.setAttribute("aria-invalid", "true");
        lienzo.focus();
        return "DIBUJA EL LOGO DE TU EQUIPO.";
      }
    }

    if (!el("privacidad").checked) return falla("privacidad", "FALTA ACEPTAR EL AVISO DE PRIVACIDAD.");
    if (edad < EDAD.mayor && !el("tutor").checked)
      return falla("tutor", "ERES MENOR DE EDAD: FALTA CONFIRMAR LA AUTORIZACIÓN DE TU TUTOR.");
    if (!el("responsiva").checked) return falla("responsiva", "FALTA ACEPTAR LA RESPONSIVA.");
    return null;
  }

  function paquete(){
    const estudia = elegido("estudia") === "si";
    return {
      nombre: val("nombre"), apellidos: val("apellidos"), correo: val("correo"),
      telefono: val("tel"), curp: limpiaCurp(val("curp")), genero: val("genero"),
      nacimiento: val("nacimiento"), cp: val("cp"), estudia,
      institucion: estudia ? (val("institucion") === "otra" ? val("otra") : val("institucion")) : "",
      carrera: estudia ? val("carrera") : "",
      periodo: estudia ? val("periodo") : "",
      semestre: estudia ? Number(val("semestre")) : null,
      ...equipoDe(elegido("equipoModo")),
      privacidad: el("privacidad").checked, tutor: el("tutor").checked,
      responsiva: el("responsiva").checked,
      empresa: val("empresa"),
    };
  }

  // Solo lo del camino elegido. La contraseña va tal cual: sin espacios
  // recortados, para que sea la misma que escriben los demás.
  function equipoDe(modo){
    if (modo === "unirse")
      return { equipoModo: modo, equipoId: Number(idElegido), equipoClave: el("claveUnirse").value };
    if (modo === "crear")
      return { equipoModo: modo, equipo: val("equipo"), equipoClave: el("claveCrear").value, logo: px.join("") };
    return { equipoModo: modo };
  }
  const nombreEquipo = p =>
    p.equipoModo === "crear" ? p.equipo :
    p.equipoModo === "unirse" ? equipos?.equipos.find(e => e.id === p.equipoId)?.nombre || "" : "";

  // La ficha del correo de respaldo. La CURP, el código postal y la fecha
  // de nacimiento no van: un correo viaja por muchos servidores. Se piden
  // después, al confirmar.
  const EQUIPO_TEXTO = { unirse: "Ya tengo equipo", crear: "Crear un equipo", asignar: "No tengo, agréguenme a uno" };
  function ficha(){
    const p = paquete();
    return [
      "REGISTRO HACK(ME)THON 2.0",
      "=========================",
      `NOMBRE ......... ${p.nombre} ${p.apellidos}`,
      `CORREO ......... ${p.correo}`,
      `TELÉFONO ....... ${p.telefono}`,
      `ESTUDIA ........ ${p.estudia ? `${p.institucion} · ${p.carrera} · ${PERIODO_NOMBRE[p.periodo].toLowerCase()} ${p.semestre}` : "No"}`,
      `EQUIPO ......... ${EQUIPO_TEXTO[p.equipoModo] || "—"}${nombreEquipo(p) ? ` — ${nombreEquipo(p)}` : ""}`,
      "",
      "(La CURP no va en este correo: se la pedimos al confirmar.)",
      ...(p.equipoModo === "crear" ? ["(El logo y la contraseña del equipo los pedimos al confirmar.)"] : []),
      "Acepto el aviso de privacidad y la responsiva.",
    ].join("\n");
  }

  /* El registro se manda al servidor. El correo queda solo como último
     recurso: si no hay API (vista previa del artifact, archivo abierto
     desde el disco, o el servidor caído) nadie se queda sin registrarse. */
  const boton = form.querySelector('button[type="submit"]');
  function bloquea(){
    form.dataset.cerrado = "1";
    form.querySelectorAll("input, select, button").forEach(c => { c.disabled = true; });
  }

  function abreCorreo(){
    const destino = (EVENTO.registros || EVENTO.contacto).replace(/^mailto:/, "");
    const asunto  = `Registro HACK(ME)THON 2.0 — ${val("nombre")} ${val("apellidos")}`;
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
        const p = paquete();
        avisa(`REGISTRO ACEPTADO. TU FOLIO ES ${datos.folio}. TE ESCRIBIMOS A TU CORREO.` +
          (p.equipoModo === "crear" ? ` «${p.equipo.replace(/\s+/g, " ").toUpperCase()}» YA APARECE EN LA LISTA: PÁSALES LA CONTRASEÑA A TUS COMPAÑEROS.` : ""), false);
        pintaCupo(datos.quedan);
        return;
      }
      // 400 y 409 traen un motivo concreto del servidor: se muestra tal cual.
      if (r.status === 400 || r.status === 409){
        avisa(datos.mensaje || "REGISTRO RECHAZADO.", true);
        if (datos.lleno) bloquea(); else boton.disabled = false;
        // Si el problema fue el equipo, se señala ahí (y la lista se pone al día).
        const m = String(datos.mensaje), modo = elegido("equipoModo");
        if (modo === "unirse" && /CONTRASEÑA/.test(m)) el("claveUnirse").focus();
        if (modo === "unirse" && /EQUIPO/.test(m)) cargaEquipos(true);
        if (modo === "crear" && /YA HAY UN EQUIPO/.test(m)) el("equipo").focus();
        return;
      }
      throw new Error("HTTP " + r.status);

    } catch {
      form.dataset.estado = "";
      boton.disabled = false;
      abreCorreo();
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
        avisa(`CUPO LLENO: LOS ${d.cupo} LUGARES YA ESTÁN OCUPADOS.`, true);
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
