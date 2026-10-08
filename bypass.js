/* ============================================================
   HACK(ME)THON 2.0 — BYPASS · dibujo, controles y leaderboard
   ────────────────────────────────────────────────────────────
   Minijuego estilo Flappy Bird. El jugador es un pulso que se
   escapó del corazón: cada toque es un latido que lo empuja hacia
   arriba, y deja detrás un trazo de electrocardiograma. Tiene que
   pasar entre válvulas de circuito y enredadera mientras el gusano,
   en el borde derecho, le escupe virus. Cada 10 válvulas el gusano
   se enfurece y lanza tres muros de virus. Cada 20, el mundo se
   voltea: la gravedad y el lado se invierten (y a los 40 regresan).

   El volteo es un ESPEJO DEL DIBUJO, no física: el motor sigue igual
   y la pantalla se refleja de arriba abajo y de izquierda a derecha.
   Para quien juega es idéntico a invertir la gravedad —el pulso "cae"
   hacia arriba, el latido lo empuja hacia abajo, el gusano queda a la
   izquierda y las válvulas llegan desde ahí—, y el servidor, que
   vuelve a jugar las partidas con el motor, no tiene que saberlo.

   La física vive en bypass-motor.js y es determinista. Este archivo
   solo dibuja lo que el motor dice, junta los toques y habla con el
   servidor:

   - Antes de cada partida se pide al servidor una semilla firmada
     (GET /api/partida). Se pide por adelantado para que empezar a
     jugar nunca espere a la red.
   - Durante la partida se anota en qué paso del motor latió el
     jugador. Esa lista y la semilla bastan para repetir la partida
     exacta.
   - Al morir, si la partida tenía semilla del servidor, se ofrece
     registrarla (POST /api/puntaje). El servidor la vuelve a jugar
     con el mismo motor y cuenta los puntos él: el número que diga el
     navegador no importa.
   - Sin servidor (vista previa, sin red) el juego funciona igual,
     solo que esas partidas no cuentan para la tabla.

   Rendimiento: canvas de 300 × 110 escalado pixelado, personajes
   precalculados (un drawImage cada uno), y el bucle solo corre con el
   juego a la vista y la pestaña abierta.

   La prueba del monitor (contra bots): entre la válvula 10 y la 20 el
   juego pregunta al servidor, válvula por válvula, si ya toca
   (GET /api/desafio). Solo en la que eligió el servidor —con una llave
   que aquí no existe— contesta que sí y con qué prueba: latir 3 veces
   rápido, 2 seguidas, o latir cuando el pulso se ponga verde. Se dibuja
   dentro del canvas (no es texto de la página) y solo las partidas que
   la pasan entran a la tabla. Un bot no puede llevar la partida ya
   calculada: tiene que ver y reaccionar en vivo.

   Repeticiones: desde el panel (VER) se abre la portada con
   #repeticion=ID y aquí se reproduce esa partida tal cual.

   Pantalla completa (pensada para teléfonos): un botón la pide junto
   con la orientación horizontal. Mientras se acomoda hay una carga de
   verdad —sprites, audio, partida del servidor y una medición de qué
   tan rápido va el teléfono; si va lento, modo ligero—, y mientras se
   juega así, el resto de la página se pausa. Donde el navegador no deja
   (iPhone), el juego ocupa toda la ventana y, si el teléfono está
   vertical, se gira solo.
   ============================================================ */
