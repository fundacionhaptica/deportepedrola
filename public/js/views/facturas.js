let facturas = [];
let secciones = [];
let equipos   = [];
let proveedores = [];

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Facturas</h1>
      <div class="actions">
        <input type="search" id="f-buscar" placeholder="Buscar proveedor, concepto…" style="width:220px">
        <select id="f-seccion" style="width:140px"><option value="">Todas las secciones</option></select>
        <label class="upload-area" id="f-upload-label" style="padding:.45rem .9rem;display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;border-style:dashed;border-radius:6px;font-size:.875rem;color:var(--muted)">
          ⬆ Subir PDF
          <input type="file" id="f-file" accept="application/pdf" style="display:none">
        </label>
        <button class="btn btn-primary" id="f-nuevo">+ Nueva factura</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="f-tabla">
          <thead>
            <tr>
              <th>Nº</th><th>Proveedor</th><th>Fecha</th><th>Sección</th>
              <th>Equipo</th><th>Total</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="f-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Spinner OCR -->
    <div id="f-ocr-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;display:none;align-items:center;justify-content:center;flex-direction:column;gap:1rem;color:#fff;font-size:1rem">
      <div class="spinner" style="width:36px;height:36px;border-width:4px"></div>
      <div>Procesando PDF con OCR…</div>
    </div>

    <!-- Dialog factura -->
    <dialog id="dlg-factura">
      <div class="dialog-header">
        <h2 id="dlg-f-title">Nueva factura</h2>
        <button class="btn-icon" id="dlg-f-close">✕</button>
      </div>

      <div id="dlg-f-bus-warn" class="alert alert-warning" style="display:none;margin-bottom:.75rem">
        📌 Detectado autobús: crea una línea por cada viaje/trayecto.
      </div>

      <form id="form-factura" autocomplete="off">
        <!-- Cabecera -->
        <div class="form-row">
          <div class="form-group">
            <label>Proveedor *</label>
            <select name="proveedor_id" id="f-proveedor-sel" required>
              <option value="">— seleccionar —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Nº Factura</label>
            <input name="numero_factura">
          </div>
          <div class="form-group">
            <label>Fecha factura</label>
            <input type="date" name="fecha_factura">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Sección</label>
            <select name="seccion_id" id="f-sec-sel">
              <option value="">— sin sección —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Equipo</label>
            <select name="equipo_id" id="f-eq-sel">
              <option value="">— sin equipo —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Estado</label>
            <select name="estado">
              <option value="pendiente">Pendiente</option>
              <option value="pagada">Pagada</option>
              <option value="revisada">Revisada</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="grid-column:1/-1">
            <label>Notas</label>
            <textarea name="notas" rows="2"></textarea>
          </div>
        </div>

        <!-- Líneas -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:.8rem;color:var(--muted);text-transform:uppercase;letter-spacing:.05em">Líneas</span>
          <button type="button" class="btn btn-secondary" id="f-add-linea" style="font-size:.8rem;padding:.3rem .7rem">+ Línea</button>
        </div>
        <div class="table-wrap" style="margin-bottom:.75rem">
          <table class="lineas-table" style="min-width:560px">
            <thead>
              <tr>
                <th style="width:40%">Concepto</th>
                <th style="width:12%">Cantidad</th>
                <th style="width:16%">Precio unit.</th>
                <th style="width:10%">IVA%</th>
                <th style="width:14%">Total</th>
                <th style="width:8%"></th>
              </tr>
            </thead>
            <tbody id="f-lineas-body"></tbody>
          </table>
        </div>
        <div style="text-align:right;font-size:.9rem;color:var(--muted);margin-bottom:.75rem">
          Total factura: <strong id="f-total-display">0,00 €</strong>
        </div>

        <input type="hidden" name="pdf_path"     id="f-pdf-path">
        <input type="hidden" name="pdf_filename" id="f-pdf-filename">

        <div id="dlg-f-error" class="alert alert-error" style="display:none"></div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="dlg-f-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </dialog>
  `;

  // listeners
  document.getElementById('f-buscar').addEventListener('input', e => filtrar(e.target.value));
  document.getElementById('f-nuevo').addEventListener('click', () => abrirDlg());
  document.getElementById('dlg-f-close').addEventListener('click', cerrarDlg);
  document.getElementById('dlg-f-cancel').addEventListener('click', cerrarDlg);
  document.getElementById('form-factura').addEventListener('submit', guardar);
  document.getElementById('f-add-linea').addEventListener('click', () => addLinea());
  document.getElementById('f-file').addEventListener('change', subirPdf);
  document.getElementById('f-sec-sel').addEventListener('change', e => filtrarEquipos(e.target.value));
  document.getElementById('f-proveedor-sel'); // just reference

  await Promise.all([cargarFiltros(), cargar()]);
}

async function cargarFiltros() {
  try {
    [secciones, equipos, proveedores] = await Promise.all([
      window.api('/estructura/secciones'),
      window.api('/estructura/equipos'),
      window.api('/proveedores?limit=500'),
    ]);

    const selSec = document.getElementById('f-seccion');
    secciones.forEach(s => {
      selSec.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`);
    });
    selSec.addEventListener('change', e => filtrarPorSeccion(e.target.value));

    rellenarSelects();
  } catch (err) {
    console.error(err);
  }
}

