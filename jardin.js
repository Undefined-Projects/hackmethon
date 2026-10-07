/* ============================================================
   HACK(ME)THON 2.0 — el jardín
   ────────────────────────────────────────────────────────────
   La máquina no se construyó: creció. Todo lo vegetal de la página
   sale de un solo generador: un trazo que avanza como una pista de
   circuito impreso (solo giros de 45°) pero se ramifica como una
   planta. Las hojas son de clorofila, las puntas son puntos de
   soldadura o flores, y de vez en cuando un componente se sienta
   sobre la pista.

   Con ese generador se siembran cinco cosas:
     1. el corazón del espécimen y sus raíces, en la portada
     2. las enredaderas en los bordes de cada panel, que crecen con
        el scroll y son más tupidas mientras más abajo esté el panel
     3. el micelio entre panel y panel, por donde viaja el gusano
     4. la textura de nervaduras del fondo
   (las láminas de los seis sistemas son SVG fijo en index.html)

   Rendimiento: enredaderas y micelio se pintan en <canvas> (dos por
   panel, uno por hueco), no en SVG: eran ~6 400 elementos y cada
   cuadro de scroll los recalculaba. El título y las raíces del
   corazón siguen en SVG porque son pocos. Lo que no está a la vista
   no se repinta ni se anima.

   Con el paciente en paro todo se marchita a rojo; al revivirlo,
   vuelve a brotar desde la raíz.

   Todo usa azar con semilla: la misma página siempre crece igual,
   y un cambio de tamaño de ventana no reacomoda la maleza al azar.
   ============================================================ */
