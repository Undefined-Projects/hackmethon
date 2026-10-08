/* ============================================================
   HACK(ME)THON 2.0 — sonido
   ────────────────────────────────────────────────────────────
   Efectos sintetizados con Web Audio, al estilo de una consola de
   8 bits: osciladores cuadrados, senos y ráfagas de ruido. No hay
   archivos de audio: todo se genera al momento y pesa cero.

   Reglas:
   - Nada suena hasta que la persona toca algo (los navegadores lo
     exigen, y además es lo correcto). El primer clic o tecla
     despierta el audio.
   - Hay un solo interruptor, que se recuerda en este navegador. El
     botón vive en la cabecera de BYPASS; la tecla M en el juego
     también lo cambia.
   - La página casi no suena por su cuenta: solo el monitor cuando el
     paciente entra en paro (el pitido plano) y cuando revive. Todo lo
     demás es del minijuego, que es donde uno está tocando.

   Uso: Sonido.toca("latido"), Sonido.alterna(), Sonido.activo,
        Sonido.alCambiar(fn).
   ============================================================ */
(function sonido(){
  let ctx = null, master = null, ruido = null;
  let activo = true;
  try { activo = localStorage.getItem("hmt2-sonido") !== "no"; } catch {}
  const oyentes = [];

  function abre(){
    if (ctx){
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    // Un compresor al final: varios efectos a la vez nunca saturan.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = .32;
    master.connect(comp); comp.connect(ctx.destination);
    // un segundo de ruido blanco, reutilizable
    ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  // el primer gesto despierta el audio (en captura: antes que el juego)
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    window.addEventListener(ev, () => { if (activo) abre(); }, { capture: true, passive: true }));

  /* ── piezas ─────────────────────────────────────────────── */
  // Un tono con barrido de frecuencia y envolvente: sube rápido, se
  // sostiene si se pide y cae en curva.
  function tono({ tipo = "square", f0, f1 = f0, dur, vol = .3, ataque = .005, sostener = 0, en = 0 }){
    const t = ctx.currentTime + en;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + ataque);
    if (sostener) g.gain.setValueAtTime(vol, t + dur * sostener);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + .03);
  }
  // Una ráfaga de ruido filtrado: golpes, soplidos, crujidos.
  function soplo({ dur, vol = .2, f = 1200, f1 = f, q = 1, filtro = "bandpass", en = 0 }){
    const t = ctx.currentTime + en;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = ruido;
    fl.type = filtro; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f1 !== f) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master);
    s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  }
  const arpegio = (notas, paso, op) => notas.forEach((f, i) => tono({ f0: f, en: i * paso, ...op }));

  /* ── el catálogo ────────────────────────────────────────── */
  const SFX = {
    // BYPASS
    latido:    () => tono({ tipo: "sine", f0: 880, f1: 1040, dur: .075, vol: .32 }),
    punto:     () => { tono({ f0: 660, dur: .06, vol: .14 }); tono({ f0: 990, dur: .1, vol: .14, en: .06 }); },
    carga:     () => tono({ tipo: "sawtooth", f0: 80, f1: 300, dur: .45, vol: .09, ataque: .08 }),
    disparo:   () => { tono({ f0: 760, f1: 130, dur: .15, vol: .13 }); soplo({ dur: .07, vol: .08, f: 3200 }); },
    absorbe:   () => soplo({ dur: .14, vol: .14, f: 1600, f1: 500, q: 2 }),
    furia:     () => {
      for (let i = 0; i < 3; i++){
        tono({ f0: 540, dur: .13, vol: .14, en: i * .3 });
        tono({ f0: 400, dur: .13, vol: .14, en: i * .3 + .15 });
      }
      tono({ tipo: "sawtooth", f0: 58, f1: 44, dur: 1.05, vol: .18, ataque: .15, sostener: .6 });
    },
    muro:      () => { soplo({ dur: .28, vol: .3, f: 260, f1: 80, q: .7, filtro: "lowpass" });
                       tono({ f0: 120, f1: 50, dur: .24, vol: .18 }); },
    choque:    () => { soplo({ dur: .32, vol: .32, f: 900, f1: 150, q: .8 });
                       tono({ f0: 420, f1: 55, dur: .45, vol: .2 });
                       SFX.plano(.55, 1.3); },
    infectado: () => { arpegio([740, 590, 470, 370, 250], .055, { dur: .07, vol: .14 });
                       soplo({ dur: .3, vol: .2, f: 2400, f1: 300, q: 1.5, en: .05 });
                       SFX.plano(.55, 1.3); },
    record:    () => arpegio([523, 659, 784, 1047, 1319], .085, { dur: .11, vol: .13 }),
    giro:      () => { soplo({ dur: .45, vol: .18, f: 300, f1: 3000, q: 3 });
                       tono({ tipo: "triangle", f0: 220, f1: 880, dur: .22, vol: .16 });
                       tono({ tipo: "triangle", f0: 880, f1: 220, dur: .22, vol: .16, en: .22 }); },
    registro:  () => arpegio([784, 1047, 1568], .09, { tipo: "triangle", dur: .14, vol: .22 }),
    // el monitor
    plano:     (en = 0, dur = 2.4) => tono({ tipo: "sine", f0: 1000, dur, vol: .16, ataque: .01, sostener: .85, en }),
    alarma:    () => { tono({ tipo: "triangle", f0: 960, dur: .16, vol: .16 });
                       tono({ tipo: "triangle", f0: 960, dur: .16, vol: .16, en: .24 }); },
    vuelta:    () => { tono({ tipo: "sine", f0: 880, dur: .09, vol: .22 });
                       tono({ tipo: "sine", f0: 1175, dur: .14, vol: .22, en: .12 }); },
  };

  window.Sonido = {
    toca(nombre, ...args){
      if (!activo || !ctx || !SFX[nombre]) return;
      try { SFX[nombre](...args); } catch {}
    },
    get activo(){ return activo; },
    alterna(){
      activo = !activo;
      try { localStorage.setItem("hmt2-sonido", activo ? "si" : "no"); } catch {}
      if (activo){ abre(); SFX.latido(); }
      else if (ctx) ctx.suspend().catch(() => {});
      oyentes.forEach(fn => fn(activo));
      return activo;
    },
    alCambiar(fn){ oyentes.push(fn); fn(activo); },
  };
})();
