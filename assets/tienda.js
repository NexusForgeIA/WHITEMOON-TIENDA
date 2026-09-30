/* Tienda pública: lee las prendas activas y pinta una rejilla por categoría.
   Lectura directa a la API REST con la clave publishable (el RLS solo deja ver activo=true).
   Nada de supabase-js aquí: la tienda no necesita sesión y así pesa ~200 KB menos.
   Una sola petición: camisetas y sudaderas se reparten en el cliente. */
(function () {
  'use strict';
  var C = window.WM_CONFIG;
  var tpl = document.getElementById('tpl-prenda');
  var MUESTRAS = { blanco: '#f4f4f6', negro: '#111' };
  var OSCURAS = { negro: true };
  var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var punteroFino = window.matchMedia('(hover: hover) and (pointer: fine)');
  var CATS = ['camiseta', 'sudadera'];
  var NOMBRES = { camiseta: 'camisetas', sudadera: 'sudaderas' };
  var $estado = {}, $rejilla = {};
  CATS.forEach(function (c) {
    $estado[c] = document.querySelector('[data-estado="' + c + '"]');
    $rejilla[c] = document.querySelector('.rejilla[data-cat="' + c + '"]');
  });
  var tocado = false;   // si la persona ya ha hecho scroll, no le recolocamos la página
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
    window.addEventListener(ev, function () { tocado = true; }, { once: true, passive: true });
  });

  document.getElementById('anio').textContent = new Date().getFullYear();

  function cargar() {
    CATS.forEach(mostrarCargando);
    var url = C.supabaseUrl + '/rest/v1/' + C.tabla +
      '?select=id,nombre,descripcion,precio_eur,colores,tallas,fotos,fotos_ia,categoria' +
      '&activo=eq.true&order=orden.asc,created_at.asc';
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 12000);
    fetch(url, { headers: { apikey: C.supabaseKey, Accept: 'application/json' }, signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (datos) { clearTimeout(t); pintar(datos); })
      .catch(function (e) { clearTimeout(t); console.warn('[tienda] no se pudo cargar:', e.message); CATS.forEach(mostrarError); });
  }

  function mostrarCargando(c) {
    $rejilla[c].hidden = true;
    $estado[c].hidden = false;
    var sk = document.createElement('div'); sk.className = 'skeleton'; sk.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 2; i++) sk.appendChild(document.createElement('span'));
    var sr = document.createElement('p'); sr.className = 'sr-only'; sr.textContent = 'Cargando ' + NOMBRES[c] + '…';
    $estado[c].replaceChildren(sk, sr);
  }

  function mostrarError(c) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Reintentar';
    b.addEventListener('click', cargar);
    var box = document.createElement('div'); box.className = 'mensaje';
    var h = document.createElement('h3'); h.textContent = 'No hemos podido cargar las ' + NOMBRES[c];
    var p = document.createElement('p');
    p.textContent = 'Puede ser un problema momentáneo de conexión. Prueba otra vez en unos segundos o escríbenos por WhatsApp al ' + C.whatsappVisible + '.';
    box.append(h, p, b);
    $rejilla[c].hidden = true;
    $estado[c].hidden = false;
    $estado[c].replaceChildren(box);
  }

  function proximamente(c) {
    var box = document.createElement('div'); box.className = 'pronto';
    var h = document.createElement('h3'); h.className = 'holo'; h.textContent = 'Próximamente';
    var p = document.createElement('p'); p.textContent = 'Estamos preparando las ' + NOMBRES[c] + '. Si quieres, te avisamos por WhatsApp cuando lleguen.';
    var a = document.createElement('a');
    a.className = 'btn btn-wa-p btn-lg'; a.target = '_blank'; a.rel = 'noopener';
    a.href = 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent('Hola, avisadme cuando estén las ' + NOMBRES[c] + ' de WhiteMoon');
    a.textContent = 'Avísame por WhatsApp cuando lleguen';
    box.append(h, p, a);
    $estado[c].hidden = false;
    $estado[c].replaceChildren(box);
    efectoEnPantalla(box);
  }

  function pintar(prendas) {
    var idx = 0;
    CATS.forEach(function (c) {
      var lista = prendas.filter(function (p) { return (p.categoria || 'camiseta') === c; });
      $rejilla[c].replaceChildren();
      if (!lista.length) { $rejilla[c].hidden = true; proximamente(c); return; }
      var frag = document.createDocumentFragment();
      lista.forEach(function (p) { frag.appendChild(tarjeta(p, idx++)); });
      $rejilla[c].appendChild(frag);
      $estado[c].hidden = true;
      $estado[c].replaceChildren();
      $rejilla[c].hidden = false;
      Array.prototype.forEach.call($rejilla[c].children, revelar);
    });
    if (prendas.length) jsonLd(prendas);
    // Enlace directo (#sudaderas…): las rejillas de arriba han crecido, se vuelve a colocar la sección.
    var destino = location.hash && document.getElementById(location.hash.slice(1));
    if (destino && !tocado) destino.scrollIntoView({ block: 'start' });
  }

  function tarjeta(p, idx) {
    var li = tpl.content.firstElementChild.cloneNode(true);
    var fotos = (p.fotos || []).filter(Boolean);
    var precioTxt = window.WM_formatEur(p.precio_eur);

    li.querySelector('.nombre').textContent = p.nombre;
    li.querySelector('.desc').textContent = p.descripcion || '';
    li.querySelector('.precio strong').textContent = precioTxt + ' €';
    if (p.fotos_ia) li.querySelector('.ia').hidden = false;

    galeria(li.querySelector('.galeria'), fotos, p.nombre, idx === 0);

    var sel = { color: null, talla: null };
    var colores = p.colores || [], tallas = p.tallas || [];
    var $elegido = li.querySelector('.elegido');
    opciones(li.querySelector('.op-color'), colores, 'c-' + p.id, 'color', sel, true);
    opciones(li.querySelector('.op-talla'), tallas, 't-' + p.id, 'talla', sel, false);

    var btn = li.querySelector('.btn-wa');
    var aviso = li.querySelector('.aviso-sel');
    function actualizar() {
      $elegido.textContent = sel.color || '';
      var faltaColor = colores.length && !sel.color;
      var faltaTalla = tallas.length && !sel.talla;
      if (faltaColor || faltaTalla) {
        btn.setAttribute('aria-disabled', 'true');
        btn.removeAttribute('href');
        aviso.textContent = faltaColor && faltaTalla ? 'Elige color y talla' : faltaColor ? 'Elige color' : 'Elige talla';
        return;
      }
      var txt = 'Hola, quiero pedir: ' + p.nombre +
        (sel.color ? ' · color ' + sel.color : '') +
        (sel.talla ? ' · talla ' + sel.talla : '') +
        ' · ' + precioTxt + ' € IVA incluido';
      btn.href = 'https://wa.me/' + C.whatsapp + '?text=' + encodeURIComponent(txt);
      btn.setAttribute('aria-disabled', 'false');
      aviso.textContent = '';
    }
    li.addEventListener('change', actualizar);
    btn.addEventListener('click', function (e) { if (btn.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
    actualizar();
    brilloPuntero(li);
    return li;
  }

  function opciones(fs, valores, prefijo, clave, sel, esColor) {
    if (!valores.length) return;
    fs.hidden = false;
    var cont = fs.querySelector('.chips');
    valores.forEach(function (v, i) {
      var lab = document.createElement('label'); lab.className = 'chip';
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = prefijo; inp.value = v; inp.id = prefijo + '-' + i;
      var sp = document.createElement('span');
      var k = String(v).trim().toLowerCase();
      var m = esColor && MUESTRAS[k];
      if (m) {
        // Bolita del color real; el nombre queda para lectores de pantalla y como tooltip.
        lab.classList.add('chip-color'); lab.title = v;
        var dot = document.createElement('i'); dot.className = 'muestra' + (OSCURAS[k] ? ' oscura' : '');
        dot.style.background = m; dot.setAttribute('aria-hidden', 'true');
        var nom = document.createElement('span'); nom.className = 'sr-only'; nom.textContent = v;
        sp.append(dot, nom);
      } else {
        sp.textContent = v;
      }
      inp.addEventListener('change', function () { if (inp.checked) sel[clave] = v; });
      lab.append(inp, sp);
      cont.appendChild(lab);
    });
    /* Si solo hay una opción, se da por elegida. */
    if (valores.length === 1) { cont.querySelector('input').checked = true; sel[clave] = valores[0]; }
  }

  function galeria(g, fotos, nombre, prioritaria) {
    var pista = g.querySelector('.pista');
    if (!fotos.length) {
      var vacio = document.createElement('div'); vacio.className = 'sin-foto'; vacio.textContent = 'Foto próximamente';
      pista.appendChild(vacio); pista.removeAttribute('tabindex');
      return;
    }
    fotos.forEach(function (ruta, i) {
      var img = document.createElement('img');
      img.src = window.WM_fotoUrl(ruta);
      img.width = 1000; img.height = 1000;
      img.alt = nombre + (fotos.length > 1 ? ' · foto ' + (i + 1) + ' de ' + fotos.length : '');
      img.decoding = 'async';
      if (!(prioritaria && i === 0)) img.loading = 'lazy'; // solo la primera foto del catálogo va sin lazy
      pista.appendChild(img);
    });
    if (fotos.length < 2) { pista.removeAttribute('tabindex'); return; }

    pista.setAttribute('aria-label', 'Fotos de ' + nombre + '. Usa las flechas para cambiar de foto.');
    var ant = g.querySelector('.ant'), sig = g.querySelector('.sig'), puntos = g.querySelector('.puntos');
    ant.hidden = sig.hidden = puntos.hidden = false;
    var dots = fotos.map(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('aria-label', 'Ver foto ' + (i + 1));
      b.addEventListener('click', function () { ir(i); });
      puntos.appendChild(b);
      return b;
    });
    function actual() { return pista.clientWidth ? Math.round(pista.scrollLeft / pista.clientWidth) : 0; }
    function ir(i) {
      var n = (i + fotos.length) % fotos.length;
      pista.scrollTo({ left: n * pista.clientWidth, behavior: suave ? 'smooth' : 'auto' });
    }
    function marcar() {
      var a = actual();
      dots.forEach(function (d, i) { d.setAttribute('aria-current', i === a ? 'true' : 'false'); });
    }
    ant.addEventListener('click', function () { ir(actual() - 1); });
    sig.addEventListener('click', function () { ir(actual() + 1); });
    pista.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); ir(actual() - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(actual() + 1); }
    });
    pista.addEventListener('scroll', marcar, { passive: true });
    marcar();
  }

  /* ItemList para buscadores/IA. Sin Offer ni price, a propósito. */
  function jsonLd(prendas) {
    var data = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Merch WhiteMoon',
      itemListElement: prendas.map(function (p, i) {
        var prod = { '@type': 'Product', name: p.nombre, brand: { '@type': 'Brand', name: 'WhiteMoon' } };
        if (p.descripcion) prod.description = p.descripcion;
        if (p.fotos && p.fotos.length) prod.image = p.fotos.map(window.WM_fotoUrl);
        if (p.colores && p.colores.length) prod.color = p.colores.join(', ');
        if (p.categoria) prod.category = p.categoria === 'sudadera' ? 'Sudaderas' : 'Camisetas';
        return { '@type': 'ListItem', position: i + 1, item: prod };
      })
    };
    var s = document.getElementById('ld-itemlist') || document.createElement('script');
    s.type = 'application/ld+json'; s.id = 'ld-itemlist';
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    if (!s.parentNode) document.head.appendChild(s);
  }

  /* ───── Efectos (nada de esto es necesario para ver o comprar) ───── */
  var io = 'IntersectionObserver' in window;

  /* Animaciones continuas solo mientras el bloque está en pantalla (.on). */
  var ioOn = io && suave ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { e.target.classList.toggle('on', e.isIntersecting); });
  }, { rootMargin: '80px' }) : null;
  function efectoEnPantalla(el) { if (ioOn) ioOn.observe(el); }
  document.querySelectorAll('.fx,.cta-final').forEach(efectoEnPantalla);

  /* Aparición: todo empieza visible. Solo se anima lo que aún está por debajo de la pantalla,
     y se dispara antes de que asome, así nunca hay nada oculto esperando. */
  var ioRv = io && suave ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('rv-in');
      ioRv.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px 12% 0px' }) : null;
  function revelar(el) {
    if (!ioRv) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 1.1) return; // ya visible o a punto: se deja quieto
    ioRv.observe(el);
  }
  document.querySelectorAll('.rv').forEach(revelar);

  /* Brillo holográfico que sigue al puntero en las tarjetas. */
  function brilloPuntero(li) {
    var raf = 0, x = 0, y = 0;
    li.addEventListener('pointermove', function (e) {
      if (!punteroFino.matches) return;
      var r = li.getBoundingClientRect();
      x = e.clientX - r.left; y = e.clientY - r.top;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        li.style.setProperty('--mx', x + 'px');
        li.style.setProperty('--my', y + 'px');
      });
    });
  }

  /* Giro 3D de la luna con el puntero: solo escritorio con puntero fino y sin movimiento reducido. */
  (function () {
    var luna = document.getElementById('luna');
    var hero = luna && luna.closest('.hero');
    var escritorio = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 901px)');
    if (!hero || !suave) return;
    var raf = 0, px = 0, py = 0;
    hero.addEventListener('pointermove', function (e) {
      if (!escritorio.matches) return;
      var r = luna.getBoundingClientRect();
      px = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      py = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        luna.style.setProperty('--ry', (Math.max(-1, Math.min(1, px)) * 16).toFixed(2) + 'deg');
        luna.style.setProperty('--rx', (Math.max(-1, Math.min(1, py)) * -14).toFixed(2) + 'deg');
      });
    });
    hero.addEventListener('pointerleave', function () {
      luna.style.setProperty('--rx', '0deg');
      luna.style.setProperty('--ry', '0deg');
    });
  })();

  /* Parallax suave de la foto de modelos (solo transform, solo mientras se ve). */
  (function () {
    var marco = document.getElementById('parallax');
    if (!marco || !suave || !io) return;
    marco.classList.add('plx');
    var visible = false, raf = 0;
    function mover() {
      raf = 0;
      var r = marco.getBoundingClientRect();
      var vh = window.innerHeight;
      var t = (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2); // -1 … 1
      marco.style.setProperty('--plx', (Math.max(-1, Math.min(1, t)) * r.height * 0.035).toFixed(1) + 'px');
    }
    function pedir() { if (visible && !raf) raf = requestAnimationFrame(mover); }
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; pedir(); }).observe(marco);
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir, { passive: true });
  })();

  cargar();
})();