function rellenarSelects() {
  const selProv = document.getElementById('f-proveedor-sel');
  const selSec  = document.getElementById('f-sec-sel');
  if (!selProv || !selSec) return;

  selProv.innerHTML = '<option value="">— seleccionar —</option>';
  proveedores.forEach(p => {
    selProv.insertAdjacentHTML('beforeend', `<option value="${p.id}">${p.nombre}</option>`);
  });

  selSec.innerHTML = '<option value="">— sin sección —</option>';
  secciones.forEach(s => {
    selSec.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`);
  });

  filtrarEquipos('');
}

function filtrarEquipos(seccionId) {
  const selEq = document.getElementById('f-eq-sel');
  if (!selEq) return;
  selEq.innerHTML = '<option value="">— sin equipo —</option>';
  const lista = seccionId ? equipos.filter(e => String(e.seccion_id) === String(seccionId)) : equipos;
  lista.forEach(e => {
    selEq.insertAdjacentHTML('beforeend', `<option value="${e.id}">${e.nombre}</option>`);
  });
}

async function cargar(params = '') {
  try {
    facturas = await window.api('/facturas' + params);
    renderTabla(facturas);
  } catch (err) {
    console.error(err);
  }
}

function renderTabla(lista) {
  const tbody = document.getElementById('f-body');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">Sin resultados</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(f => `
    <tr data-id="${f.id}">
      <td>${f.numero_factura || '—'}</td>
      <td>${f.proveedor_nombre || '—'}</td>
      <td>${f.fecha_factura ? f.fecha_factura.substring(0,10) : '—'}</td>
      <td>${f.seccion_nombre || '—'}</td>
      <td>${f.equipo_nombre  || '—'}</td>
      <td style="font-weight:600">${fmtEur(f.importe_total)}</td>
      <td><span class="badge ${badgeEstado(f.estado)}">${f.estado || '—'}</span></td>
      <td style="white-space:nowrap">
        ${f.pdf_path ? `<button class="btn-icon" title="Ver PDF" onclick="verPdf(${f.id})">📄</button>` : ''}
        <button class="btn-icon" title="Editar" onclick="editarFactura(${f.id})">✏️</button>
      </td>
    </tr>
  `).join('');
}

function badgeEstado(e) {
  if (e === 'pagada')   return 'badge-green';
  if (e === 'revisada') return 'badge-blue';
  return 'badge-orange';
}

function fmtEur(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function filtrar(q) {
  const lq = q.toLowerCase();
  renderTabla(q ? facturas.filter(f =>
    `${f.proveedor_nombre || ''} ${f.numero_factura || ''} ${f.seccion_nombre || ''}`.toLowerCase().includes(lq)
  ) : facturas);
}

function filtrarPorSeccion(seccionId) {
  if (!seccionId) {
    cargar();
  } else {
    cargar(`?seccion_id=${seccionId}`);
  }
}

// ─── OCR ────────────────────────────────────────────────────────────────────

async function subirPdf(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  const overlay = document.getElementById('f-ocr-overlay');
  overlay.style.display = 'flex';

  try {
    const fd = new FormData();
    fd.append('pdf', file);
    const res = await window.api('/facturas/ocr', { method: 'POST', body: fd });

    overlay.style.display = 'none';
    abrirDlg(null, res);
  } catch (err) {
    overlay.style.display = 'none';
    alert('Error al procesar el PDF: ' + err.message);
  }
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

let editandoId = null;

function abrirDlg(id = null, ocrData = null) {
  editandoId = id;
  const form  = document.getElementById('form-factura');
  const title = document.getElementById('dlg-f-title');
  const errEl = document.getElementById('dlg-f-error');

  form.reset();
  errEl.style.display = 'none';
  document.getElementById('f-lineas-body').innerHTML = '';
  document.getElementById('f-total-display').textContent = '0,00 €';
  document.getElementById('dlg-f-bus-warn').style.display = 'none';
  document.getElementById('f-pdf-path').value     = '';
  document.getElementById('f-pdf-filename').value = '';

  rellenarSelects();

  if (id) {
    title.textContent = 'Editar factura';
    cargarFacturaEnDlg(id);
  } else if (ocrData) {
    title.textContent = 'Nueva factura (OCR)';
    rellenarDesdeOcr(ocrData);
  } else {
    title.textContent = 'Nueva factura';
    addLinea();
  }

  document.getElementById('dlg-factura').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-factura').close();
}

async function cargarFacturaEnDlg(id) {
  try {
    const f = await window.api(`/facturas/${id}`);
    const form = document.getElementById('form-factura');

    form.elements['numero_factura'].value = f.numero_factura || '';
    form.elements['fecha_factura'].value  = f.fecha_factura ? f.fecha_factura.substring(0,10) : '';
    form.elements['estado'].value         = f.estado || 'pendiente';
    form.elements['notas'].value          = f.notas  || '';

    document.getElementById('f-proveedor-sel').value = f.proveedor_id || '';
    document.getElementById('f-sec-sel').value       = f.seccion_id   || '';
    filtrarEquipos(f.seccion_id || '');
    document.getElementById('f-eq-sel').value        = f.equipo_id    || '';
    document.getElementById('f-pdf-path').value      = f.pdf_path     || '';
    document.getElementById('f-pdf-filename').value  = f.pdf_filename || '';

    (f.lineas || []).forEach(l => addLinea(l));
    recalcTotal();
  } catch (err) {
    console.error(err);
  }
}

function rellenarDesdeOcr(data) {
  const ocr = data.ocr || {};

  // PDF metadata
  document.getElementById('f-pdf-path').value     = data.pdf_path     || '';
  document.getElementById('f-pdf-filename').value = data.pdf_filename || '';

  const form = document.getElementById('form-factura');
  if (ocr.numero_factura) form.elements['numero_factura'].value = ocr.numero_factura;
  if (ocr.fecha_factura)  form.elements['fecha_factura'].value  = ocr.fecha_factura.substring(0,10);

  // Proveedor match
  if (data.proveedor_match) {
    document.getElementById('f-proveedor-sel').value = data.proveedor_match.id;
  }

  // Advertencia autobús
  const conceptos = (ocr.lineas || []).map(l => (l.concepto || '').toLowerCase()).join(' ');
  if (conceptos.includes('autobús') || conceptos.includes('autobus') || conceptos.includes('viaje') || conceptos.includes('trayecto')) {
    document.getElementById('dlg-f-bus-warn').style.display = '';
  }

  // Líneas
  if (ocr.lineas && ocr.lineas.length) {
    ocr.lineas.forEach(l => addLinea(l));
  } else {
    addLinea();
  }
  recalcTotal();
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

function addLinea(data = {}) {
  const tbody = document.getElementById('f-lineas-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="l-concepto" value="${esc(data.concepto || '')}" placeholder="Concepto" required></td>
    <td><input class="l-cantidad" type="number" min="0.01" step="0.01" value="${data.cantidad || 1}" style="text-align:right"></td>
    <td><input class="l-precio"   type="number" min="0"    step="0.01" value="${data.precio_unitario || ''}" placeholder="0.00" style="text-align:right"></td>
    <td><input class="l-iva"      type="number" min="0"    step="1"    value="${data.iva_pct != null ? data.iva_pct : 21}" style="text-align:right" placeholder="21"></td>
    <td class="l-total" style="text-align:right;font-size:.8rem"></td>
    <td><button type="button" class="btn-icon" title="Eliminar">✕</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => { tr.remove(); recalcTotal(); });
  ['l-cantidad','l-precio','l-iva'].forEach(cls => {
    tr.querySelector('.' + cls).addEventListener('input', () => recalcLineaTotal(tr));
  });
  tbody.appendChild(tr);
  recalcLineaTotal(tr);
  recalcTotal();
}

function recalcLineaTotal(tr) {
  const qty   = parseFloat(tr.querySelector('.l-cantidad').value) || 0;
  const price = parseFloat(tr.querySelector('.l-precio').value)   || 0;
  const iva   = parseFloat(tr.querySelector('.l-iva').value)      || 0;
  const total = qty * price * (1 + iva / 100);
  tr.querySelector('.l-total').textContent = fmtEur(total);
  recalcTotal();
}

function recalcTotal() {
  const rows  = document.querySelectorAll('#f-lineas-body tr');
  let sum = 0;
  rows.forEach(tr => {
    const qty   = parseFloat(tr.querySelector('.l-cantidad')?.value) || 0;
    const price = parseFloat(tr.querySelector('.l-precio')?.value)   || 0;
    const iva   = parseFloat(tr.querySelector('.l-iva')?.value)      || 0;
    sum += qty * price * (1 + iva / 100);
  });
  const el = document.getElementById('f-total-display');
  if (el) el.textContent = fmtEur(sum);
}

function esc(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// ─── Guardar ─────────────────────────────────────────────────────────────────

async function guardar(e) {
  e.preventDefault();
  const fd    = new FormData(e.target);
  const data  = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
  const errEl = document.getElementById('dlg-f-error');
  errEl.style.display = 'none';

  // Recoger líneas
  const lineas = [];
  document.querySelectorAll('#f-lineas-body tr').forEach(tr => {
    const concepto = tr.querySelector('.l-concepto')?.value?.trim();
    if (!concepto) return;
    lineas.push({
      concepto,
      cantidad:        parseFloat(tr.querySelector('.l-cantidad').value) || 1,
      precio_unitario: parseFloat(tr.querySelector('.l-precio').value)   || 0,
      iva_pct:         parseFloat(tr.querySelector('.l-iva').value)      || 0,
    });
  });
  data.lineas = lineas;

  try {
    if (editandoId) {
      await window.api(`/facturas/${editandoId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await window.api('/facturas', { method: 'POST', body: JSON.stringify(data) });
    }
    cerrarDlg();
    await cargar();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = '';
  }
}

// ─── Acciones globales ───────────────────────────────────────────────────────

window.editarFactura = function(id) { abrirDlg(id); };
window.verPdf        = function(id) { window.open(`/api/facturas/${id}/pdf`, '_blank'); };
