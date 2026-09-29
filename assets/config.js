/* Configuración única de la tienda. Cambia aquí y se actualiza en todas las páginas.
   La clave es la publishable (pública por diseño): la seguridad la pone el RLS.
   NUNCA poner aquí la service_role. */
window.WM_CONFIG = Object.freeze({
  supabaseUrl: 'https://mlaqtniujnvfxcvcourm.supabase.co',
  supabaseKey: 'sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV',
  bucket: 'tienda-fotos',
  tabla: 'tienda_productos',

  whatsapp: '34643199580',
  whatsappVisible: '643 199 580',
  email: 'comercial@whitemoon.es',
  envioEur: 4.95,
  plazo: '5-7 días laborables',
  devolucionDias: 14
});

(function () {
  var C = window.WM_CONFIG;
  var eur = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true });

  /* "24,9" -> "24,90" (sin símbolo, para componer "24,90 €") */
  window.WM_formatEur = function (n) { return eur.format(Number(n)); };

  window.WM_fotoUrl = function (ruta) {
    return C.supabaseUrl + '/storage/v1/object/public/' + C.bucket + '/' +
      String(ruta).split('/').map(encodeURIComponent).join('/');
  };

  /* Rellena los huecos marcados con data-cfg="clave" en el HTML. */
  function rellenar() {
    var valores = {
      envio: window.WM_formatEur(C.envioEur) + ' €',
      plazo: C.plazo,
      devolucion: String(C.devolucionDias),
      email: C.email,
      whatsapp: C.whatsappVisible
    };
    document.querySelectorAll('[data-cfg]').forEach(function (el) {
      var v = valores[el.getAttribute('data-cfg')];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-cfg-href="email"]').forEach(function (a) { a.href = 'mailto:' + C.email; });
    document.querySelectorAll('[data-cfg-href="whatsapp"]').forEach(function (a) { a.href = 'https://wa.me/' + C.whatsapp; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rellenar);
  else rellenar();
})();
