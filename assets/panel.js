/* Panel de la tienda.
   La comprobación de rol aquí es solo de interfaz: la seguridad real la ponen
   el RLS de tienda_productos y las políticas del bucket (app_metadata.role = 'staff'). */
(function () {
  'use strict';
  var C = window.WM_CONFIG;
  var T = C.tabla, B = C.bucket;
  var COLORES_BASE = ['Blanco', 'Negro'];
  var TALLAS_BASE = ['S', 'M', 'L', 'XL'];
  var CATEGORIAS = { camiseta: 'Camiseta', sudadera: 'Sudadera' };
  var MAX_LADO = 1600, CALIDAD = 0.85, MAX_BYTES = 5 * 1024 * 1024;

  var $ = function (id) { return document.getElementById(id); };
  var vistas = { login: $('v-login'), lista: $('v-lista'), form: $('v-form') };

  if (!window.supabase || !window.supabase.createClient) {
    mostrar('login');
    $('l-msg').textContent = 'No se ha podido cargar el panel. Revisa la conexión y recarga la página.';
    return;
  }

  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });

  var prendas = [];
  var filtroCat = '';   // '' = todas
  var edicion = null; // { id, nueva, fotos:[{ruta}|{blob,url}], quitadas:[], coloresExtra:[] }

  /* ───────── Utilidades ───────── */
  function mostrar(v) {
    Object.keys(vistas).forEach(function (k) { vistas[k].hidden = k !== v; });
    $('salir').hidden = v === 'login';
    window.scrollTo(0, 0);
  }
  var tAviso = 0;
  function aviso(txt, esError) {
    var el = $('aviso');
    el.textContent = txt; el.className = 'toast' + (esError ? ' error' : ''); el.hidden = false;
    clearTimeout(tAviso); tAviso = setTimeout(function () { el.hidden = true; }, esError ? 6000 : 3000);
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function textoError(e) {
    var m = (e && e.message) || String(e);
    if (/JWT|expired|401/i.test(m)) return 'La sesión ha caducado. Vuelve a entrar.';
    if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sin conexión. Comprueba internet e inténtalo otra vez.';
    return m;
  }
  /* Las escrituras bloqueadas por RLS no dan error: devuelven 0 filas. Lo tratamos como error. */
  async function escribir(q) {
    var r = await q.select('id');
    if (r.error) throw r.error;
    if (!r.data || !r.data.length) throw new Error('No se ha guardado: sin permiso o la prenda ya no existe.');
    return r.data;
  }
  var ultimoTs = 0;
  function tsUnico() { var t = Date.now(); if (t <= ultimoTs) t = ultimoTs + 1; ultimoTs = t; return t; }
  function parsePrecio(s) {
    var v = String(s).trim().replace(/\s|€/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) v = v.replace(/\./g, ''); // 1.234,50
    v = v.replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(v)) return NaN;
    return Math.round(parseFloat(v) * 100) / 100;
  }

  /* ───────── Sesión ───────── */
  async function esStaff() {
    var r = await sb.auth.getUser(); // validado contra el servidor, no solo el token local
    return !!(r.data && r.data.user && r.data.user.app_metadata && r.data.user.app_metadata.role === 'staff');
  }

  async function arrancar() {
    var s = await sb.auth.getSession();
    if (s.data && s.data.session && await esStaff()) { mostrar('lista'); cargarLista(); }
    else { if (s.data && s.data.session) await sb.auth.signOut(); mostrar('login'); }
  }

  $('f-login').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var msg = $('l-msg'), btn = ev.target.querySelector('button');
    var email = $('l-email').value.trim(), pass = $('l-pass').value;
    msg.textContent = '';
    if (!email || !pass) { msg.textContent = 'Escribe tu email y tu contraseña.'; return; }
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) {
        msg.textContent = /invalid login/i.test(r.error.message) ? 'Email o contraseña incorrectos.' : textoError(r.error);
        return;
      }
      var meta = r.data.user && r.data.user.app_metadata;
      if (!meta || meta.role !== 'staff') {
        await sb.auth.signOut();
        msg.textContent = 'Sin acceso';
        return;
      }
      $('l-pass').value = '';
      mostrar('lista');
      cargarLista();
    } catch (e) {
      msg.textContent = textoError(e);
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  $('salir').addEventListener('click', async function () {
    await sb.auth.signOut();
    prendas = []; $('lista').replaceChildren();
    mostrar('login');
  });

  sb.auth.onAuthStateChange(function (evento) {
    if (evento === 'SIGNED_OUT') mostrar('login');
  });

  /* ───────── Lista ───────── */
  async function cargarLista() {
    var est = $('lista-estado');
    est.textContent = 'Cargando…';
    var r = await sb.from(T).select('*').order('orden', { ascending: true }).order('created_at', { ascending: true });
    if (r.error) { est.textContent = 'No se pudo cargar la lista: ' + textoError(r.error); return; }
    prendas = r.data;
    est.textContent = prendas.length ? '' : 'Aún no hay prendas. Crea la primera con «Nueva prenda».';
    pintarLista();
  }

  function pintarLista() {
    var ul = $('lista'), tpl = $('tpl-fila');
    var frag = document.createDocumentFragment();
    var vista = filtroCat ? prendas.filter(function (p) { return catDe(p) === filtroCat; }) : prendas;
    if (prendas.length && !vista.length) $('lista-estado').textContent = 'No hay prendas en esta categoría.';
    else if (prendas.length) $('lista-estado').textContent = '';
    vista.forEach(function (p) {
      var li = tpl.content.firstElementChild.cloneNode(true);
      var mismaCat = prendas.filter(function (q) { return catDe(q) === catDe(p); });
      var i = mismaCat.indexOf(p);
      li.classList.toggle('oculta', !p.activo);
      var mini = li.querySelector('.miniatura');
      if (p.fotos && p.fotos.length) {
        var img = el('img'); img.src = window.WM_fotoUrl(p.fotos[0]); img.alt = ''; img.width = 64; img.height = 80; img.loading = 'lazy';
        mini.appendChild(img);
      } else mini.textContent = 'Sin foto';
      li.querySelector('.f-nombre').textContent = p.nombre;
      li.querySelector('.f-cat').textContent = CATEGORIAS[catDe(p)];
      li.querySelector('.f-precio').textContent = window.WM_formatEur(p.precio_eur) + ' €';
      var est = li.querySelector('.f-estado');
      est.textContent = p.activo ? 'Visible' : 'Oculta'; est.classList.toggle('on', p.activo);
      li.querySelector('.f-orden').textContent = 'Orden ' + p.orden;

      var bVis = li.querySelector('.a-visible');
      bVis.textContent = p.activo ? 'Ocultar' : 'Mostrar';
      var bSub = li.querySelector('.a-subir'), bBaj = li.querySelector('.a-bajar');
      bSub.setAttribute('aria-label', 'Subir ' + p.nombre); bBaj.setAttribute('aria-label', 'Bajar ' + p.nombre);
      bSub.disabled = i === 0; bBaj.disabled = i === mismaCat.length - 1;   // se ordena dentro de su categoría

      li.querySelector('.a-editar').addEventListener('click', function () { abrirForm(p); });
      bVis.addEventListener('click', function () { accion(li, cambiarVisible(p)); });
      bSub.addEventListener('click', function () { accion(li, mover(p, -1)); });
      bBaj.addEventListener('click', function () { accion(li, mover(p, 1)); });

      var acc = li.querySelector('.f-acciones'), conf = li.querySelector('.f-confirmar');
      conf.querySelector('p').textContent = '¿Borrar «' + p.nombre + '»? Se borran también sus fotos. No se puede deshacer.';
      li.querySelector('.a-borrar').addEventListener('click', function () {
        acc.hidden = true; conf.hidden = false; conf.querySelector('.c-no').focus();
      });
      conf.querySelector('.c-no').addEventListener('click', function () {
        conf.hidden = true; acc.hidden = false; li.querySelector('.a-borrar').focus();
      });
      conf.querySelector('.c-si').addEventListener('click', function () { accion(li, borrar(p)); });
      frag.appendChild(li);
    });
    ul.replaceChildren(frag);
  }

  async function accion(li, promesa) {
    li.classList.add('ocupada');
    try { var txt = await promesa; if (txt) aviso(txt); }
    catch (e) { aviso(textoError(e), true); }
    await cargarLista();
  }

  async function cambiarVisible(p) {
    await escribir(sb.from(T).update({ activo: !p.activo }).eq('id', p.id));
    return p.activo ? 'Prenda oculta' : 'Prenda visible en la tienda';
  }

  /* Reordena y renumera (10, 20, 30…) para que no haya empates. */
  function catDe(p) { return p.categoria || 'camiseta'; }

  /* Intercambia la prenda con la vecina más cercana de SU categoría y renumera todo (10, 20, 30…).
     La tienda ordena por "orden" y filtra por categoría, así que solo importa el orden relativo. */
  async function mover(p, dir) {
    var arr = prendas.slice();
    var i = arr.indexOf(p), j = i + dir;
    while (j >= 0 && j < arr.length && catDe(arr[j]) !== catDe(p)) j += dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    var cambios = [];
    arr.forEach(function (p, k) {
      var o = (k + 1) * 10;
      if (p.orden !== o) cambios.push(escribir(sb.from(T).update({ orden: o }).eq('id', p.id)));
    });
    await Promise.all(cambios);
    return '';
  }

  async function borrar(p) {
    var rutas = new Set(p.fotos || []);
    var ls = await sb.storage.from(B).list(p.id, { limit: 1000 }); // incluye fotos huérfanas de la carpeta
    if (!ls.error && ls.data) ls.data.forEach(function (o) { if (o.id) rutas.add(p.id + '/' + o.name); });
    if (rutas.size) {
      var rm = await sb.storage.from(B).remove(Array.from(rutas));
      if (rm.error) throw rm.error;
    }
    await escribir(sb.from(T).delete().eq('id', p.id));
    return 'Prenda borrada';
  }

  $('nueva').addEventListener('click', function () { abrirForm(null); });

  document.querySelectorAll('.filtro-cat button').forEach(function (b) {
    b.addEventListener('click', function () {
      filtroCat = b.getAttribute('data-f');
      document.querySelectorAll('.filtro-cat button').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      pintarLista();
    });
  });

  /* ───────── Formulario ───────── */
  function abrirForm(p) {
    liberarBlobs();
    var nueva = !p;
    edicion = {
      id: nueva ? null : p.id,
      nueva: nueva,
      fotos: nueva ? [] : (p.fotos || []).map(function (r) { return { ruta: r }; }),
      quitadas: [],
      coloresExtra: []
    };
    $('t-form').textContent = nueva ? 'Nueva prenda' : 'Editar prenda';
    $('p-oculta').hidden = !nueva;
    $('p-nombre').value = nueva ? '' : p.nombre;
    $('p-desc').value = nueva ? '' : (p.descripcion || '');
    $('p-precio').value = nueva ? '' : window.WM_formatEur(p.precio_eur).replace(/\./g, '');
    $('p-ia').checked = nueva ? false : !!p.fotos_ia;
    $('p-categoria').value = nueva ? 'camiseta' : catDe(p);
    $('p-msg').textContent = ''; $('p-fotos-msg').textContent = '';

    var colores = nueva ? [] : (p.colores || []);
    colores.forEach(function (c) {
      if (!COLORES_BASE.some(function (b) { return b.toLowerCase() === c.toLowerCase(); })) edicion.coloresExtra.push(c);
    });
    pintarChecks($('p-colores'), COLORES_BASE.concat(edicion.coloresExtra), colores, 'color');

    var tallas = nueva ? [] : (p.tallas || []);
    var tallasExtra = tallas.filter(function (t) { return TALLAS_BASE.indexOf(t) < 0; });
    pintarChecks($('p-tallas'), TALLAS_BASE.concat(tallasExtra), tallas, 'talla');

    pintarFotos();
    mostrar('form');
    $('p-nombre').focus();
  }

  function pintarChecks(cont, valores, marcados, nombre) {
    var lower = marcados.map(function (m) { return m.toLowerCase(); });
    cont.replaceChildren();
    valores.forEach(function (v) {
      var lab = el('label', 'check');
      var inp = el('input'); inp.type = 'checkbox'; inp.name = nombre; inp.value = v;
      inp.checked = lower.indexOf(v.toLowerCase()) >= 0;
      lab.append(inp, el('span', null, v));
      cont.appendChild(lab);
    });
  }
  function marcadosDe(cont) {
    return Array.from(cont.querySelectorAll('input:checked')).map(function (i) { return i.value; });
  }

  function anadirColor() {
    var inp = $('p-color-otro');
    var v = inp.value.trim().replace(/\s+/g, ' ');
    if (!v) return;
    v = v.charAt(0).toUpperCase() + v.slice(1);
    var existente = Array.from($('p-colores').querySelectorAll('input')).find(function (i) { return i.value.toLowerCase() === v.toLowerCase(); });
    if (existente) existente.checked = true;
    else {
      var marcados = marcadosDe($('p-colores')).concat(v);
      edicion.coloresExtra.push(v);
      pintarChecks($('p-colores'), COLORES_BASE.concat(edicion.coloresExtra), marcados, 'color');
    }
    inp.value = ''; inp.focus();
  }
  $('p-color-add').addEventListener('click', anadirColor);
  $('p-color-otro').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); anadirColor(); } });

  function pintarFotos() {
    var ul = $('p-fotos');
    ul.replaceChildren();
    edicion.fotos.forEach(function (f, i) {
      var li = el('li', 'foto');
      var img = el('img'); img.alt = 'Foto ' + (i + 1); img.width = 260; img.height = 325;
      img.src = f.ruta ? window.WM_fotoUrl(f.ruta) : f.url;
      var tag = el('span', 'foto-tag', (i === 0 ? 'Portada' : 'Foto ' + (i + 1)) + (f.ruta ? '' : ' · sin subir'));
      var fb = el('div', 'fb');
      var izq = el('button', null, '←'); izq.type = 'button'; izq.setAttribute('aria-label', 'Mover foto ' + (i + 1) + ' antes'); izq.disabled = i === 0;
      var der = el('button', null, '→'); der.type = 'button'; der.setAttribute('aria-label', 'Mover foto ' + (i + 1) + ' después'); der.disabled = i === edicion.fotos.length - 1;
      var qui = el('button', 'quitar', '✕'); qui.type = 'button'; qui.setAttribute('aria-label', 'Quitar foto ' + (i + 1));
      izq.addEventListener('click', function () { moverFoto(i, -1); });
      der.addEventListener('click', function () { moverFoto(i, 1); });
      qui.addEventListener('click', function () {
        var q = edicion.fotos.splice(i, 1)[0];
        if (q.ruta) edicion.quitadas.push(q.ruta); else URL.revokeObjectURL(q.url);
        pintarFotos();
      });
      fb.append(izq, der, qui);
      li.append(img, tag, fb);
      ul.appendChild(li);
    });
  }
  function moverFoto(i, dir) {
    var j = i + dir, f = edicion.fotos;
    var t = f[i]; f[i] = f[j]; f[j] = t;
    pintarFotos();
  }

  $('p-fotos-input').addEventListener('change', async function (ev) {
    var files = Array.from(ev.target.files || []);
    ev.target.value = '';
    var msg = $('p-fotos-msg');
    var rechazos = [];
    msg.className = 'msg ok'; msg.textContent = 'Preparando ' + files.length + (files.length === 1 ? ' foto…' : ' fotos…');
    for (var k = 0; k < files.length; k++) {
      var file = files[k];
      if (!/^image\//.test(file.type)) { rechazos.push(file.name + ': no es una imagen'); continue; }
      try {
        var blob = await comprimir(file);
        if (blob.type !== 'image/webp') { rechazos.push(file.name + ': este navegador no puede convertir a WebP (prueba con Chrome)'); continue; }
        if (blob.size > MAX_BYTES) { rechazos.push(file.name + ': pesa más de 5 MB incluso comprimida'); continue; }
        edicion.fotos.push({ blob: blob, url: URL.createObjectURL(blob) });
      } catch (e) {
        rechazos.push(file.name + ': no se ha podido leer la imagen');
      }
    }
    pintarFotos();
    if (rechazos.length) { msg.className = 'msg'; msg.textContent = 'No añadidas — ' + rechazos.join(' · '); }
    else msg.textContent = '';
  });

  async function decodificar(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* se prueba con <img> */ }
    }
    var url = URL.createObjectURL(file);
    try {
      var img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally { URL.revokeObjectURL(url); }
  }

  async function comprimir(file) {
    var src = await decodificar(file);
    var w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
    var s = Math.min(1, MAX_LADO / Math.max(w0, h0));
    var w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    return new Promise(function (res, rej) {
      cv.toBlob(function (b) { b ? res(b) : rej(new Error('toBlob')); }, 'image/webp', CALIDAD);
    });
  }

  function liberarBlobs() {
    if (!edicion) return;
    edicion.fotos.forEach(function (f) { if (f.url) URL.revokeObjectURL(f.url); });
  }
  function cerrarForm() { liberarBlobs(); edicion = null; mostrar('lista'); }
  $('volver').addEventListener('click', cerrarForm);
  $('p-cancelar').addEventListener('click', cerrarForm);

  $('f-prenda').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var msg = $('p-msg'); msg.textContent = '';
    var nombre = $('p-nombre').value.trim();
    var precio = parsePrecio($('p-precio').value);
    if (!nombre) { msg.textContent = 'Falta el nombre.'; $('p-nombre').focus(); return; }
    if (!(precio > 0) || precio > 100000) { msg.textContent = 'Escribe un precio válido, por ejemplo 24,90.'; $('p-precio').focus(); return; }
    var categoria = $('p-categoria').value;
    if (!CATEGORIAS[categoria]) { msg.textContent = 'Elige la categoría.'; $('p-categoria').focus(); return; }

    var btn = $('p-guardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    var id = edicion.id || crypto.randomUUID();
    var subidas = [];
    try {
      var rutas = [];
      var pendientes = edicion.fotos.filter(function (f) { return !f.ruta; }).length, hechas = 0;
      for (var i = 0; i < edicion.fotos.length; i++) {
        var f = edicion.fotos[i];
        if (f.ruta) { rutas.push(f.ruta); continue; }
        hechas++; btn.textContent = 'Subiendo foto ' + hechas + ' de ' + pendientes + '…';
        var ruta = id + '/' + tsUnico() + '.webp';
        var up = await sb.storage.from(B).upload(ruta, f.blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
        if (up.error) throw up.error;
        subidas.push(ruta); rutas.push(ruta);
      }
      btn.textContent = 'Guardando…';
      var fila = {
        nombre: nombre,
        descripcion: $('p-desc').value.trim() || null,
        precio_eur: precio,
        colores: marcadosDe($('p-colores')),
        tallas: marcadosDe($('p-tallas')),
        fotos: rutas,
        fotos_ia: $('p-ia').checked,
        categoria: categoria
      };
      if (edicion.nueva) {
        fila.id = id;
        fila.activo = false;
        fila.orden = prendas.reduce(function (m, p) { return Math.max(m, p.orden); }, 0) + 10;
        await escribir(sb.from(T).insert(fila));
      } else {
        await escribir(sb.from(T).update(fila).eq('id', id));
      }
    } catch (e) {
      if (subidas.length) await sb.storage.from(B).remove(subidas); // no dejar fotos huérfanas
      msg.textContent = 'No se ha guardado: ' + textoError(e);
      btn.disabled = false; btn.textContent = 'Guardar';
      return;
    }
    if (edicion.quitadas.length) {
      var rm = await sb.storage.from(B).remove(edicion.quitadas);
      if (rm.error) console.warn('[panel] no se pudieron borrar fotos quitadas:', rm.error.message);
    }
    btn.disabled = false; btn.textContent = 'Guardar';
    var eraNueva = edicion.nueva;
    cerrarForm();
    aviso(eraNueva ? 'Prenda creada (oculta)' : 'Cambios guardados');
    cargarLista();
  });

  arrancar().catch(function (e) { mostrar('login'); $('l-msg').textContent = textoError(e); });
})();
