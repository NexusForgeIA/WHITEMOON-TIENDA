/* Menú de la tienda: hamburguesa accesible (≤900px) y enlace activo según la sección visible.
   En /condiciones/ los enlaces van a ../#seccion y no hay secciones que vigilar: solo actúa la hamburguesa. */
(function () {
  'use strict';
  var btn = document.querySelector('.nav-toggle');
  var panel = document.getElementById('nav-panel');
  if (!btn || !panel) return;
  var etiqueta = btn.querySelector('.sr-only');
  var movil = window.matchMedia('(max-width: 900px)');

  function focoables() {
    return [btn].concat(Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled])')));
  }
  function abrir() {
    panel.classList.add('abierto');
    btn.setAttribute('aria-expanded', 'true');
    etiqueta.textContent = 'Cerrar menú';
    document.addEventListener('keydown', teclado);
    document.addEventListener('click', fuera, true);
    var primero = panel.querySelector('a[href]');
    if (primero) primero.focus();
  }
  function cerrar(devolverFoco) {
    if (btn.getAttribute('aria-expanded') !== 'true') return;
    panel.classList.remove('abierto');
    btn.setAttribute('aria-expanded', 'false');
    etiqueta.textContent = 'Abrir menú';
    document.removeEventListener('keydown', teclado);
    document.removeEventListener('click', fuera, true);
    if (devolverFoco) btn.focus();
  }
  /* Esc cierra; Tab queda atrapado entre el botón y los enlaces del panel. */
  function teclado(e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrar(true); return; }
    if (e.key !== 'Tab') return;
    var f = focoables(), i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    else if (i === -1) { e.preventDefault(); f[0].focus(); }
  }
  function fuera(e) { if (!panel.contains(e.target) && !btn.contains(e.target)) cerrar(false); }

  btn.addEventListener('click', function () {
    if (btn.getAttribute('aria-expanded') === 'true') cerrar(false); else abrir();
  });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) cerrar(false); });
  movil.addEventListener('change', function () { if (!movil.matches) cerrar(false); });

  /* Enlace activo: la última sección que ha cruzado el 40 % superior de la pantalla. */
  var links = Array.prototype.slice.call(panel.querySelectorAll('[data-sec]'));
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute('data-sec')); });
  if (!('IntersectionObserver' in window) || secs.some(function (s) { return !s; })) return;
  var activa = -1;
  function marcar(i) {
    if (i === activa) return;
    activa = i;
    links.forEach(function (a, j) { if (j === i) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  // El observador avisa cuando una sección cruza la línea del 40 %; entonces se mira cuál es la última por encima.
  var io = new IntersectionObserver(function () {
    var linea = window.innerHeight * 0.4, i = -1;
    secs.forEach(function (s, j) { if (s.getBoundingClientRect().top <= linea) i = j; });
    marcar(i);
  }, { rootMargin: '0px 0px -60% 0px' });
  secs.forEach(function (s) { io.observe(s); });
})();
