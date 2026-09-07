/* ============================================================
   EL TUBO
   La curvatura de la pantalla la hace un feDisplacementMap sobre
   el contenedor .tubo (ver el <svg class="filtros"> en el HTML).

   Aquí solo va la escala, porque es lo único que el CSS no puede
   poner: feDisplacementMap mide el corrimiento en píxeles, así que
   el abombado tiene que crecer con la ventana o en un monitor
   grande se vería plano y en un teléfono, deformado.

   La perilla es --curva, en styles.css. En 0 el filtro se quita
   entero — no se deja en escala 0, porque un filtro activo sigue
   rasterizando la página en cada cuadro aunque no mueva nada.
   ============================================================ */
(function tubo(){
  const caja  = document.querySelector(".tubo");
  const mapa  = document.getElementById("barril-escala");
  if (!caja || !mapa) return;

  /* Las dos capas se curvan: la que se desplaza y la que se queda. */
  const capas = [caja, document.querySelector(".tubo__fijo")].filter(Boolean);

  /* Cuánto se abomba, como fracción del tamaño de la ventana.
     0.028 da unos 30 px de corrimiento en la esquina de un monitor
     de escritorio: se ve la panza y el clic no se corre lo bastante
     como para fallarle a un botón. Subirlo arquea más y desalinea
     más el puntero; es un trueque, no un ajuste libre. */
  const K = 0.028;

  function ajustar(){
    const curva = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--curva")
    );
    const c = Number.isFinite(curva) ? curva : 1;

    if (c <= 0){
      capas.forEach(el => el.classList.remove("curvo"));
      return;
    }
    /* Un solo `scale` sirve para los dos ejes, así que se toma el
       promedio de ancho y alto: la panza sale un pelo más marcada a
       lo alto en pantallas apaisadas, que es justo como se comporta
       un tubo real. */
    const s = c * K * (caja.clientWidth + caja.clientHeight) / 2;
    mapa.setAttribute("scale", s.toFixed(2));
    capas.forEach(el => el.classList.add("curvo"));
  }

  ajustar();

  let pendiente = false;
  window.addEventListener("resize", () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; ajustar(); });
  }, { passive: true });
})();
