let ingresos  = [];
let socios    = [];
let secciones = [];
let equipos   = [];

const TIPOS = ['cuota','inscripcion','subvencion','donacion','adelanto_presidente','otro'];
const LABELS = {
  cuota: 'Cuota', inscripcion: 'Inscripción', subvencion: 'Subvención',
  donacion: 'Donación', adelanto_presidente: 'Adelanto presidente', otro: 'Otro',
};

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Ingresos</h1>
      <div class="actions">
        <select id="ing-tipo-fil" style="width:160px">
          <option value="">Todos los tipos</option>
          ${TIPOS.map(t => `<option value="${t}">${LABELS[t]}</option>`).join('')}
        </select>
        <input type="search" id="ing-buscar" placeholder="Buscar concepto…" style="width:190px">
        <button class="btn btn-primary" id="ing-nuevo">+ Nuevo ingreso</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th><th>Tipo</th><th>Concepto</th>
              <th>Socio</th><th>Sección</th><th>Importe</th><th>Stripe</th><th></th>
            </tr>
          </thead>
          <tbody id="ing-body"></tbody>
        </table>
      </div>
    </div>

    <dialog id="dlg-ingreso">
      <div class="dialog-header">
        <h2 id="dlg-ing-title">Nuevo ingreso</h2>
        <button class="btn-icon" id="dlg-ing-close">✕</button>
      </div>
      <form id="form-ingreso" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label>Tipo *</label>
            <select name="tipo" id="ing-tipo" required>
              ${TIPOS.map(t => `<option value="${t}">${LABELS[t]}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Fecha *</label>
            <input type="date" name="fecha" required>
          </div>
          <div class="form-group">
            <label>Importe (€) *</label>
            <input type="number" name="importe" min="0" step="0.01" required placeholder="0.00">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="grid-column:1/-1">
            <label>Concepto *</label>
            <input name="concepto" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Socio</label>
            <select name="socio_id" id="ing-socio-sel">
              <option value="">— sin socio —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Sección</label>
            <select name="seccion_id" id="ing-sec-sel">
              <option value="">— sin sección —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Equipo</label>
            <select name="equipo_id" id="ing-eq-sel">
              <option value="">— sin equipo —</option>
            </select>
          </div>
        </div>

        <!-- Donación -->
        <fieldset id="fld-donacion" style="display:none;border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:.75rem">
          <legend style="font-size:.78rem;color:var(--muted);padding:0 .3rem;font-weight:700">Datos donante</legend>
          <div class="form-row">
            <div class="form-group"><label>Nombre donante</label><input name="donante_nombre"></div>
            <div class="form-group"><label>NIF donante</label><input name="donante_nif"></div>
          </div>
          <div class="form-group" style="margin-bottom:.5rem">
            <label>Dirección donante</label><input name="donante_direccion">
          </div>
        </fieldset>

        <!-- Subvención -->
        <fieldset id="fld-subvencion" style="display:none;border:1px solid var(--border);border-radius:var(--radius);padding:.75rem;margin-bottom:.75rem">
          <legend style="font-size:.78rem;color:var(--muted);padding:0 .3rem;font-weight:700">Datos subvención</legend>
          <div class="form-row">
            <div class="form-group"><label>Organismo</label><input name="organismo"></div>
            <div class="form-group"><label>Expediente</label><input name="expediente"></div>
          </div>
        </fieldset>

        <!-- Adelanto (informativo) -->
        <div id="fld-adelanto" class="alert alert-info" style="display:none;margin-bottom:.75rem">
          ℹ️ Los adelantos del presidente se marcan automáticamente como tesorería y no computan en el balance de ingresos.
        </div>

        <div class="form-group" style="margin-bottom:.75rem">
          <label>Notas</label><textarea name="notas" rows="2"></textarea>
        </div>

        <!-- Botón Stripe cuota -->
        <div id="fld-stripe" style="display:none;border-top:1px solid var(--border);padding-top:.75rem;margin-bottom:.75rem">
          <p style="font-size:.83rem;color:var(--muted);margin-bottom:.6rem;font-weight:600">💳 Cobrar cuota por Stripe</p>
          <div class="form-row">
            <div class="form-group">
              <label>Temporada</label>
              <input id="ing-stripe-temp" placeholder="2025-26">
            </div>
            <div class="form-group">
              <label>Precio (€)</label>
              <input id="ing-stripe-precio" type="number" min="1" step="0.01" placeholder="60.00">
            </div>
          </div>
          <button type="button" class="btn btn-accent btn-sm" id="ing-stripe-btn">Generar enlace de pago</button>
          <div id="ing-stripe-result" style="margin-top:.5rem;font-size:.85rem"></div>
        </div>

        <div id="dlg-ing-error" class="alert alert-error" style="display:none"></div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="dlg-ing-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar ingreso</button>
        </div>
      </form>
    </dialog>
  `;

  document.getElementById('ing-buscar').addEventListener('input', e => filtrar(e.target.value));
  document.getElementById('ing-tipo-fil').addEventListener('change', e => filtrarTipo(e.target.value));
  document.getElementById('ing-nuevo').addEventListener('click', () => abrirDlg());
  document.getElementById('dlg-ing-close').addEventListener('click', cerrarDlg);
  document.getElementById('dlg-ing-cancel').addEventListener('click', cerrarDlg);
  document.getElementById('form-ingreso').addEventListener('submit', guardar);
  document.getElementById('ing-tipo').addEventListener('change', e => mostrarCampos(e.target.value));
  document.getElementById('ing-sec-sel').addEventListener('change', e => filtrarEquipos(e.target.value));
  document.getElementById('ing-stripe-btn').addEventListener('click', crearStripe);

  await Promise.all([cargarSelects(), cargar()]);
}

async function cargarSelects() {
  try {
    [socios, secciones, equipos] = await Promise.all([
      window.api('/socios?activo=true&limit=500'),
      window.api('/estructura/secciones'),
      window.api('/estructura/equipos'),
    ]);

    const selSocio = document.getElementById('ing-socio-sel');
    socios.forEach(s => selSocio.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${s.apellidos}, ${s.nombre}</option>`));

    const selSec = document.getElementById('ing-sec-sel');
    secciones.forEach(s => selSec.insertAdjacentHTML('beforeend',
      `<option value="${s.id}">${s.nombre}</option>`));

    filtrarEquipos('');
  } catch (err) {
    console.error(err);
  }
}

function filtrarEquipos(seccionId) {
  const sel = document.getElementById('ing-eq-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— sin equipo —</option>';
  const lista = seccionId ? equipos.filter(e => String(e.seccion_id) === String(seccionId)) : equipos;
  lista.forEach(e => sel.insertAdjacentHTML('beforeend', `<option value="${e.id}">${e.nombre}</option>`));
}

async function cargar(params = '') {
  try {
    ingresos = await window.api('/ingresos' + params);
    renderTabla(ingresos);
  } catch (err) {
    console.error(err);
  }
}

function renderTabla(lista) {
  const tbody = document.getElementById('ing-body');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Sin ingresos registrados</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(i => `
    <tr>
      <td>${i.fecha ? i.fecha.substring(0,10) : '—'}</td>
      <td><span class="badge ${badgeTipo(i.tipo)}">${LABELS[i.tipo] || i.tipo}</span></td>
      <td>${i.concepto || '—'}</td>
      <td>${i.socio_apellidos ? `${i.socio_apellidos}, ${i.socio_nombre}` : '—'}</td>
      <td>${i.seccion_nombre || '—'}</td>
      <td style="font-weight:700">${fmtEur(i.importe)}</td>
      <td>${i.stripe_session_id ? '<span class="badge badge-blue">Stripe</span>' : '—'}</td>
      <td style="white-space:nowrap">
        ${i.certificado_pdf_path ? `<button class="btn-icon" title="Certificado donación" onclick="window._verCert(${i.id})">🎗</button>` : ''}
        <button class="btn-icon" title="Editar" onclick="window._editarIngreso(${i.id})">✏️</button>
      </td>
    </tr>
  `).join('');
}

function badgeTipo(t) {
  const m = { cuota:'badge-blue', inscripcion:'badge-green', subvencion:'badge-blue', donacion:'badge-green', adelanto_presidente:'badge-orange', otro:'badge-gray' };
  return m[t] || 'badge-gray';
}

function fmtEur(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function filtrar(q) {
  const lq = q.toLowerCase();
  renderTabla(q ? ingresos.filter(i =>
    `${i.concepto || ''} ${i.socio_nombre || ''} ${i.socio_apellidos || ''}`.toLowerCase().includes(lq)
  ) : ingresos);
}

function filtrarTipo(tipo) {
  cargar(tipo ? `?tipo=${tipo}` : '');
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

let editandoId = null;

function abrirDlg(id = null) {
  editandoId = id;
  document.getElementById('form-ingreso').reset();
  document.getElementById('dlg-ing-error').style.display = 'none';
  document.getElementById('ing-stripe-result').textContent = '';
  document.getElementById('ing-socio-sel').value = '';
  document.getElementById('ing-sec-sel').value   = '';
  filtrarEquipos('');
  mostrarCampos('cuota');

  document.getElementById('dlg-ing-title').textContent = id ? 'Editar ingreso' : 'Nuevo ingreso';

  if (id) {
    cargarEnDlg(id);
  } else {
    document.getElementById('form-ingreso').elements['fecha'].value = new Date().toISOString().substring(0,10);
  }

  document.getElementById('dlg-ingreso').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-ingreso').close();
}

async function cargarEnDlg(id) {
  try {
    const ing  = await window.api(`/ingresos/${id}`);
    const form = document.getElementById('form-ingreso');
    form.elements['tipo'].value    = ing.tipo     || 'otro';
    form.elements['fecha'].value   = ing.fecha    ? ing.fecha.substring(0,10) : '';
    form.elements['importe'].value = ing.importe  || '';
    form.elements['concepto'].value = ing.concepto || '';
    form.elements['notas'].value    = ing.notas    || '';
    document.getElementById('ing-socio-sel').value = ing.socio_id   || '';
    document.getElementById('ing-sec-sel').value   = ing.seccion_id || '';
    filtrarEquipos(ing.seccion_id || '');
    document.getElementById('ing-eq-sel').value    = ing.equipo_id  || '';
    mostrarCampos(ing.tipo);
    if (ing.tipo === 'donacion') {
      form.elements['donante_nombre']?.value    !== undefined && (form.elements['donante_nombre'].value    = ing.donante_nombre    || '');
      form.elements['donante_nif']?.value       !== undefined && (form.elements['donante_nif'].value       = ing.donante_nif       || '');
      form.elements['donante_direccion']?.value !== undefined && (form.elements['donante_direccion'].value = ing.donante_direccion || '');
    }
    if (ing.tipo === 'subvencion') {
      form.elements['organismo']?.value  !== undefined && (form.elements['organismo'].value  = ing.organismo  || '');
      form.elements['expediente']?.value !== undefined && (form.elements['expediente'].value = ing.expediente || '');
    }
  } catch (err) {
    console.error(err);
  }
}

function mostrarCampos(tipo) {
  document.getElementById('fld-donacion').style.display   = tipo === 'donacion'            ? '' : 'none';
  document.getElementById('fld-subvencion').style.display = tipo === 'subvencion'          ? '' : 'none';
  document.getElementById('fld-adelanto').style.display   = tipo === 'adelanto_presidente' ? '' : 'none';
  document.getElementById('fld-stripe').style.display     = tipo === 'cuota'               ? '' : 'none';
}

// ─── Stripe ──────────────────────────────────────────────────────────────────

async function crearStripe() {
  const socioId   = document.getElementById('ing-socio-sel').value;
  const temporada = document.getElementById('ing-stripe-temp').value.trim();
  const precio    = document.getElementById('ing-stripe-precio').value;
  const resultEl  = document.getElementById('ing-stripe-result');

  if (!socioId || !temporada || !precio) {
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = 'Rellena el socio, la temporada y el precio.';
    return;
  }

  resultEl.style.color = 'var(--muted)';
  resultEl.textContent = 'Generando enlace…';

  try {
    const res = await window.api('/stripe/cuota', {
      method: 'POST',
      body: JSON.stringify({ socio_id: socioId, temporada, precio: parseFloat(precio) }),
    });
    resultEl.innerHTML = `<a href="${res.url}" target="_blank" style="color:var(--primary);font-weight:600">Abrir enlace de pago Stripe ↗</a>`;
  } catch (err) {
    resultEl.style.color = 'var(--danger)';
    resultEl.textContent = 'Error: ' + err.message;
  }
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

async function guardar(e) {
  e.preventDefault();
  const fd    = new FormData(e.target);
  const data  = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
  const errEl = document.getElementById('dlg-ing-error');
  errEl.style.display = 'none';

  try {
    if (editandoId) {
      await window.api(`/ingresos/${editandoId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await window.api('/ingresos', { method: 'POST', body: JSON.stringify(data) });
    }
    cerrarDlg();
    const tipoFil = document.getElementById('ing-tipo-fil').value;
    await cargar(tipoFil ? `?tipo=${tipoFil}` : '');
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = '';
  }
}

window._editarIngreso = id => abrirDlg(id);
window._verCert       = id => window.open(`/api/ingresos/${id}/certificado`, '_blank');