(function bypass(){
  const M     = window.BypassMotor;
  const caja  = document.getElementById("juego");
  const cv    = document.getElementById("j-cv");
  if (!M || !caja || !cv || !cv.getContext) return;
  const ctx   = cv.getContext("2d", { alpha: true, desynchronized: true });
  ctx.imageSmoothingEnabled = false;
  const $     = id => document.getElementById(id);
  const msg = $("j-msg"), tit = $("j-titulo"), txt = $("j-txt"), tecla = $("j-tecla");
  const ptsEl = $("j-pts"), recEl = $("j-rec"), avisoFuria = $("j-furia"), avisoGiro = $("j-giro");
  const form = $("j-form"), formPts = $("j-form-pts"), formMsg = $("j-form-msg");
  const topEl = $("j-top"), cierreEl = $("j-cierre");
  const pagEl = $("j-pag"), pagTxt = $("j-pagina"), bAnt = $("j-ant"), bSig = $("j-sig");
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RUTA = typeof API === "string" ? API : null;     // de config.js
  // Los sonidos viven en sonido.js; sin él, el juego sigue mudo y ya.
  const suena = (n, ...a) => window.Sonido?.toca(n, ...a);

  const { W, H, SUELO, ANCHO, CARGA, FURIA, DT } = M;

  const raiz = getComputedStyle(document.documentElement);
  const tono = (n, d) => raiz.getPropertyValue(n).trim() || d;
  const C = {
    fondo: tono("--screen", "#0a070c"),   cuerpo: tono("--screen-2", "#120a16"),
    phos:  tono("--phos", "#fa39ba"),     hi:     tono("--phos-hi", "#ffd3ee"),
    dim:   tono("--phos-dim", "#b0559b"), violeta: tono("--violet", "#a32198"),
    azul:  tono("--blue-hi", "#4f86ee"),  azulDim: tono("--blue-dim", "#2f4a9a"),
    verde: tono("--clorofila", "#3ddc97"), verdeHi: tono("--clorofila-hi", "#b4f5d4"),
    verdeDim: tono("--clorofila-dim", "#23805a"),
    sangre: tono("--sangre", "#ff3355"),  uv: tono("--uv", "#d946ef"),
  };

  /* Cuánto tapa el fondo del juego (0 = transparente, 1 = sólido).
     Translúcido deja ver un poco la página detrás. */
  const OPACIDAD = .5;
  const velo = (() => {
    const h = C.fondo.replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${OPACIDAD})`;
  })();

  /* El mundo mide siempre 300 × 110 — así la partida es la misma en
     cualquier pantalla — y el canvas se estira a lo ancho del cuadro. */
  cv.width = W; cv.height = H;
  function medir(){
    if (completo){ acomodaCompleto(); return; }
    cv.style.width = "";
    const css = cv.parentElement.clientWidth || W * 2;
    cv.style.height = Math.round(H * css / W) + "px";
    dibuja();
  }

  /* ── sprites ───────────────────────────────────────────────── */
  const SPRITE = [".XX.XX.", "XHXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
  // el gusano, 10×12 dibujado al doble. B cuerpo · b sombra · V tentáculo · E ojo · M boca · H brillo
  const GUSANO = [
    ["....BBBB..", "..BBBBBBB.", ".BBHBBBBbB", "BBEEBBBBbb", "BBEEBBBBbb", "MMMBBBBBbb",
     "..MBBBBBbb", "MMMBBBBBbb", "BBBBBBBBbb", ".BBBBBBBb.", "..BVBVBB..", "...V.V.V.."],
    ["...BBBBB..", "..BBBBBBb.", ".BBBHBBBbB", "BBEEBBBBbb", "BBEEBBBBbb", "MMMBBBBBbb",
     "..MBBBBBbb", "MMMBBBBBbb", "BBBBBBBBbb", ".BBBBBBBb.", "..VBVBVB..", "..V.V.V..."],
  ];
  const VIRUS = [
    ["X.X.X", ".XXX.", "XXOXX", ".XXX.", "X.X.X"],
    ["..X..", ".XXX.", "XXOXX", ".XXX.", "..X.."],
  ];

  /* ── sprites precalculados ──────────────────────────────────────
     Cada personaje se pinta UNA vez en un canvas chico y luego se estampa
     con drawImage: el gusano eran ~120 rectángulos por cuadro y ahora es
     uno. En un teléfono es la diferencia entre 60 cuadros y 40. */
  const cache = new Map();
  function sprite(clave, filas, tinta, esc = 1){
    let c = cache.get(clave);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = filas[0].length * esc; c.height = filas.length * esc;
    const k = c.getContext("2d");
    for (let r = 0; r < filas.length; r++) for (let x = 0; x < filas[r].length; x++){
      const t = filas[r][x];
      if (t === "." || !tinta[t]) continue;
      k.fillStyle = tinta[t];
      k.fillRect(x * esc, r * esc, esc, esc);
    }
    cache.set(clave, c);
    return c;
  }
  const spritePulso = (muerto, verde) => sprite("pulso" + muerto + verde, SPRITE,
    { X: muerto ? C.sangre : verde ? C.verde : C.phos, H: verde ? C.verdeHi : C.hi });
  const spriteVirus = f => sprite("virus" + f, VIRUS[f], { X: C.sangre, O: C.hi });
  // Todas las tintas posibles del gusano, para precalentar en la carga.
  const TINTAS_GUSANO = {
    calma:      { B: C.azul,   b: C.azulDim, V: C.violeta, E: C.sangre, M: C.fondo,  H: C.hi },
    carga:      { B: C.azul,   b: C.azulDim, V: C.violeta, E: C.sangre, M: C.sangre, H: C.hi },
    cargaLuz:   { B: C.uv,     b: C.azulDim, V: C.violeta, E: C.sangre, M: C.sangre, H: C.hi },
    furia:      { B: C.phos,   b: C.violeta, V: C.sangre,  E: C.hi,     M: C.sangre, H: C.hi },
    furiaLuz:   { B: C.sangre, b: C.violeta, V: C.sangre,  E: C.hi,     M: C.sangre, H: C.hi },
  };
  const spriteGusano = (f, tinta) => sprite("gusano" + f + tinta, GUSANO[f], TINTAS_GUSANO[tinta], 2);
  function precalienta(){
    spritePulso(true, false); spritePulso(false, false); spritePulso(false, true);
    [0, 1].forEach(spriteVirus);
    for (const t in TINTAS_GUSANO) [0, 1].forEach(f => spriteGusano(f, t));
  }

  /* ── estado ────────────────────────────────────────────────── */
  let estado = "listo";     // listo · jugando · paro · pausa
  let completo = false;     // jugando en pantalla completa
  let prueba = null;        // { tipo, verde, aparicion, ini, fin, estado: activa|ok|falla, t }
  let preguntadas = new Set();
  let repeticion = null;    // { alias, puntos, latidos, i } al ver una partida desde el panel
  let ligero = false;       // teléfono lento: sin partículas ni brillo
  let e = M.crea(1);        // estado del motor (en "listo" solo se usa para dibujar)
  let reloj = 0;            // tiempo cosmético, para animaciones que no son física
  let rastro = [], chispas = [];
  let destello = 0, sacudida = 0, enParo = 0;
  let plano = null;         // al morir: { y, vel } — el trazo se vuelve línea plana

  /* El volteo: cada GIRO puntos el espejo cambia de lado. `espejo` va de
     1 (normal) a −1 (invertido) y en medio pasa por 0: la escena se
     encoge al centro y se abre reflejada, como una tarjeta que gira. */
  const GIRO = 20, GIRO_DUR = .45;
  let espejo = 1, espejoDesde = 1, espejoHacia = 1, giroT = 1;
  let avisoGiroT = 0;
  let latidos = [], latePendiente = false;
  let partida = null;       // { semilla, token?, oficial }
  let siguiente = null;     // la semilla firmada que se usará en la próxima partida
  let envio = null;         // la última partida oficial, lista para registrar
  let torneoAbierto = true;

  const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const lee = k => { try { return localStorage.getItem(k); } catch { return null; } };
  let record = +lee("hmt2-bypass") || 0;
  const pad3 = n => String(n).padStart(3, "0");
  recEl.textContent = pad3(record);

  /* ── la partida ────────────────────────────────────────────── */
  function empieza(){
    // Se usa la semilla firmada si hay una fresca; si no, se juega igual
    // pero esa partida no cuenta para la tabla.
    const fresca = siguiente && Date.now() - siguiente.pedida < 5 * 3600e3;
    partida = fresca
      ? { semilla: siguiente.semilla, token: siguiente.token, oficial: true }
      : { semilla: (Math.random() * 4294967296) >>> 0, oficial: false };
    siguiente = null;
    pidePartida();                       // ya va pidiendo la de la siguiente

    e = M.crea(partida.semilla);
    prueba = null; preguntadas = new Set();
    latidos = []; rastro = []; chispas = [];
    destello = sacudida = 0; plano = null;
    espejo = espejoDesde = espejoHacia = 1; giroT = 1;     // cada partida empieza derecha
    escondeGiro();
    ptsEl.textContent = pad3(0);
    estado = "jugando";
    caja.dataset.estado = "jugando";
    caja.dataset.oficial = partida.oficial ? "si" : "no";
    esconde();
  }

  // un paso del motor, con lo que el dibujo necesita alrededor
  let cargaba = false;
  function pasoJuego(){
    let latio;
    if (repeticion){
      // en una repetición los latidos vienen de la partida guardada
      latio = false;
      while (repeticion.i < repeticion.latidos.length && repeticion.latidos[repeticion.i] === e.paso + 1){
        latio = true; repeticion.i++;
      }
    } else {
      latio = latePendiente;
      latePendiente = false;
    }
    if (latio){ latidos.push(e.paso + 1); suena("latido"); }
    const eventos = M.avanza(e, latio);
    revisaPrueba();
    // el zumbido de aviso suena cuando el gusano empieza a cargar
    const carga = e.gusano.carga > 0 && !e.furia;
    if (carga && !cargaba) suena("carga");
    cargaba = carga;
    rastroAvanza(e.velocidad);
    cosmeticos(DT);
    for (const ev of eventos) reacciona(ev);
  }

  function reacciona(ev){
    switch (ev.tipo){
      case "punto":
        ptsEl.textContent = pad3(e.puntos);
        preguntaPrueba(e.puntos);
        if (e.puntos % GIRO === 0) volteaMundo();
        else if (e.puntos % FURIA.cada) suena("punto");      // en la décima suena la furia
        break;
      case "disparo":
        suena("disparo"); break;
      case "furia":
        suena("furia");
        caja.dataset.furia = "";
        if (avisoFuria) avisoFuria.hidden = false; break;
      case "finFuria":
        terminaFuria(); break;
      case "muro":
        suena("muro");
        sacudida = quieto ? 0 : .18;
        salpica(ev.x, ev.y, C.sangre, 8); break;
      case "absorbe":
        suena("absorbe");
        salpica(ev.x, ev.y, C.verde, 6); break;
      case "muerte":
        muere(ev.motivo); break;
    }
  }
  /* ── la prueba del monitor ─────────────────────────────────── */
  function preguntaPrueba(n){
    if (repeticion || prueba || !partida?.oficial || !RUTA) return;
    if (n < M.PRUEBA.desde || n > M.PRUEBA.hasta || preguntadas.has(n)) return;
    preguntadas.add(n);
    const de = partida;                    // si se reinicia, la respuesta ya no aplica
    fetch(`${RUTA}/desafio?token=${encodeURIComponent(de.token)}&p=${n}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ahora && de === partida && estado === "jugando" && !prueba) activaPrueba(d.tipo, d.verde, e.paso); })
      .catch(() => {});
  }
  function activaPrueba(tipo, verde, aparicion){
    const [ini, fin] = M.ventanaPrueba(tipo, verde, aparicion);
    prueba = { tipo, verde, aparicion, ini, fin, estado: "activa", t: 0 };
    suena("alarma");
  }
  function revisaPrueba(){
    if (repeticion && repeticion.prueba && !prueba && e.paso >= repeticion.aparicion)
      activaPrueba(repeticion.prueba.tipo, repeticion.prueba.verde, repeticion.aparicion);
    if (!prueba || prueba.estado !== "activa") return;
    if (M.cumplePrueba(prueba.tipo, prueba.verde, prueba.aparicion, latidos)){
      prueba.estado = "ok"; prueba.t = 0; suena("registro");
    } else if (e.paso > prueba.fin){
      prueba.estado = "falla"; prueba.t = 0; suena("alarma");
    }
  }
  const TEXTO_PRUEBA = {
    rapido: "LATE 3 VECES RAPIDO",
    doble:  "LATE 2 VECES SEGUIDAS",
    verde:  "LATE CUANDO SE PONGA VERDE",
  };
  // Se dibuja encima de todo y sin el espejo del volteo: siempre se lee.
  function dibujaPrueba(){
    if (!prueba) return;
    if (prueba.estado !== "activa" && prueba.t > 1.6) return;
    const x = 40, y = 4, w = W - 80, h = 25;
    const color = prueba.estado === "ok" ? C.verde : prueba.estado === "falla" ? C.sangre
                : (Math.floor(reloj * 6) % 2 ? C.phos : C.hi);
    ctx.fillStyle = "rgba(10,7,12,.88)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = "8px Silkscreen, monospace";
    const linea1 = prueba.estado === "ok" ? "PRUEBA SUPERADA" : prueba.estado === "falla" ? "PRUEBA FALLIDA" : "PRUEBA DEL MONITOR";
    const linea2 = prueba.estado === "ok" ? "TU PARTIDA PUEDE ENTRAR A LA TABLA"
                 : prueba.estado === "falla" ? "ESTA PARTIDA NO ENTRA A LA TABLA"
                 : TEXTO_PRUEBA[prueba.tipo];
    ctx.fillText(linea1, W / 2, y + 4);
    ctx.fillStyle = C.hi;
    ctx.fillText(linea2, W / 2, y + 14);
    if (prueba.estado === "activa"){
      // lo que queda de tiempo
      const resta = Math.max(0, Math.min(1, (prueba.fin - e.paso) / (prueba.fin - prueba.aparicion)));
      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y + h - 3, Math.round((w - 4) * resta), 1);
    }
  }
  const pulsoVerde = () => prueba && prueba.tipo === "verde" && prueba.estado === "activa" && e.paso >= prueba.ini;

  function terminaFuria(){
    delete caja.dataset.furia;
    if (avisoFuria) avisoFuria.hidden = true;
  }

  function salpica(x, y, color, n){
    if (quieto || ligero) return;
    for (let i = 0; i < n; i++)
      chispas.push({ x, y, vx: (Math.random() - .5) * 90, vy: -Math.random() * 70,
                     v: .3 + Math.random() * .3, c: color });
  }
  function volteaMundo(){
    const invertido = Math.floor(e.puntos / GIRO) % 2 === 1;
    espejoDesde = espejo;
    espejoHacia = invertido ? -1 : 1;
    giroT = quieto ? 1 : 0;
    if (quieto) espejo = espejoHacia;
    suena("giro");
    if (avisoGiro){
      avisoGiro.textContent = invertido ? "\u25BC GRAVEDAD INVERTIDA" : "\u25B2 GRAVEDAD NORMAL";
      avisoGiro.hidden = false;
      avisoGiroT = 1.8;
    }
  }
  function escondeGiro(){ if (avisoGiro) avisoGiro.hidden = true; avisoGiroT = 0; }

  function cosmeticos(dt){
    reloj += dt;
    if (prueba && prueba.estado !== "activa") prueba.t += dt;
    if (giroT < 1){
      giroT = Math.min(1, giroT + dt / GIRO_DUR);
      const k = giroT < .5 ? 2 * giroT * giroT : 1 - 2 * (1 - giroT) ** 2;   // entra y sale suave
      espejo = espejoDesde + (espejoHacia - espejoDesde) * k;
    }
    if (avisoGiroT > 0){ avisoGiroT -= dt; if (avisoGiroT <= 0) escondeGiro(); }
    for (const c of chispas){ c.vy += 300 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.v -= dt; }
    chispas = chispas.filter(c => c.v > 0);
    destello = Math.max(0, destello - dt);
    sacudida = Math.max(0, sacudida - dt);
  }
  function rastroAvanza(vel){
    for (const r of rastro) r.x -= vel * DT;
    rastro.push({ x: e.pulso.x - 3, y: e.pulso.y });
    while (rastro.length && rastro[0].x < 0) rastro.shift();
  }

  // En espera y tras el paro el mundo sigue vivo, pero ya no es física
  // que cuente: se mueve a mano, sin tocar el motor.
  function pasoAdorno(){
    cosmeticos(DT);
    const g = e.gusano;
    const onda = H / 2 - 4 + Math.sin(reloj * 1.1) * (SUELO / 2 - 14);
    g.y += (onda - g.y) * Math.min(1, DT * 2.2);
    if (estado === "listo"){
      e.pulso.y = H / 2 + Math.sin(reloj * 3) * 5;
      e.fondoX += 30 * DT;
      rastroAvanza(30);
    } else {
      enParo += DT;
      for (const z of e.virus){ z.x += z.vx * DT; z.y += z.vy * DT; z.t += DT; }
      e.virus = e.virus.filter(z => z.x > -6);
      // Asistolia: el monitor sigue barriendo, pero ya no hay latido. El
      // trazo corre a la izquierda a la misma velocidad que traía y cada
      // punto nuevo sale a la misma altura: la curva vieja se va de la
      // pantalla y queda solo la línea plana.
      if (plano){
        for (const r of rastro) r.x -= plano.vel * DT;
        rastro.push({ x: e.pulso.x - 3, y: plano.y });
        while (rastro.length && rastro[0].x < 0) rastro.shift();
      }
    }
  }

  function muere(motivo){
    suena(motivo === "valvula" ? "choque" : "infectado");
    estado = "paro";
    caja.dataset.estado = "paro";
    terminaFuria();
    enParo = 0;
    destello = quieto ? 0 : .25;
    sacudida = quieto ? 0 : .3;
    // el pulso se queda donde murió y desde ahí sale la línea plana
    // (dentro de la pantalla aunque haya chocado con el techo o el suelo)
    plano = { y: Math.max(3, Math.min(SUELO - 3, e.pulso.y)), vel: e.velocidad };
    if (!quieto && !ligero) for (let i = 0; i < 14; i++)
      chispas.push({ x: e.pulso.x, y: e.pulso.y, vx: (Math.random() - .5) * 140, vy: -Math.random() * 120,
                     v: .5 + Math.random() * .5, c: i % 3 ? C.phos : C.hi });

    const puntos = e.puntos;
    if (repeticion){
      setTimeout(() => {
        if (estado !== "paro") return;
        const p = repeticion.prueba ? (M.cumplePrueba(repeticion.prueba.tipo, repeticion.prueba.verde, repeticion.aparicion, repeticion.latidos)
                                       ? " Prueba del monitor: superada." : " Prueba del monitor: NO superada.") : "";
        muestra("FIN DE LA REPETICIÓN", `${repeticion.alias} · ${pad3(puntos)} válvulas.${p}`, "TOCA PARA VERLA DE NUEVO");
      }, 450);
      return;
    }
    let nuevo = false;
    if (puntos > record){
      record = puntos; nuevo = true;
      recEl.textContent = pad3(record);
      setTimeout(() => suena("record"), 700);
      guarda("hmt2-bypass", String(record));
    }
    // la partida oficial queda lista para registrarse, si pasó la prueba
    const paso = prueba?.estado === "ok";
    if (partida.oficial && puntos > 0 && torneoAbierto && paso){
      envio = { token: partida.token, latidos: latidos.slice(), pasos: e.paso, puntos,
                prueba: { aparicion: prueba.aparicion } };
      abreFormulario();
    }
    setTimeout(() => {
      if (estado !== "paro") return;
      const fin = `${pad3(puntos)} válvulas cruzadas.${nuevo ? " Nuevo récord." : ""}`;
      const nota = !partida.oficial ? " (Sin conexión: esta partida no cuenta para la tabla.)"
        : paso ? " Prueba del monitor superada: puedes registrarla."
        : prueba?.estado === "falla" || prueba?.estado === "activa" ? " No pasaste la prueba del monitor: esta partida no entra a la tabla."
        : ` Para entrar a la tabla, llega a la prueba del monitor (entre la válvula ${M.PRUEBA.desde} y la ${M.PRUEBA.hasta}) y pásala.`;
      const porque = motivo === "furia" ? " La furia del gusano te alcanzó."
                   : motivo === "virus" ? " Un virus del gusano alcanzó el pulso."
                   : " El reflejo ya se armó.";
      muestra(motivo === "valvula" ? "PARO" : "INFECTADO", fin + porque + nota, "TOCA PARA REANIMAR");
      $("j-ir-tabla").hidden = !(completo && envio);
    }, 450);
  }

  /* ── dibujo ────────────────────────────────────────────────── */
  function dibuja(){
    ctx.clearRect(0, 0, W, H);
    // el velo va antes del espejo: mientras la escena gira, el fondo no se encoge
    ctx.fillStyle = velo;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (sacudida > 0) ctx.translate(Math.round((Math.random() - .5) * 4), Math.round((Math.random() - .5) * 3));
    if (espejo !== 1){
      ctx.translate(W / 2, H / 2);
      ctx.scale(espejo, espejo);
      ctx.translate(-W / 2, -H / 2);
    }

    // cuadrícula de papel de ECG, desplazándose
    ctx.fillStyle = "rgba(79,134,238,.12)";
    const o = Math.floor(e.fondoX) % 10;
    for (let x = -o; x < W; x += 10) ctx.fillRect(x, 0, 1, SUELO);
    for (let y = 5; y < SUELO; y += 10) ctx.fillRect(0, y, W, 1);

    // durante el aviso de la furia, la pantalla late en rojo
    if (e.furia && e.furia.t < FURIA.aviso && !quieto){
      ctx.fillStyle = `rgba(255,51,85,${(.06 + .06 * Math.sin(e.furia.t * 22)).toFixed(3)})`;
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }

    for (const v of e.valvulas) valvula(v);
    dibujaGusano();
    ctx.fillStyle = "rgba(255,51,85,.35)";
    for (const z of e.virus){
      ctx.fillRect(Math.round(z.x + 3), Math.round(z.y), 3, 1);       // estela
      ctx.drawImage(spriteVirus(Math.floor(z.t / .15) % 2), Math.round(z.x - 2), Math.round(z.y - 2));
    }

    // suelo: una raíz que corre con brotes cada tanto
    ctx.fillStyle = C.verdeDim; ctx.fillRect(0, SUELO, W, 1);
    ctx.fillStyle = C.cuerpo;   ctx.fillRect(0, SUELO + 1, W, H - SUELO - 1);
    const s = Math.floor(e.fondoX) % 13;
    for (let x = -s; x < W; x += 13){
      ctx.fillStyle = C.verde;
      ctx.fillRect(x, SUELO - 1, 1, 1); ctx.fillRect(x + 1, SUELO - 2, 1, 1);
      ctx.fillStyle = C.dim; ctx.fillRect(x + 6, SUELO + 1, 1, 1);
    }

    // el rastro de ECG
    if (rastro.length > 1){
      ctx.lineJoin = "round";
      ctx.strokeStyle = estado === "paro" ? C.sangre : C.phos;
      if (!ligero){ ctx.globalAlpha = .25; ctx.lineWidth = 3; trazaRastro(); }
      ctx.globalAlpha = .9;  ctx.lineWidth = 1; trazaRastro();
      ctx.globalAlpha = 1;
    }

    // el pulso
    const y = plano ? plano.y : e.pulso.y;
    ctx.drawImage(spritePulso(estado === "paro", !!pulsoVerde()), Math.round(e.pulso.x - 3), Math.round(y - 3));

    for (const c of chispas){
      ctx.globalAlpha = Math.min(1, c.v * 2);
      ctx.fillStyle = c.c; ctx.fillRect(Math.round(c.x), Math.round(c.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    if (destello > 0){
      ctx.fillStyle = `rgba(255,51,85,${(destello / .25 * .35).toFixed(2)})`;
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }
    ctx.restore();
    dibujaPrueba();
  }

  function trazaRastro(){
    ctx.beginPath();
    rastro.forEach((r, i) => i ? ctx.lineTo(r.x + .5, r.y + .5) : ctx.moveTo(r.x + .5, r.y + .5));
    ctx.stroke();
  }

  function dibujaGusano(){
    const g = e.gusano;
    const enojado = !!e.furia && estado === "jugando";
    const temblor = n => enojado && !quieto ? Math.round((Math.random() - .5) * n) : 0;
    const gx = Math.round(g.x - 10) + temblor(3), gy = Math.round(g.y - 12) + temblor(2);
    const cargando = (g.carga > 0 && estado === "jugando") || enojado;
    const parpadeo = cargando && Math.floor((enojado ? e.furia.t : g.carga) * 16) % 2 === 0;
    const tinta = enojado ? (parpadeo ? "furiaLuz" : "furia")
                : cargando ? (parpadeo ? "cargaLuz" : "carga") : "calma";
    ctx.fillStyle = "rgba(10,7,12,.7)";
    ctx.fillRect(gx - 1, gy - 1, 22, 26);
    ctx.drawImage(spriteGusano(Math.floor(reloj / .35) % 2, tinta), gx, gy);
    if (cargando){
      const n = enojado ? 3 + (parpadeo ? 2 : 0) : Math.ceil((1 - g.carga / CARGA) * 4);
      ctx.fillStyle = C.sangre;
      ctx.fillRect(gx - n, gy + 12, n, 2);
    }
  }

  function valvula(v){
    const x = Math.round(v.x), arriba = Math.round(v.centro - v.hueco / 2), abajo = Math.round(v.centro + v.hueco / 2);
    for (const [y0, y1, boca] of [[0, arriba, arriba - 3], [abajo, SUELO, abajo]]){
      if (y1 <= y0) continue;
      ctx.fillStyle = C.cuerpo;  ctx.fillRect(x, y0, ANCHO, y1 - y0);
      ctx.fillStyle = C.azulDim; ctx.fillRect(x, y0, 1, y1 - y0); ctx.fillRect(x + ANCHO - 1, y0, 1, y1 - y0);
      ctx.fillStyle = C.verdeDim;
      ctx.fillRect(x + v.pista, y0, 1, y1 - y0);
      ctx.fillRect(x + ANCHO - 1 - Math.floor(v.pista / 2), y0, 1, y1 - y0);
      ctx.fillStyle = v.mueve ? C.azul : C.phos;
      ctx.fillRect(x - 2, boca, ANCHO + 4, 3);
      ctx.fillStyle = C.hi;
      ctx.fillRect(x + 2, boca + 1, 1, 1); ctx.fillRect(x + ANCHO - 3, boca + 1, 1, 1);
    }
    for (const h of v.hojas){
      const y0 = h.arriba ? 0 : abajo + 3, y1 = h.arriba ? arriba - 3 : SUELO;
      if (y1 - y0 < 6) continue;
      const y = Math.round(y0 + 2 + h.y * (y1 - y0 - 4));
      const hx = h.lado < 0 ? x - 2 : x + ANCHO;
      ctx.fillStyle = h.hi ? C.verdeHi : C.verde;
      ctx.fillRect(hx, y, 2, 1);
      ctx.fillRect(h.lado < 0 ? hx - 1 : hx + 1, y - 1, 2, 1);
    }
  }

  /* ── mensajes ──────────────────────────────────────────────── */
  function muestra(t, cuerpo, tec){
    tit.textContent = t; txt.textContent = cuerpo; tecla.textContent = tec;
    $("j-ir-tabla").hidden = true;
    msg.hidden = false;
  }
  const esconde = () => { msg.hidden = true; };

  /* ── controles ─────────────────────────────────────────────── */
  function late(){
    if (repeticion){
      if (estado === "pausa"){ estado = "jugando"; esconde(); arranca(); }
      else if (estado === "listo" || (estado === "paro" && enParo >= .5)) empiezaRepeticion();
      return;
    }
    if (estado === "listo") empieza();
    else if (estado === "pausa"){ estado = "jugando"; esconde(); }
    else if (estado === "paro"){
      if (enParo < .5) return;            // que no se reinicie por un toque de más
      empieza();
    }
    latePendiente = true;                 // el motor lo toma en su siguiente paso
    arranca();
  }

  // Se late tocando cualquier parte de la pantalla del juego (en pantalla
  // completa eso incluye las franjas de arriba y abajo), menos los botones.
  const pantalla = cv.parentElement;
  pantalla.addEventListener("pointerdown", ev => {
    if (ev.target.closest("button")) return;
    if (!$("j-carga").hidden) return;              // mientras carga, no
    ev.preventDefault();
    cv.focus({ preventScroll: true });
    late();
  });
  cv.addEventListener("keydown", ev => {
    if (ev.code === "KeyM" && !ev.repeat){ window.Sonido?.alterna(); return; }
    if (ev.code === "Space" || ev.code === "ArrowUp" || ev.code === "KeyW" || ev.code === "Enter"){
      ev.preventDefault();
      if (!ev.repeat) late();
    }
  });

  /* ── el bucle: solo con el juego a la vista ────────────────── */
  let visible = true, corriendo = false, antes = 0, acumulado = 0;

  function arranca(){
    if (corriendo || !visible || document.visibilityState !== "visible") return;
    corriendo = true;
    antes = performance.now();
    requestAnimationFrame(cuadro);
  }
  function cuadro(t){
    if (!corriendo) return;
    acumulado += Math.min(.1, (t - antes) / 1000);
    antes = t;
    while (acumulado >= DT){
      if (estado === "jugando") pasoJuego(); else pasoAdorno();
      acumulado -= DT;
    }
    dibuja();
    if (estado === "pausa" || (quieto && estado === "listo") || (estado === "paro" && enParo > 2)){
      corriendo = false; return;
    }
    requestAnimationFrame(cuadro);
  }
  function detiene(){
    corriendo = false;
    if (estado === "jugando"){
      estado = "pausa";
      muestra("PAUSA", `${pad3(e.puntos)} válvulas cruzadas. El pulso te espera.`, "TOCA PARA SEGUIR");
    }
  }

  let primeraVez = true;
  if ("IntersectionObserver" in window){
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting || completo;
      if (visible && primeraVez){ primeraVez = false; pidePartida(); cargaTabla(); }
      visible ? arranca() : detiene();
    }, { threshold: .2 }).observe(caja);
  } else { pidePartida(); cargaTabla(); }
  document.addEventListener("visibilitychange", () => {
    document.visibilityState === "visible" ? arranca() : detiene();
  });

  let rz = null;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(medir, completo ? 60 : 150); });

  /* ════════════════════════════════════════════════════════
     LEADERBOARD
     ════════════════════════════════════════════════════════ */
  let pidiendo = false;
  function pidePartida(){
    if (!RUTA || pidiendo || siguiente) return;
    pidiendo = true;
    fetch(RUTA + "/partida", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.cerrado){ torneoCerrado(); return; }
        if (d && d.token) siguiente = { token: d.token, semilla: d.semilla >>> 0, pedida: Date.now() };
      })
      .catch(() => {})
      .finally(() => { pidiendo = false; });
  }

  function torneoCerrado(){
    torneoAbierto = false;
    form.hidden = true;
    cierreEl.textContent = "· TORNEO CERRADO";
  }

  /* — la tabla: de 5 en 5, con los finalistas marcados — */
  let pagina = 1, paginas = 1, porPagina = 5, pidiendoTabla = 0;
  function cargaTabla(n = pagina){
    if (!RUTA){ pintaTabla(null); return; }
    const turno = ++pidiendoTabla;           // si llegan desordenadas, gana la última
    topEl.setAttribute("aria-busy", "true");
    fetch(`${RUTA}/puntajes?pagina=${n}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (turno === pidiendoTabla) pintaTabla(d); })
      .catch(() => { if (turno === pidiendoTabla) pintaTabla(null); });
  }
  bAnt.addEventListener("click", () => { if (pagina > 1) cargaTabla(pagina - 1); });
  bSig.addEventListener("click", () => { if (pagina < paginas) cargaTabla(pagina + 1); });

  function pintaTabla(d){
    topEl.textContent = "";
    topEl.removeAttribute("aria-busy");
    if (!d || !Array.isArray(d.filas)){
      pagEl.hidden = true;
      topEl.innerHTML = '<li class="vacio">LA TABLA NO ESTÁ DISPONIBLE AHORA.</li>';
      return;
    }
    pagina = d.pagina; paginas = d.paginas; porPagina = d.porPagina || porPagina;
    pagEl.hidden = paginas < 2;
    pagTxt.textContent = `${pagina} / ${paginas}`;
    bAnt.disabled = pagina <= 1;
    bSig.disabled = pagina >= paginas;
    if (d.abierto === false) torneoCerrado();
    else if (d.cierre){
      const f = new Date(d.cierre);
      if (!Number.isNaN(f.getTime()))
        cierreEl.textContent = "· CIERRA " + f.toLocaleDateString("es-MX", { day: "numeric", month: "short" }).toUpperCase();
    }
    if (!d.filas.length){
      topEl.innerHTML = '<li class="vacio">NADIE HA REGISTRADO UN PULSO. LOS 8 LUGARES ESTÁN LIBRES.</li>';
      return;
    }
    const mio = (lee("hmt2-alias") || "").toUpperCase();
    const corte = d.finalistas || 8;
    d.filas.forEach(f => {
      const li = document.createElement("li");
      li.classList.toggle("finalista", f.lugar <= corte);
      li.classList.toggle("primero", f.lugar === 1);
      if (mio && f.alias === mio) li.classList.add("mio");
      const n = document.createElement("span"); n.className = "n";  n.textContent = String(f.lugar).padStart(2, "0");
      const a = document.createElement("span"); a.className = "a";  a.textContent = f.alias;
      const p = document.createElement("span"); p.className = "p";  p.textContent = pad3(f.puntos);
      li.append(n, a, p);
      topEl.appendChild(li);
      // la raya del corte, justo debajo del último finalista
      if (f.lugar === corte){
        const raya = document.createElement("li");
        raya.className = "corte";
        raya.textContent = `\u25B2 LOS ${corte} DE ARRIBA VAN A LA DINÁMICA`;
        topEl.appendChild(raya);
      }
    });
  }

  /* — registrar una partida — */
  const ALIAS_OK = /^[A-Z0-9ÁÉÍÓÚÜÑ _.\-]{2,14}$/;
  const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function abreFormulario(){
    formPts.textContent = pad3(envio.puntos);
    form.alias.value  = form.alias.value  || lee("hmt2-alias")  || "";
    form.correo.value = form.correo.value || lee("hmt2-correo") || "";
    formMsg.textContent = ""; formMsg.className = "juego__aviso";
    form.querySelector("button").disabled = false;
    form.hidden = false;
  }
  const avisa = (t, error) => {
    formMsg.textContent = t;
    formMsg.className = "juego__aviso " + (error ? "err" : "ok");
  };

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!envio) return;
    const alias  = form.alias.value.trim().replace(/\s+/g, " ").toUpperCase();
    const correo = form.correo.value.trim().toLowerCase();
    if (!ALIAS_OK.test(alias))   return avisa("EL ALIAS VA DE 2 A 14 LETRAS, NÚMEROS O ESPACIOS.", true);
    if (!CORREO_OK.test(correo)) return avisa("EL CORREO NO ES VÁLIDO.", true);

    const boton = form.querySelector("button");
    boton.disabled = true;
    avisa("... EL SERVIDOR ESTÁ REVISANDO LA PARTIDA");
    try {
      const r = await fetch(RUTA + "/puntaje", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...envio, alias, correo, empresa: form.empresa.value }),     // incluye prueba.aparicion
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok){
        avisa(d.mensaje || "NO SE PUDO REGISTRAR LA PARTIDA.", true);
        if (r.status === 403) torneoCerrado();
        if (r.status !== 409 && r.status !== 403) boton.disabled = false;
        return;
      }
      guarda("hmt2-alias", alias);
      guarda("hmt2-correo", correo);
      envio = null;                       // esta partida ya quedó; el botón espera a la siguiente
      suena("registro");
      avisa(d.mejor > d.puntos
        ? `REGISTRADA CON ${pad3(d.puntos)}. TU MEJOR SIGUE SIENDO ${pad3(d.mejor)}: LUGAR #${d.posicion}.`
        : `REGISTRADA: ${pad3(d.puntos)} · LUGAR #${d.posicion}.`);
      cargaTabla(Math.ceil(d.posicion / porPagina));     // la página donde quedó
    } catch {
      avisa("NO HAY CONEXIÓN CON EL SERVIDOR. INTENTA DE NUEVO.", true);
      boton.disabled = false;
    }
  });

  if (!RUTA){
    cierreEl.textContent = "· SIN CONEXIÓN";
  }

  /* ════════════════════════════════════════════════════════
     REPETICIONES (desde el panel)
     El panel abre la portada con #repeticion=ID. Con la sesión del panel
     abierta en esta pestaña, se pide la partida y se reproduce.
     ════════════════════════════════════════════════════════ */
  function empiezaRepeticion(){
    e = M.crea(repeticion.semilla);
    repeticion.i = 0;
    prueba = null;
    latidos = []; rastro = []; chispas = [];
    destello = sacudida = 0; plano = null; enParo = 0;
    espejo = espejoDesde = espejoHacia = 1; giroT = 1;
    escondeGiro(); terminaFuria();
    ptsEl.textContent = pad3(0);
    estado = "jugando";
    caja.dataset.estado = "jugando";
    esconde();
    arranca();
  }
  (function abreRepeticion(){
    const m = location.hash.match(/^#repeticion=([\w-]+)$/);
    let token = null;
    try { token = sessionStorage.getItem("hmt_token"); } catch {}
    if (!m || !token || !RUTA) return;
    fetch(`${RUTA}/puntajes?repeticion=${m[1]}`, { headers: { authorization: "Bearer " + token }, cache: "no-store" })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d.mensaje || "NO SE PUDO ABRIR LA REPETICIÓN.");
        repeticion = { alias: d.alias, puntos: d.puntos, semilla: d.semilla >>> 0,
                       latidos: d.latidos, aparicion: d.aparicion, prueba: d.prueba, i: 0 };
        caja.dataset.repeticion = "";
        $("juego-nombre").textContent = `REPETICIÓN \u00B7 ${d.alias} \u00B7 ${pad3(d.puntos)}`;
        caja.scrollIntoView({ block: "center" });
        muestra("REPETICIÓN", `La partida de ${d.alias}: ${pad3(d.puntos)} válvulas. Se reproduce tal cual la jugó.`, "TOCA PARA VERLA");
      })
      .catch(err => muestra("REPETICIÓN", err.message, "TOCA PARA JUGAR"));
  })();

  /* ════════════════════════════════════════════════════════
     PANTALLA COMPLETA
     ════════════════════════════════════════════════════════ */
  const raizDoc = document.documentElement;
  const carga = $("j-carga"), barra = $("j-barra"), pasoTxt = $("j-paso");
  let nativo = false;          // true: la pidió el navegador; false: la simulamos

  const pideCompleta = el => (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: "hide" });
  const salDeCompleta = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  const enCompleta = () => document.fullscreenElement || document.webkitFullscreenElement;

  // Vertical sin bloqueo de orientación (iPhone): se gira el juego entero.
  const vertical = () => innerHeight > innerWidth;

  function acomodaCompleto(){
    const girado = vertical();
    caja.classList.toggle("juego--girado", girado);
    // el espacio útil, ya contando el giro y la barra de arriba
    const aw = girado ? innerHeight : innerWidth;
    const ah = (girado ? innerWidth : innerHeight) - caja.querySelector(".juego__head").offsetHeight;
    const k = Math.max(1, Math.min(aw / W, ah / H));
    cv.style.width  = Math.floor(W * k) + "px";
    cv.style.height = Math.floor(H * k) + "px";
    $("j-gira").hidden = !girado;
    dibuja();
  }

  const espera = ms => new Promise(r => setTimeout(r, ms));
  // n cuadros seguidos; si se da `cada`, se llama en cada uno. Devuelve
  // el promedio de milisegundos por cuadro.
  const cuadros = (n, cada) => new Promise(r => {
    let t0 = null, i = 0;
    requestAnimationFrame(function f(t){
      if (t0 === null) t0 = t;
      if (cada) cada();
      if (++i < n) requestAnimationFrame(f); else r((t - t0) / Math.max(1, n - 1));
    });
  });

  async function entra(){
    if (completo) return;
    // Lo primero, sin esperar nada: el navegador solo concede la pantalla
    // completa dentro del mismo toque.
    let pedida = null;
    try { pedida = pideCompleta(caja); } catch {}
    completo = true;
    window.Sonido?.toca("latido");
    if (estado === "jugando") detiene();
    caja.classList.add("juego--completo");
    raizDoc.classList.add("juego-completo");
    window.dispatchEvent(new CustomEvent("juego-completo", { detail: true }));
    msg.hidden = true;
    carga.hidden = false;
    const t0 = performance.now();
    const avanza = (pct, texto) => { barra.style.width = pct + "%"; pasoTxt.textContent = texto; };

    avanza(10, "ESTERILIZANDO PANTALLA\u2026");
    try { await pedida; nativo = !!enCompleta(); } catch { nativo = false; }
    try { await screen.orientation?.lock?.("landscape"); } catch {}
    await espera(250);                 // que la rotación y las barras se acomoden
    acomodaCompleto();

    avanza(35, "CONECTANDO EL PULSO\u2026");
    precalienta();
    pidePartida();                     // la semilla de la próxima partida, por adelantado
    await cuadros(2);

    avanza(60, "AFINANDO EL MONITOR\u2026");
    window.Sonido?.toca("alarma");
    await cuadros(2);

    avanza(85, "MIDIENDO EL RITMO\u2026");
    // 30 cuadros de prueba con la escena real: si el teléfono no llega
    // cómodo a ~45 cuadros por segundo, modo ligero (sin partículas ni
    // brillo del rastro).
    const ms = await cuadros(30, () => { pasoAdorno(); dibuja(); });
    ligero = ms > 22;
    caja.dataset.ligero = ligero ? "si" : "no";

    avanza(100, ligero ? "MODO LIGERO \u00B7 LISTO" : "LISTO");
    await espera(Math.max(250, 1100 - (performance.now() - t0)));   // que se alcance a leer
    carga.hidden = true;
    acomodaCompleto();
    if (estado === "pausa" || estado === "listo")
      muestra(estado === "pausa" ? "PAUSA" : "BYPASS",
              estado === "pausa" ? `${pad3(e.puntos)} válvulas cruzadas. El pulso te espera.`
                                 : "Toca en cualquier parte de la pantalla para latir.",
              estado === "pausa" ? "TOCA PARA SEGUIR" : "TOCA PARA LATIR");
    else if (estado === "paro") msg.hidden = false;
    cv.focus({ preventScroll: true });
    arranca();
  }

  function sale(){
    if (!completo) return;
    completo = false;
    if (estado === "jugando") detiene();
    try { screen.orientation?.unlock?.(); } catch {}
    if (enCompleta()) try { salDeCompleta(); } catch {}
    nativo = false;
    carga.hidden = true;
    caja.classList.remove("juego--completo", "juego--girado");
    raizDoc.classList.remove("juego-completo");
    window.dispatchEvent(new CustomEvent("juego-completo", { detail: false }));
    $("j-ir-tabla").hidden = true;
    medir();
  }

  $("j-completa").addEventListener("click", entra);
  $("j-fs").addEventListener("click", entra);
  $("j-salir").addEventListener("click", sale);
  $("j-ir-tabla").addEventListener("click", () => {
    sale();
    form.scrollIntoView({ block: "center" });
    setTimeout(() => form.alias.focus({ preventScroll: true }), 300);
  });
  // si la persona sale con el gesto del sistema (atrás, Esc), seguimos su paso
  ["fullscreenchange", "webkitfullscreenchange"].forEach(ev =>
    document.addEventListener(ev, () => { if (completo && nativo && !enCompleta()) sale(); }));
  addEventListener("keydown", ev => { if (ev.key === "Escape" && completo && !nativo) sale(); });
  addEventListener("orientationchange", () => { if (completo) setTimeout(acomodaCompleto, 200); });

  /* — el interruptor del sonido, en la cabecera — */
  const bSon = $("j-sonido");
  if (bSon && window.Sonido){
    bSon.addEventListener("click", () => window.Sonido.alterna());
    window.Sonido.alCambiar(si => {
      bSon.setAttribute("aria-pressed", String(si));
      bSon.textContent = si ? "SONIDO: SÍ" : "SONIDO: NO";
    });
  } else if (bSon) bSon.hidden = true;

  medir();
  arranca();
})();
