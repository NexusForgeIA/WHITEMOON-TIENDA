/* Tienda pública: lee las prendas activas y pinta la rejilla.
   Lectura directa a la API REST con la clave publishable (el RLS solo deja ver activo=true).
   Nada de supabase-js aquí: la tienda no necesita sesión y así pesa ~200 KB menos. */
(function () {
  'use strict';
  var C = window.WM_CONFIG;
  var $estado = document.getElementById('estado');
  var $rejilla = document.getElementById('rejilla');
  var tpl = document.getElementById('tpl-prenda');
  var MUESTRAS = { blanco: '#f4f4f6', negro: '#111114' };
  var suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.getElementById('anio').textContent = new Date().getFullYear();

  function cargar() {
    mostrarCargando();
    var url = C.supabaseUrl + '/rest/v1/' + C.tabla +
      '?select=id,nombre,descripcion,precio_eur,colores,tallas,fotos,fotos_ia' +
      '&activo=eq.true&order=orden.asc,created_at.asc';
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 12000);
    fetch(url, { headers: { apikey: C.supabaseKey, Accept: 'application/json' }, signal: ctrl.signal })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (prendas) { clearTimeout(t); pintar(prendas); })
      .catch(function (e) { clearTimeout(t); console.warn('[tienda] no se pudo cargar:', e.message); mostrarError(); });
  }

  function mostrarCargando() {
    $rejilla.hidden = true;
    $estado.hidden = false;
    $estado.replaceChildren();
    var sk = document.createElement('div'); sk.className = 'skeleton'; sk.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 3; i++) sk.appendChild(document.createElement('span'));
    var sr = document.createElement('p'); sr.className = 'sr-only'; sr.textContent = 'Cargando prendas…';
    $estado.append(sk, sr);
  }

  function mensaje(titulo, texto, boton) {
    $rejilla.hidden = true;
    $estado.hidden = false;
    var box = document.createElement('div'); box.className = 'mensaje';
    var h = document.createElement('h3'); h.textContent = titulo;
    var p = document.createElement('p'); p.textContent = texto;
    box.append(h, p);
    if (boton) box.appendChild(boton);
    $estado.replaceChildren(box);
  }

  function mostrarError() {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Reintentar';
    b.addEventListener('click', cargar);
    mensaje('No hemos podido cargar las prendas',
      'Puede ser un problema momentáneo de conexión. Prueba otra vez en unos segundos o escríbenos por WhatsApp al ' + C.whatsappVisible + '.', b);
  }

  function pintar(prendas) {
    if (!prendas.length) {
      var a = document.createElement('a');
      a.className = 'btn btn-ghost'; a.href = 'https://whitemoon.es/'; a.textContent = 'Ir a whitemoon.es';
      mensaje('Pronto novedades', 'Estamos preparando las primeras prendas. Vuelve en unos días.', a);
      return;
    }
    var frag = document.createDocumentFragment();
    prendas.forEach(function (p, i) { frag.appendChild(tarjeta(p, i)); });
    $rejilla.replaceChildren(frag);
    $estado.hidden = true;
    $estado.replaceChildren();
    $rejilla.hidden = false;
    jsonLd(prendas);
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
    opciones(li.querySelector('.op-color'), colores, 'c-' + p.id, 'color', sel, true);
    opciones(li.querySelector('.op-talla'), tallas, 't-' + p.id, 'talla', sel, false);

    var btn = li.querySelector('.btn-wa');
    var aviso = li.querySelector('.aviso-sel');
    function actualizar() {
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
    return li;
  }

  function opciones(fs, valores, prefijo, clave, sel, conMuestra) {
    if (!valores.length) return;
    fs.hidden = false;
    var cont = fs.querySelector('.chips');
    valores.forEach(function (v, i) {
      var lab = document.createElement('label'); lab.className = 'chip';
      var inp = document.createElement('input');
      inp.type = 'radio'; inp.name = prefijo; inp.value = v; inp.id = prefijo + '-' + i;
      var sp = document.createElement('span');
      var m = MUESTRAS[String(v).trim().toLowerCase()];
      if (conMuestra && m) {
        var dot = document.createElement('i'); dot.className = 'muestra'; dot.style.background = m;
        dot.setAttribute('aria-hidden', 'true'); sp.appendChild(dot);
      }
      sp.appendChild(document.createTextNode(v));
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
      img.width = 800; img.height = 1000;
      img.alt = nombre + (fotos.length > 1 ? ' · foto ' + (i + 1) + ' de ' + fotos.length : '');
      img.decoding = 'async';
      if (!(prioritaria && i === 0)) img.loading = 'lazy'; // la prioridad alta es solo para la imagen de portada
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
        return { '@type': 'ListItem', position: i + 1, item: prod };
      })
    };
    var s = document.getElementById('ld-itemlist') || document.createElement('script');
    s.type = 'application/ld+json'; s.id = 'ld-itemlist';
    s.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
    if (!s.parentNode) document.head.appendChild(s);
  }

  cargar();
})();
