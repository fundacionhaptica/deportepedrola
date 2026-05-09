// JS compartido para todas las páginas de inscripción

function mostrarAviso(tipo, msg) {
  var el = document.getElementById('aviso');
  if (!el) return;
  el.className = 'aviso visible-' + tipo;
  el.textContent = msg;
}

async function checkout(payload) {
  var btn = document.getElementById('btnPagar');
  var label = btn.dataset.label || btn.textContent;
  btn.disabled = true;
  btn.innerHTML = 'Procesando<span class="spinner"></span>';

  try {
    var res = await fetch('/api/inscripciones/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = data.url || data.redirect;
  } catch (e) {
    mostrarAviso('err', e.message || 'Error al procesar. Inténtalo de nuevo.');
    btn.disabled = false;
    btn.textContent = label;
  }
}