(function jardin(){
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS     = "http://www.w3.org/2000/svg";
  const tubo   = document.querySelector(".tubo");
  const raiz   = getComputedStyle(document.documentElement);
  const tono   = (n, d) => raiz.getPropertyValue(n).trim() || d;

  /* ── azar con semilla (mulberry32) ─────────────────────── */
  function azar(semilla){
    let a = semilla >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  function el(tag, attrs, padre){
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(n);
    return n;
  }

  /* ── el generador ─────────────────────────────────────────
     Ocho direcciones a 45°, con y hacia abajo:
       0 →  1 ↘  2 ↓  3 ↙  4 ←  5 ↖  6 ↑  7 ↗
     Devuelve las piezas con su distancia a la raíz (d), que es lo
     que permite hacerlas crecer en orden. */
  const DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  const hacia = (dir, meta) => {
    const dif = (meta - dir + 8) % 8;
    return dif === 0 ? dir : dif <= 4 ? (dir + 1) % 8 : (dir + 7) % 8;
  };

  function crece(o){
    const r = o.rnd;
    const out = { tallos: [], hojas: [], vias: [], flores: [], chips: [] };
    let presupuesto = o.max || 200;
    const [x0, y0, x1, y1] = o.caja;
    const dentro = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

    out.vias.push({ x: o.x, y: o.y, d: 0, raiz: true });

    function rama(x, y, dir, d, prof){
      const pts = [[x, y]], d0 = d, hijos = [];
      const n = o.largo[0] + Math.floor(r() * (o.largo[1] - o.largo[0] + 1));
      for (let i = 0; i < n && presupuesto > 0; i++){
        if (r() < o.giro) dir = (dir + (r() < .5 ? 1 : 7)) % 8;
        if (o.sesgo != null && r() < (o.tiron ?? .35)) dir = hacia(dir, o.sesgo);
        const L = o.paso[0] + r() * (o.paso[1] - o.paso[0]);
        let paso = null;
        // Si la pista se sale de su caja, prueba a doblar antes de rendirse:
        // así en un margen angosto la planta trepa pegada al marco.
        for (const t of [0, 1, 7, 2, 6]){
          const dd = (dir + t) % 8, [dx, dy] = DIRS[dd];
          const k = dx && dy ? L / Math.SQRT2 : L;
          const nx = Math.round(x + dx * k), ny = Math.round(y + dy * k);
          if (dentro(nx, ny)){ paso = [nx, ny, dd]; break; }
        }
        if (!paso) break;
        d += Math.hypot(paso[0] - x, paso[1] - y);
        [x, y, dir] = paso;
        presupuesto--;
        pts.push([x, y]);
        if (r() < o.hoja) out.hojas.push({ x, y, dir, lado: r() < .5 ? 1 : -1, d,
                                           tam: o.tamHoja * (.7 + r() * .6) });
        if (o.chip && r() < o.chip) out.chips.push({ x, y, dir, d });
        if (prof < o.prof && r() < o.rama){
          out.vias.push({ x, y, d });
          const giro = (r() < .5 ? 1 : 7) * (r() < .6 ? 1 : 2);
          hijos.push([x, y, (dir + giro) % 8, d, prof + 1]);
        }
      }
      if (pts.length > 1){
        out.tallos.push({ pts, d0, len: d - d0, prof });
        if (r() < o.flor) out.flores.push({ x, y, d, tam: o.tamFlor || 3 });
        else out.vias.push({ x, y, d, punta: true });
      }
      hijos.forEach(h => rama(...h));
    }
    rama(o.x, o.y, o.dir, 0, 0);
    return out;
  }

  /* ── dibujar una planta en un <svg> ────────────────────────
     Cada tallo es una polilínea que se "dibuja" con stroke-dashoffset;
     cada pieza (hoja, flor, vía, chip) aparece cuando el crecimiento
     llega a su distancia. */
  function planta(svg, p, clase){
    const g = el("g", { class: "planta " + (clase || "") }, svg);
    const tallos = p.tallos.map(t => {
      const n = el("polyline", {
        points: t.pts.map(q => q.join(",")).join(" "),
        class: "tallo tallo--" + Math.min(t.prof, 3),
      }, g);
      const len = t.len + 2;
      n.style.strokeDasharray = len;
      n.style.strokeDashoffset = len;
      return { el: n, d0: t.d0, len, pts: t.pts };
    });

    const piezas = [];
    for (const h of p.hojas){
      // Una hoja: rombo que sale perpendicular a la pista, con la
      // punta un poco hacia adelante. A 45° se ve pixelada, que es la idea.
      const [fx, fy] = DIRS[h.dir], fl = Math.hypot(fx, fy);
      const [px, py] = DIRS[(h.dir + 2 * h.lado + 8) % 8], pl = Math.hypot(px, py);
      const F = [fx / fl, fy / fl], P = [px / pl, py / pl], s = h.tam;
      const pt = (a, b) => `${(h.x + P[0] * a + F[0] * b).toFixed(1)},${(h.y + P[1] * a + F[1] * b).toFixed(1)}`;
      const n = el("polygon", {
        class: "hoja pieza",
        points: [pt(0, 0), pt(s * .5, s * .38), pt(s, s * .3), pt(s * .45, -s * .12)].join(" "),
      }, g);
      piezas.push({ el: n, d: h.d });
    }
    for (const c of p.chips){
      const n = el("rect", {
        class: "chip pieza", x: c.x - 3.5, y: c.y - 2, width: 7, height: 4,
        transform: `rotate(${c.dir * 45} ${c.x} ${c.y})`,
      }, g);
      piezas.push({ el: n, d: c.d });
    }
    for (const v of p.vias){
      const n = el("circle", {
        class: "via pieza" + (v.punta ? " via--punta" : "") + (v.raiz ? " via--raiz" : ""),
        cx: v.x, cy: v.y, r: v.punta ? 1.8 : 2.4,
      }, g);
      piezas.push({ el: n, d: v.d });
    }
    for (const f of p.flores){
      // Flor de pixel: cuatro pétalos cuadrados alrededor de un centro.
      const s = f.tam, fg = el("g", { class: "flor pieza" }, g);
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]])
        el("rect", { class: "flor__p", x: f.x + dx * s - s / 2, y: f.y + dy * s - s / 2, width: s, height: s }, fg);
      el("rect", { class: "flor__c", x: f.x - s / 2, y: f.y - s / 2, width: s, height: s }, fg);
      piezas.push({ el: fg, d: f.d });
    }
    const dmax = Math.max(1, ...p.tallos.map(t => t.d0 + t.len), ...piezas.map(q => q.d));
    return { g, tallos, piezas, dmax, f: -1 };
  }

  function crecer(pl, f){
    if (Math.abs(f - pl.f) < .003) return;
    pl.f = f;
    const D = f * pl.dmax;
    for (const t of pl.tallos){
      const vis = clamp((D - t.d0) / t.len);
      t.el.style.strokeDashoffset = (t.len * (1 - vis)).toFixed(1);
    }
    for (const q of pl.piezas) q.el.classList.toggle("on", D >= q.d);
  }

  /* ── pintar en canvas ──────────────────────────────────────
     El mismo dibujo que planta() pero a pinceladas: los tallos se
     recorren hasta la distancia que toque, y cada pieza brota en tres
     pasos (como el steps(3) del CSS) cuando el crecimiento la alcanza. */
  const rgba = c => {
    if (c[0] === "#"){ const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
    const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] ?? 1];
  };
  const mezcla = (a, b, k) => {
    if (k <= 0) return a; if (k >= 1) return b;
    const A = rgba(a), B = rgba(b);
    return `rgba(${A.map((v, i) => i < 3 ? Math.round(v + (B[i] - v) * k) : +(v + (B[i] - v) * k).toFixed(3)).join(",")})`;
  };
  const T = {
    verde: tono("--clorofila", "#3ddc97"), verdeHi: tono("--clorofila-hi", "#b4f5d4"),
    verdeDim: tono("--clorofila-dim", "#23805a"), azul: tono("--blue", "#21498e"),
    azulHi: tono("--blue-hi", "#4f86ee"), azulDim: tono("--blue-dim", "#2f4a9a"),
    phos: tono("--phos", "#fa39ba"), phosHi: tono("--phos-hi", "#ffd3ee"),
    phosDim: tono("--phos-dim", "#b0559b"), violeta: tono("--violet", "#a32198"),
    uv: tono("--uv", "#d946ef"), pantalla: tono("--screen", "#0a070c"),
    sangre: tono("--sangre", "#ff3355"), sangreHi: tono("--sangre-hi", "#ffc2cc"),
  };
  const ROJO = "rgba(255,51,85,.55)";
  let marchito = 0;            // 0 vivo, 1 en paro; se anima entre los dos
  let paleta = null, paletaK = -1;
  function pal(){
    const k = Math.round(marchito * 20) / 20;
    if (k === paletaK) return paleta;
    const m = (a, b) => mezcla(a, b, k);
    paletaK = k;
    return paleta = {
      tallo: [T.verde, T.verde, T.verdeDim, T.azulDim].map(c => m(c, ROJO)),
      hifa:  [T.violeta, T.verdeDim, T.azulDim, T.azulDim].map(c => m(c, ROJO)),
      hoja:  [T.verde, T.verdeHi, T.verdeDim].map(c => m(c, "#5a1626")),
      via: T.pantalla, viaBorde: m(T.phos, T.sangre), punta: m(T.phosDim, T.sangre),
      raiz: m(T.phos, T.sangre), raizBorde: m(T.phosHi, T.sangreHi),
      chip: m(T.azul, "#3a0d18"), chipBorde: m(T.azulHi, T.sangre),
      petalo: [T.uv, T.violeta], centro: T.phosHi, flor: 1 - .82 * k,
      pulso: m(T.phosHi, T.sangreHi),
    };
  }

  // La hoja como rombo perpendicular a la pista, igual que en planta().
  function puntosHoja(h){
    const [fx, fy] = DIRS[h.dir], fl = Math.hypot(fx, fy);
    const [px, py] = DIRS[(h.dir + 2 * h.lado + 8) % 8], pl = Math.hypot(px, py);
    const F = [fx / fl, fy / fl], P = [px / pl, py / pl], s = h.tam;
    return [[0, 0], [s * .5, s * .38], [s, s * .3], [s * .45, -s * .12]]
      .map(([a, b]) => [P[0] * a + F[0] * b, P[1] * a + F[1] * b]);
  }
  function preparar(p){
    p.hojas.forEach(h => { h.poly = puntosHoja(h); });
    p.tallos.forEach(t => {
      t.segs = [];
      for (let i = 1; i < t.pts.length; i++)
        t.segs.push(Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]));
      t.len = t.segs.reduce((a, b) => a + b, 0);
    });
    p.dmax = Math.max(1, ...p.tallos.map(t => t.d0 + t.len),
                      ...[p.hojas, p.vias, p.flores, p.chips].flat().map(q => q.d));
    return p;
  }
  // Traza un tallo desde la distancia a hasta la b, medidas desde su inicio.
  function tramo(ctx, t, a, b){
    let acc = 0, dentro = false;
    ctx.beginPath();
    for (let i = 0; i < t.segs.length; i++){
      const [x0, y0] = t.pts[i], [x1, y1] = t.pts[i + 1], L = t.segs[i];
      if (acc + L >= a && acc <= b){
        const u0 = clamp((a - acc) / L), u1 = clamp((b - acc) / L);
        const ax = x0 + (x1 - x0) * u0, ay = y0 + (y1 - y0) * u0;
        if (!dentro){ ctx.moveTo(ax, ay); dentro = true; }
        ctx.lineTo(x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1);
      }
      acc += L;
      if (acc > b) break;
    }
    if (dentro) ctx.stroke();
  }
  const brote = (D, d) => Math.ceil(clamp((D - d) / 12) * 3) / 3;

  function pintaPlanta(ctx, p, f, hifa){
    const P = pal(), D = f * p.dmax;
    ctx.lineCap = "square"; ctx.lineJoin = "miter";
    for (const t of p.tallos){
      if (D <= t.d0) continue;
      const k = Math.min(t.prof, 3);
      ctx.strokeStyle = (hifa ? P.hifa : P.tallo)[k];
      ctx.lineWidth = hifa ? 1.5 : [2.5, 2, 2, 1.5][k];
      tramo(ctx, t, 0, D - t.d0);
    }
    p.hojas.forEach((h, i) => {
      const s = brote(D, h.d); if (!s) return;
      ctx.fillStyle = P.hoja[i % 3 === 2 ? 1 : i % 4 === 3 ? 2 : 0];
      ctx.beginPath();
      h.poly.forEach(([a, b], j) => j ? ctx.lineTo(h.x + a * s, h.y + b * s) : ctx.moveTo(h.x, h.y));
      ctx.fill();
    });
    for (const c of p.chips){
      const s = brote(D, c.d); if (!s) continue;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.dir * Math.PI / 4); ctx.scale(s, s);
      ctx.fillStyle = P.chip; ctx.fillRect(-3.5, -2, 7, 4);
      ctx.strokeStyle = P.chipBorde; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -2, 7, 4);
      ctx.restore();
    }
    for (const v of p.vias){
      const s = brote(D, v.d); if (!s) continue;
      ctx.beginPath(); ctx.arc(v.x, v.y, (v.punta ? 1.8 : 2.4) * s, 0, Math.PI * 2);
      if (v.punta){ ctx.fillStyle = P.punta; ctx.fill(); continue; }
      ctx.fillStyle = v.raiz ? P.raiz : P.via; ctx.fill();
      ctx.strokeStyle = v.raiz ? P.raizBorde : P.viaBorde; ctx.lineWidth = 1.4; ctx.stroke();
    }
    ctx.globalAlpha = P.flor;
    p.flores.forEach((fl, i) => {
      const s = brote(D, fl.d) * fl.tam; if (!s) return;
      ctx.fillStyle = P.petalo[i % 2];
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]])
        ctx.fillRect(fl.x + dx * s - s / 2, fl.y + dy * s - s / 2, s, s);
      ctx.fillStyle = P.centro; ctx.fillRect(fl.x - s / 2, fl.y - s / 2, s, s);
    });
    ctx.globalAlpha = 1;
  }

  /* Un lienzo a resolución 1:1. En pantallas retina se ve con pixel
     doble, que es justo el look; y gasta la cuarta parte de memoria. */
  function lienzo(padre, x, y, w, h, clase){
    const c = document.createElement("canvas");
    c.className = clase;
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    c.style.cssText = `left:${x}px;top:${y}px;width:${c.width}px;height:${c.height}px`;
    padre.prepend(c);
    return c.getContext("2d");
  }

  /* Todo lo que crece se registra aquí. Cada maceta sabe pintarse
     (dibuja) a su crecimiento f; meta es a dónde va f. */
  const macetas = [];
  const vistas = new Set();     // macetas en pantalla
  const ojo = "IntersectionObserver" in window ? new IntersectionObserver(es => {
    for (const e of es){
      const m = macetas.find(q => q.el === e.target);
      if (!m) continue;
      e.isIntersecting ? vistas.add(m) : vistas.delete(m);
    }
    // Lo que acaba de entrar a la vista se mide y se pinta ya, sin
    // esperar al siguiente scroll (un salto por ancla no lo genera).
    riega(false);
    despierta();
  }, { rootMargin: "120px 0px" }) : null;

  function registra(m){
    m.pintado = -1;
    macetas.push(m);
    if (ojo) ojo.observe(m.el); else vistas.add(m);
    return m;
  }
  // todas: también las que no se ven. forzar: aunque f no haya cambiado
  // (por ejemplo, porque cambió el color).
  function riegaTodo(todas, forzar){
    for (const m of (todas ? macetas : vistas)){
      if (todas || forzar || m.f !== m.pintado || m.animado){ m.dibuja(); m.pintado = m.f; }
    }
  }

  /* El bucle de animación solo corre cuando hace falta: pulsos del
     micelio en pantalla, la transición de marchitarse o el rebrote. */
  let girando = false, transicion = null;
  function despierta(){
    if (girando || quieto) return;
    const hay = transicion || [...vistas].some(m => m.animado);
    if (!hay || document.visibilityState !== "visible") return;
    girando = true;
    requestAnimationFrame(gira);
  }
  function gira(t){
    if (transicion && transicion(t) === false) { transicion = null; riegaTodo(true); }
    for (const m of vistas) if (m.animado) m.t = t;
    riegaTodo(false, !!transicion);
    const sigue = transicion || [...vistas].some(m => m.animado);
    if (sigue && document.visibilityState === "visible") requestAnimationFrame(gira);
    else girando = false;
  }
  document.addEventListener("visibilitychange", despierta);

  /* ════════════════════════════════════════════════════════
     1. EL CORAZÓN DEL ESPÉCIMEN
     Pixel art hecho con matemáticas, no a mano: la silueta es la
     curva del corazón (x²+y²−1)³ − x²y³ ≤ 0, inclinada como uno
     de verdad; el sombreado va por tramos de fósforo con tramado
     Bayer, como el cartel; y la esquina de abajo está abierta en
     disección y deja ver el circuito. Arriba, los vasos son cables
     y de la vena brota un tallo con una flor.
     ════════════════════════════════════════════════════════ */
  const especimen = (function(){
    const fig = document.querySelector(".especimen");
    if (!fig) return null;
    const cv  = fig.querySelector(".especimen__px");
    const svg = fig.querySelector(".especimen__raices");
    const GW = 38, GH = 46;

    const C = {
      hi: tono("--phos-hi", "#ffd3ee"), m: tono("--phos", "#fa39ba"),
      v:  tono("--violet", "#a32198"),  b: tono("--blue", "#21498e"),
      c:  tono("--blue-hi", "#4f86ee"), k: tono("--screen-3", "#1a0e20"),
      kk: tono("--screen", "#0a070c"),  f: tono("--uv", "#d946ef"),
      g:  tono("--clorofila", "#3ddc97"), gh: tono("--clorofila-hi", "#b4f5d4"),
      gd: tono("--clorofila-dim", "#23805a"), bd: tono("--blue-dim", "#2f4a9a"),
    };
    const px = new Array(GW * GH).fill(null);
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < GW && y < GH) px[y * GW + x] = c; };
    const get = (x, y) => (x >= 0 && y >= 0 && x < GW && y < GH) ? px[y * GW + x] : null;
    const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

    /* — los vasos, detrás del corazón — */
    // Un cable grueso con sombreado de tubo: orilla clara, centro, orilla oscura.
    function cable(x, y0, y1, ancho, tonos){
      for (let y = y0; y <= y1; y++) for (let i = 0; i < ancho; i++)
        set(x + i, y, tonos[Math.min(tonos.length - 1, Math.floor(i * tonos.length / ancho))]);
    }
    function cableH(x0, x1, y, alto, tonos){
      for (let x = x0; x <= x1; x++) for (let i = 0; i < alto; i++)
        set(x, y + i, tonos[Math.min(tonos.length - 1, Math.floor(i * tonos.length / alto))]);
    }
    // aorta: sube, hace el arco y baja por detrás. El arco es un
    // medio anillo grueso; el tono va por radio para que se lea tubo.
    {
      const ax = 21, ay = 13, R = 6;
      for (let y = 4; y <= 13; y++) for (let x = 13; x <= 29; x++){
        const d = Math.hypot(x + .5 - ax, y + .5 - ay);
        if (y + .5 > ay || d < R - 1.6 || d > R + 1.6) continue;
        set(x, y, d > R + .7 ? "hi" : d > R - .5 ? "m" : "v");
      }
      cable(13, 13, 21, 4, ["hi", "m", "m", "v"]);     // ascendente
      cable(26, 13, 18, 3, ["v", "b", "b"]);           // descendente, detrás
    }
    // del arco salen tres cables hacia arriba, con su conector
    for (const [x, y] of [[17, 3], [20, 1], [23, 2]]){
      const tope = { 17: 6, 20: 5, 23: 5 }[x];
      cable(x, y + 1, tope, 2, ["m", "v"]);
      set(x, y, "c"); set(x + 1, y, "c"); set(x, y - 1, "hi");
    }
    // vena cava: la sangre de regreso va en azul
    cable(8, 13, 23, 3, ["c", "b", "b"]);

    /* — el corazón — */
    const cx = 18.5, cy = 31, s = 12.8, rot = -.34;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const F = (u, v) => (u * u + v * v - 1) ** 3 - u * u * v ** 3;
    const uv = (x, y) => {
      const X = (x + .5 - cx) / s, Y = -(y + .5 - cy) / s;
      return [X * cs - Y * sn, X * sn + Y * cs];
    };
    const dentro = (x, y) => F(...uv(x, y)) <= 0;
    // la ventana de disección: abajo a la derecha (en coordenadas de pantalla)
    const corte = (x, y) => ((x - cx) * .55 + (y - cy) * .84) / s > .12;

    let apice = [0, 0];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++){
      if (!dentro(x, y)) continue;
      if (y >= apice[1]) apice = [x, y];
      if (corte(x, y)){ set(x, y, "k"); continue; }
      const [u, v] = uv(x, y);
      // Luz desde arriba a la izquierda, más un poco de volumen hacia el centro.
      const luz = 1 - Math.hypot(u + .45, v - .55) / 2.2;
      const vol = clamp(-F(u, v) * 4);
      const t = .7 * luz + .3 * vol + (BAYER[y % 4][x % 4] / 16 - .5) * .16;
      set(x, y, t > .80 ? "hi" : t > .54 ? "m" : t > .36 ? "v" : "b");
    }
    // surco interventricular: una costura que baja en diagonal
    for (let i = 0; i < 16; i++){
      const x = Math.round(17 + i * .45), y = 21 + i;
      if (dentro(x, y) && !corte(x, y)) set(x, y, get(x, y) === "hi" ? "m" : "v");
    }

    // la orilla del corte: tejido expuesto, en fósforo intenso
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++){
      if (!dentro(x, y) || !corte(x, y)) continue;
      if ([[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => dentro(x + a, y + b) && !corte(x + a, y + b)))
        set(x, y, "hi");
    }
    // adentro del corte: circuito. Pistas a 45° y 90°, con vías y un chip.
    {
      const r = azar(77);
      const abiertos = [];
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++)
        if (dentro(x, y) && corte(x, y) && get(x, y) === "k") abiertos.push([x, y]);
      for (let k = 0; k < 16 && abiertos.length; k++){
        let [x, y] = abiertos[Math.floor(r() * abiertos.length)];
        let dir = [0, 2, 1, 4][Math.floor(r() * 4)];
        const tinta = r() < .5 ? "c" : "g";
        for (let i = 0; i < 12; i++){
          if (!dentro(x, y) || !corte(x, y) || get(x, y) === "hi" || get(x, y) === "m") break;
          set(x, y, tinta);
          if (r() < .3) dir = (dir + (r() < .5 ? 1 : 7)) % 8;
          x += DIRS[dir][0]; y += DIRS[dir][1];
        }
        if (dentro(x, y) && corte(x, y) && get(x, y) !== "hi") set(x, y, "m");
      }
      // un chip incrustado
      for (let y = 36; y < 40; y++) for (let x = 20; x < 25; x++)
        if (dentro(x, y) && corte(x, y)) set(x, y, y === 36 || x === 20 ? "c" : "bd");
    }

    /* — la planta: brota de la vena cava, con flor arriba — */
    for (let y = 3; y <= 12; y++) set(y < 7 ? 8 : 9, y, y < 7 ? "g" : "gd");
    // hojas
    for (const [x, y, c] of [[10,9,"g"],[11,9,"gh"],[11,8,"g"],[12,8,"g"],
                             [7,6,"g"],[6,6,"gh"],[6,5,"g"],[5,5,"g"],
                             [10,11,"gd"],[11,12,"g"]]) set(x, y, c);
    // flor
    for (const [x, y, c] of [[8,0,"f"],[7,1,"f"],[9,1,"f"],[8,2,"f"],[8,1,"hi"],
                             [7,0,"v"],[9,2,"v"]]) set(x, y, c);

    /* — pintar al canvas — */
    let celda = 5;
    function pinta(){
      celda = window.innerWidth < 700 ? 4 : 5;
      cv.width = GW * celda; cv.height = GH * celda;
      cv.style.width = cv.width + "px"; cv.style.height = cv.height + "px";
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < px.length; i++){
        const c = px[i];
        if (!c) continue;
        ctx.fillStyle = C[c];
        ctx.fillRect((i % GW) * celda, Math.floor(i / GW) * celda, celda, celda);
        // rayado del tubo dentro de cada pixel, como el resto del fósforo
        ctx.fillStyle = "rgba(0,0,0,.28)";
        ctx.fillRect((i % GW) * celda, Math.floor(i / GW) * celda + celda - 1, celda, 1);
      }
    }

    /* — las raíces: del ápice hasta el monitor — */
    let raices = null, chispas = [];
    function siembra(){
      svg.innerHTML = "";
      // Las raíces bajan hasta lo que sigue al corazón: el minijuego
      // (o el monitor, si el juego no estuviera).
      const monitor = document.getElementById("juego") || document.getElementById("monitor");
      const fr = fig.getBoundingClientRect(), cr = cv.getBoundingClientRect();
      const ax = cr.left - fr.left + (apice[0] + .5) * celda;
      const ay = cr.top - fr.top + (apice[1] - 1) * celda;
      const fondo = monitor ? monitor.getBoundingClientRect().top - fr.top + 2 : ay + 60;
      // Si el corazón quedó encima del texto (pantalla angosta), las raíces
      // no bajan hasta el monitor: se quedan en el hueco bajo la figura.
      const apilado = getComputedStyle(fig.parentElement).gridTemplateColumns.split(" ").length < 2;
      const alto = apilado ? Math.max(24, fr.bottom - fr.top - ay + 30) : Math.max(30, fondo - ay);
      const ancho = Math.max(fr.width, 180);
      svg.style.top = ay + "px";
      svg.setAttribute("width", ancho);
      svg.setAttribute("height", alto);
      svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
      const r = azar(2026);
      const plantas = [];
      for (let k = 0; k < 3; k++){
        const p = crece({
          x: Math.round(ax), y: 0, dir: [3, 2, 1][k], rnd: r,
          // el largo depende de cuánto haya que bajar: así siempre llegan
          caja: [4, 0, ancho - 4, alto], paso: [7, 12],
          largo: [Math.max(3, Math.round(alto / 18)), Math.max(7, Math.round(alto / 8))],
          giro: .4, rama: .3, prof: 1, sesgo: 2, tiron: .45,
          hoja: .3, tamHoja: 6, flor: .1, tamFlor: 2.5, chip: 0, max: 80,
        });
        plantas.push(planta(svg, p, "raiz"));
      }
      raices = { plantas, f: 1 };
      plantas.forEach(p => crecer(p, 1));
      // copias para el pulso de luz que baja con cada latido
      chispas = plantas.flatMap(p => p.tallos.filter(t => t.d0 === 0).map(t => {
        const n = el("polyline", { points: t.el.getAttribute("points"), class: "chispa" }, svg);
        n.style.strokeDasharray = `10 ${t.len + 20}`;
        n.style.strokeDashoffset = 10;
        return { el: n, len: t.len, d0: t.d0 };
      }));
    }

    // Fuera de pantalla no late: ni el corazón ni la luz de las raíces.
    let enVista = true;
    if ("IntersectionObserver" in window)
      new IntersectionObserver(([e]) => { enVista = e.isIntersecting; }).observe(fig);

    pinta();
    return {
      siembra,
      pinta,
      get raices(){ return raices; },
      latido(mutado){
        if (quieto || !enVista) return;
        cv.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.045)" }, { transform: "scale(1)" }],
          { duration: 320, easing: "ease-out" });
        // la luz baja por las raíces, rama por rama, en orden de distancia
        for (const c of chispas){
          c.el.animate(
            [{ strokeDashoffset: 10, opacity: 1 }, { strokeDashoffset: -c.len, opacity: .9 }],
            { duration: 520 + c.len * 4, easing: "ease-in" });
        }
        fig.classList.toggle("mutado", !!mutado);
      },
    };
  })();

  /* ════════════════════════════════════════════════════════
     2. LAS ENREDADERAS DE LOS PANELES
     Nacen soldadas al marco y crecen hacia el margen. En escritorio
     hay margen de sobra y se abren; en un teléfono hay 16 px y
     trepan pegadas al marco. Mientras más abajo el panel, más
     semillas y más hondas las ramas.
     ════════════════════════════════════════════════════════ */
  const paneles = [...document.querySelectorAll("main > .panel")];

  function libre(panel){
    const cs  = getComputedStyle(panel);
    const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
    const pr  = panel.getBoundingClientRect();
    const tr  = tubo ? tubo.getBoundingClientRect() : { left: 0 };
    const tp  = tubo ? parseFloat(getComputedStyle(tubo).paddingLeft) : 0;
    const margen = (pr.left + padL) - (tr.left + tp);
    return { padL, padR, W: panel.clientWidth - padL - padR, margen };
  }

  function siembraPanel(panel, i, f){
    panel.querySelectorAll(":scope > .enredadera").forEach(c => c.remove());
    const { padL, W, margen } = libre(panel);
    const H = panel.offsetHeight;
    const M = Math.round(clamp(margen - 6, 8, 230));
    const amplio = M > 60;
    // Coordenadas como si fuera un solo lienzo de W + 2M; se pintan en
    // dos franjas, una por margen, para no reservar el panel entero.
    const ORILLA = 14, PAD = 14;
    const capas = [
      { ctx: lienzo(panel, padL - M, -PAD, M + ORILLA, H + 2 * PAD, "enredadera"), ox: 0, plantas: [] },
      { ctx: lienzo(panel, padL + W - ORILLA, -PAD, M + ORILLA, H + 2 * PAD, "enredadera"), ox: -(M + W - ORILLA), plantas: [] },
    ];

    const r = azar(1000 + i * 7919);
    const semillas = amplio ? 2 + i : 1 + Math.ceil(i / 2);
    for (let s = 0; s < semillas; s++){
      const izq = s % 2 === 0;
      const y = Math.round(H * (.06 + .88 * r()));
      capas[izq ? 0 : 1].plantas.push(preparar(crece({
        x: izq ? M : M + W, y,
        dir: izq ? [4, 3, 5][Math.floor(r() * 3)] : [0, 1, 7][Math.floor(r() * 3)],
        rnd: r,
        caja: izq ? [3, 3, M + 2, H - 3] : [M + W - 2, 3, W + 2 * M - 3, H - 3],
        paso: amplio ? [8, 16] : [6, 10],
        largo: [3 + (i >> 1), 6 + i],
        giro: .3,
        rama: amplio ? .38 : .22,
        prof: Math.min(3, 1 + (i >> 1) + (amplio ? 1 : 0)),
        hoja: .6, tamHoja: amplio ? 10 : 6,
        flor: .1 + i * .035, tamFlor: amplio ? 3 : 2.4,
        chip: amplio ? .06 : 0,
        max: amplio ? 70 + i * 22 : 40 + i * 6,
      })));
    }
    const m = { el: panel, f: f ?? 0, meta: f ?? 0 };
    m.dibuja = () => {
      for (const c of capas){
        const { ctx } = c;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.setTransform(1, 0, 0, 1, c.ox, PAD);
        for (const p of c.plantas) pintaPlanta(ctx, p, m.f, false);
      }
    };
    return m;
  }

  /* ════════════════════════════════════════════════════════
     3. EL MICELIO ENTRE PANELES
     Hifas que bajan del pie de un panel a la barra del siguiente.
     Por ellas corre de vez en cuando un pulso: el gusano pasando.
     Solo se anima el que está en pantalla.
     ════════════════════════════════════════════════════════ */
  const micelios = paneles.map(panel => {
    const m = document.createElement("div");
    m.className = "micelio";
    m.setAttribute("aria-hidden", "true");
    panel.before(m);
    return m;
  });

  function tejeMicelio(caja, i, f){
    caja.innerHTML = "";
    const pad = parseFloat(getComputedStyle(caja).paddingLeft);
    const W = caja.clientWidth - pad * 2, H = caja.clientHeight;
    const m = { el: caja, f: f ?? 0, meta: f ?? 0, dibuja(){} };
    if (W <= 0 || H <= 0) return m;
    const ctx = lienzo(caja, pad, 0, W, H, "micelio__lienzo");
    const r = azar(500 + i * 104729);
    const hilos = W > 500 ? 4 : 2;
    const plantas = [];
    for (let k = 0; k < hilos; k++){
      const x = Math.round(W * (k + .3 + r() * .4) / hilos);
      plantas.push(preparar(crece({
        x, y: 0, dir: 2, rnd: r, caja: [2, 0, W - 2, H],
        paso: [5, 9], largo: [5, 11], giro: .45, rama: .35, prof: 2,
        sesgo: 2, tiron: .3, hoja: .07, tamHoja: 5, flor: .05, tamFlor: 2,
        max: 50,
      })));
    }
    // el pulso del gusano, solo por los tallos principales
    const pulsos = quieto ? [] : plantas.flatMap(p => p.tallos.filter(t => t.d0 === 0))
      .map(t => ({ t, periodo: 4500 + r() * 3000, fase: r() }));
    m.animado = pulsos.length > 0;
    m.t = 0;
    m.dibuja = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of plantas) pintaPlanta(ctx, p, m.f, true);
      if (!m.animado || m.f < 1) return;
      ctx.strokeStyle = pal().pulso; ctx.lineWidth = 2.5; ctx.lineCap = "square";
      for (const q of pulsos){
        const u = (m.t / q.periodo + q.fase) % 1;
        if (u > .6) continue;
        const cabeza = u / .6 * (q.t.len + 12);
        tramo(ctx, q.t, cabeza - 12, cabeza);
      }
    };
    return m;
  }

  /* ════════════════════════════════════════════════════════
     3½. EL TÍTULO
     Leve pero a la vista: de la base de algunas letras cuelgan guías
     cortas, encima de otras asoman brotes, y sobre el (ME) abre una
     flor. Las anclas salen de las celdas llenas de cada bloque █, así
     que la vegetación nace de la letra y no flota al lado. Cada bloque
     lleva su propio <svg> adentro: cuando el glitch lo desgarra, la
     planta se va con él.
     ════════════════════════════════════════════════════════ */
  const bloques = [...document.querySelectorAll(".banner__blk")];

  function enredaTitulo(f){
    const plantas = [];
    bloques.forEach((blk, b) => {
      blk.querySelector(".titulo")?.remove();
      const filas = blk.textContent.split("\n");
      const R = filas.length, Cn = Math.max(...filas.map(l => l.length));
      const W = blk.offsetWidth, H = blk.offsetHeight;
      if (!W || !H) return;
      const cw = W / Cn, ch = H / R;
      const lleno = (r, c) => (filas[r] || "")[c] === "\u2588";
      const svg = el("svg", { class: "titulo", width: W, height: H,
                              viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true" });
      blk.appendChild(svg);
      const r = azar(4242 + b * 97);
      const hoja = Math.max(4, cw * .75), paso = [cw * .9, cw * 1.5];

      // columnas con piso (fila de abajo llena) y con techo (fila de arriba llena)
      const pisos  = [...Array(Cn).keys()].filter(c => lleno(R - 1, c));
      const techos = [...Array(Cn).keys()].filter(c => lleno(0, c));
      const toma = (lista, n) => {
        const l = lista.slice(), out = [];
        while (out.length < n && l.length) out.push(l.splice(Math.floor(r() * l.length), 1)[0]);
        return out;
      };

      // guías que cuelgan: solo en el hueco bajo el título, sin tocar el subtítulo
      const banner = blk.closest(".banner");
      const hueco = banner ? parseFloat(getComputedStyle(banner).marginBottom) - 4 : ch;
      const cuelga = Math.max(ch * .5, Math.min(ch * 1.2, hueco));
      for (const c of toma(pisos, 2)){
        plantas.push(planta(svg, crece({
          x: Math.round((c + .5) * cw), y: Math.round(H - 1), dir: 2, rnd: r,
          caja: [-cw * 2, H - 1, W + cw * 2, H + cuelga],
          paso, largo: [2, 4], giro: .35, rama: .3, prof: 1, sesgo: 2, tiron: .4,
          hoja: .75, tamHoja: hoja, flor: .15, tamFlor: Math.max(2, cw * .3), max: 10,
        }), "titulo__planta"));
      }
      // brotes encima
      for (const c of toma(techos, b === 1 ? 1 : 2)){
        plantas.push(planta(svg, crece({
          x: Math.round((c + .5) * cw), y: 1, dir: [6, 5, 7][Math.floor(r() * 3)], rnd: r,
          caja: [-cw, -ch * 1.3, W + cw, 1],
          paso: [cw * .7, cw * 1.1], largo: [1, 2], giro: .4, rama: .2, prof: 1, sesgo: 6,
          hoja: .9, tamHoja: hoja * .9, flor: 0, max: 4,
        }), "titulo__planta"));
      }
      // la flor sobre el (ME)
      if (b === 1){
        const c = techos[Math.floor(techos.length / 2)] ?? Math.floor(Cn / 2);
        plantas.push(planta(svg, crece({
          x: Math.round((c + .5) * cw), y: 1, dir: 6, rnd: azar(7),
          caja: [0, -ch * 1.6, W, 1], paso: [ch * .5, ch * .6], largo: [3, 3],
          giro: 0, rama: 0, prof: 0, sesgo: 6, hoja: .7, tamHoja: hoja,
          flor: 1, tamFlor: Math.max(2.5, cw * .5), max: 3,
        }), "titulo__planta"));
      }
    });
    const m = { el: bloques[0], f: f ?? 0, meta: f ?? 0, fijo: true };
    m.dibuja = () => plantas.forEach(p => crecer(p, m.f));
    return m;
  }

  /* ════════════════════════════════════════════════════════
     4. LA TEXTURA DE FONDO
     Nervaduras de hoja hechas de pistas, casi invisibles. Va como
     fondo de .tubo con background-attachment:local, así que se
     desplaza con la página y solo asoma en márgenes y huecos.
     ════════════════════════════════════════════════════════ */
  (function textura(){
    if (!tubo) return;
    const T = 520, r = azar(31337);
    const verde = tono("--clorofila", "#3ddc97"), azul = tono("--blue-hi", "#4f86ee");
    let trazos = "";
    for (let k = 0; k < 6; k++){
      const p = crece({
        x: Math.round(r() * T), y: Math.round(r() * T), dir: Math.floor(r() * 8), rnd: r,
        caja: [0, 0, T, T], paso: [10, 22], largo: [5, 12], giro: .35, rama: .45, prof: 3,
        hoja: 0, flor: 0, max: 60,
      });
      const c = k % 2 ? azul : verde;
      for (const t of p.tallos)
        trazos += `<polyline points="${t.pts.map(q => q.join(",")).join(" ")}" stroke="${c}" stroke-opacity="${t.prof ? .05 : .08}"/>`;
      for (const v of p.vias)
        trazos += `<circle cx="${v.x}" cy="${v.y}" r="2" stroke="${c}" stroke-opacity=".08"/>`;
    }
    const svg = `<svg xmlns="${NS}" width="${T}" height="${T}" viewBox="0 0 ${T} ${T}" fill="none" stroke-width="1.5" shape-rendering="crispEdges">${trazos}</svg>`;
    tubo.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  })();

  /* ════════════════════════════════════════════════════════
     SEMBRAR, REGAR, MARCHITAR Y REBROTAR
     ════════════════════════════════════════════════════════ */
  /* Se siembra una sola vez, cuando ya llegaron las tipografías (que
     cambian las alturas). Después solo se vuelve a sembrar si cambian
     las medidas de verdad: un resize que deja todo igual no cuesta. */
  let firma = "";
  const mide = () => [tubo?.clientWidth, ...paneles.map(p => p.offsetHeight)].join(",");
  function sembrar(){
    const nueva = mide();
    if (nueva === firma) return;
    firma = nueva;
    const previas = macetas.splice(0);
    previas.forEach(m => ojo?.unobserve(m.el));
    vistas.clear();
    const fDe = el => previas.find(m => m.el === el)?.meta;
    paneles.forEach((p, i) => registra(siembraPanel(p, i, fDe(p))));
    micelios.forEach((m, i) => registra(tejeMicelio(m, i, fDe(m))));
    if (especimen){ especimen.pinta(); especimen.siembra(); }
    const titulo = registra(enredaTitulo(fDe(bloques[0])));
    if (quieto) macetas.forEach(m => { m.f = m.meta = 1; });
    riega(true);
    // La primera vez el título brota solo, poco después de cargar.
    if (!titulo.meta) setTimeout(() => { titulo.meta = 1; riega(true); }, 500);
    despierta();
  }

  /* El crecimiento de cada maceta lo marca cuánto se ha visto: empieza
     cuando asoma por abajo y termina cuando ya se recorrió casi todo.
     Nunca se encoge: lo que ya creció, creció. Solo se mide lo que
     está en pantalla. */
  function riega(todas){
    if (!tubo) return;
    const vh = tubo.clientHeight, top0 = tubo.getBoundingClientRect().top;
    for (const m of (todas ? macetas : vistas)){
      if (!quieto && !m.fijo){
        const r = m.el.getBoundingClientRect();
        const avance = clamp((vh * .95 - (r.top - top0)) / (r.height * .85 + vh * .3));
        m.meta = Math.max(m.meta, avance);
      }
      if (!rebrotando) m.f = m.meta;
    }
    if (!rebrotando) riegaTodo(todas);
  }

  let pend = false;
  (tubo || window).addEventListener("scroll", () => {
    if (pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; riega(false); });
  }, { passive: true });

  let rz = null;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { sembrar(); especimen?.siembra(); }, 180);
  });

  /* Marchitarse y rebrotar. El paro tiñe todo a rojo en 1.2 s; al
     revivir, el color vuelve y todo brota de nuevo desde la raíz. */
  let rebrotando = false;
  function cambiaEstado(paro){
    if (quieto){ marchito = paro ? 1 : 0; riegaTodo(true); return; }
    const t0 = performance.now(), desde = marchito, DUR = 1200, BROTE = 1600;
    if (!paro){ rebrotando = true; macetas.forEach(m => { m.f = 0; }); }
    transicion = t => {
      const k = clamp((t - t0) / DUR);
      marchito = desde + ((paro ? 1 : 0) - desde) * k;
      let listo = k >= 1;
      if (!paro){
        const kb = clamp((t - t0) / BROTE), e = 1 - (1 - kb) ** 3;
        macetas.forEach(m => { m.f = m.meta * e; });
        listo = kb >= 1;
        if (listo) rebrotando = false;
      }
      return listo ? false : true;
    };
    despierta();
  }
  let enParo = document.body.classList.contains("paro");
  new MutationObserver(() => {
    const ahora = document.body.classList.contains("paro");
    if (ahora !== enParo) cambiaEstado(ahora);
    enParo = ahora;
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  document.addEventListener("latido", e => especimen?.latido(e.detail?.mutado));

  // Las webfonts cambian alturas: se siembra cuando ya llegaron (o a
  // los 1.5 s, si tardan), y una sola vez.
  const fuentes = document.fonts
    ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))])
    : Promise.resolve();
  fuentes.then(sembrar, sembrar);
})();
