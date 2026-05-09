let facturas    = [];
let proveedores = [];
let secciones   = [];
let equipos     = [];

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Facturas</h1>
      <div class="actions">
        <input type="search" id="f-buscar" placeholder="Buscar proveedor…" style="width:200px">
        <button class="btn btn-primary" id="f-nuevo">+ Nueva factura</button>
      </div>
    </div>

    <!-- Zona subida OCR -->
    <div class="card" style="margin-bottom:1.25rem">
      <label class="upload-area" id="f-upload-label">
        <span class="upload-icon">📄</span>
        <strong>Subir PDF y procesar con OCR</strong>
        <span style="font-size:.82rem;margin-top:.25rem">Haz clic o arrastra un PDF de factura</span>
        <input type="file" id="f-file" accept="application/pdf" style="display:none">
      </label>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nº Factura</th><th>Proveedor</th><th>Fecha</th>
              <th>Sección</th><th>Total</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody id="f-body"></tbody>
        </table>
      </div>
    </div>

    <!-- Overlay OCR -->
    <div id="f-ocr-overlay" style="display:none">
      <div class="spinner"></div>
      <div>Procesando PDF con OCR…</div>
      <div style="font-size:.82rem;opacity:.7">Puede tardar unos segundos</div>
    </div>

    <!-- Dialog factura -->
    <dialog id="dlg-factura">
      <div class="dialog-header">
        <h2 id="dlg-f-title">Nueva factura</h2>
        <button class="btn-icon" id="dlg-f-close">✕</button>
      </div>

      <div id="dlg-f-bus-warn" class="alert alert-warning" style="display:none">
        📌 <strong>Detectado autobús:</strong> crea una línea por cada viaje/trayecto.
      </div>

      <form id="form-factura" autocomplete="off">
        <!-- Cabecera -->
        <div class="form-row">
          <div class="form-group">
            <label>Proveedor *</label>
            <select name="proveedor_id" id="f-prov-sel" required>
              <option value="">— seleccionar —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Nº Factura</label>
            <input name="numero_factura">
          </div>
          <div class="form-group">
            <label>Fecha</label>
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
        <div class="form-group" style="margin-bottom:.75rem">
          <label>Notas</label>
          <textarea name="notas" rows="2"></textarea>
        </div>

        <!-- Líneas -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <span style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Líneas</span>
          <button type="button" class="btn btn-secondary btn-sm" id="f-add-linea">+ Añadir línea</button>
        </div>
        <div class="table-wrap" style="margin-bottom:.5rem">
          <table class="lineas-table" style="min-width:520px">
            <thead>
              <tr>
                <th style="width:38%">Concepto</th>
                <th style="width:11%">Cant.</th>
                <th style="width:16%">P. Unit.</th>
                <th style="width:10%">IVA%</th>
                <th style="width:14%;text-align:right">Total</th>
                <th style="width:7%"></th>
              </tr>
            </thead>
            <tbody id="f-lineas-body"></tbody>
          </table>
        </div>
        <div style="text-align:right;font-size:.9rem;margin-bottom:.75rem">
          Total: <strong id="f-total-display" style="font-size:1.05rem">0,00 €</strong>
        </div>

        <input type="hidden" name="pdf_path"     id="f-pdf-path">
        <input type="hidden" name="pdf_filename" id="f-pdf-filename">

        <div id="dlg-f-error" class="alert alert-error" style="display:none"></div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="dlg-f-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar factura</button>
        </div>
      </form>
    </dialog>
  `;

  document.getElementById('f-buscar').addEventListener('input', e => filtrar(e.target.value));
  document.getElementById('f-nuevo').addEventListener('click', () => abrirDlg());
  document.getElementById('dlg-f-close').addEventListener('click', cerrarDlg);
  document.getElementById('dlg-f-cancel').addEventListener('click', cerrarDlg);
  document.getElementById('form-factura').addEventListener('submit', guardar);
  document.getElementById('f-add-linea').addEventListener('click', () => addLinea());
  document.getElementById('f-file').addEventListener('change', subirPdf);
  document.getElementById('f-sec-sel').addEventListener('change', e => filtrarEquipos(e.target.value));

  // drag & drop
  const label = document.getElementById('f-upload-label');
  label.addEventListener('dragover', e => { e.preventDefault(); label.style.borderColor = 'var(--primary)'; });
  label.addEventListener('dragleave', () => { label.style.borderColor = ''; });
  label.addEventListener('drop', e => {
    e.preventDefault();
    label.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') procesarPdf(file);
  });

  await Promise.all([cargarSelects(), cargar()]);
}

async function cargarSelects() {
  try {
    [proveedores, secciones, equipos] = await Promise.all([
      window.api('/proveedores?limit=500'),
      window.api('/estructura/secciones'),
      window.api('/estructura/equipos'),
    ]);
    rellenarSelects();
  } catch (err) {
    console.error(err);
  }
}

function rellenarSelects() {
  const selProv = document.getElementById('f-prov-sel');
  const selSec  = document.getElementById('f-sec-sel');
  if (!selProv) return;

  selProv.innerHTML = '<option value="">— seleccionar —</option>';
  proveedores.forEach(p => selProv.insertAdjacentHTML('beforeend', `<option value="${p.id}">${p.nombre}</option>`));

  selSec.innerHTML = '<option value="">— sin sección —</option>';
  secciones.forEach(s => selSec.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`));

  filtrarEquipos('');
}

function filtrarEquipos(seccionId) {
  const sel = document.getElementById('f-eq-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— sin equipo —</option>';
  const lista = seccionId ? equipos.filter(e => String(e.seccion_id) === String(seccionId)) : equipos;
  lista.forEach(e => sel.insertAdjacentHTML('beforeend', `<option value="${e.id}">${e.nombre}</option>`));
}

async function cargar() {
  try {
    facturas = await window.api('/facturas');
    renderTabla(facturas);
  } catch (err) {
    console.error(err);
  }
}

function renderTabla(lista) {
  const tbody = document.getElementById('f-body');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">Sin facturas. Sube un PDF para empezar.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(f => `
    <tr>
      <td>${f.numero_factura || '—'}</td>
      <td><strong>${f.proveedor_nombre || '—'}</strong></td>
      <td>${f.fecha_factura ? f.fecha_factura.substring(0,10) : '—'}</td>
      <td>${f.seccion_nombre || '—'}</td>
      <td style="font-weight:700">${fmtEur(f.importe_total)}</td>
      <td><span class="badge ${badgeEstado(f.estado)}">${f.estado || '—'}</span></td>
      <td style="white-space:nowrap">
        ${f.pdf_path ? `<button class="btn-icon" title="Ver PDF" onclick="window._verPdf(${f.id})">📄</button>` : ''}
        <button class="btn-icon" title="Editar" onclick="window._editarFactura(${f.id})">✏️</button>
      </td>
    </tr>
  `).join('');
}

function badgeEstado(e) {
  if (e === 'pagada')   return 'badge-green';
  if (e === 'revisada') return 'badge-blue';
  return 'badge-yellow';
}

function fmtEur(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function filtrar(q) {
  const lq = q.toLowerCase();
  renderTabla(q ? facturas.filter(f =>
    `${f.proveedor_nombre || ''} ${f.numero_factura || ''}`.toLowerCase().includes(lq)
  ) : facturas);
}

// ─── OCR ────────────────────────────────────────────────────────────────────

async function subirPdf(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (file) procesarPdf(file);
}

async function procesarPdf(file) {
  document.getElementById('f-ocr-overlay').style.display = 'flex';
  try {
    const fd = new FormData();
    fd.append('pdf', file);
    const res = await window.api('/facturas/ocr', { method: 'POST', body: fd });
    document.getElementById('f-ocr-overlay').style.display = 'none';
    abrirDlg(null, res);
  } catch (err) {
    document.getElementById('f-ocr-overlay').style.display = 'none';
    alert('Error al procesar el PDF: ' + err.message);
  }
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

let editandoId = null;

function abrirDlg(id = null, ocrData = null) {
  editandoId = id;
  document.getElementById('form-factura').reset();
  document.getElementById('dlg-f-error').style.display = 'none';
  document.getElementById('f-lineas-body').innerHTML   = '';
  document.getElementById('f-total-display').textContent = '0,00 €';
  document.getElementById('dlg-f-bus-warn').style.display = 'none';
  document.getElementById('f-pdf-path').value     = '';
  document.getElementById('f-pdf-filename').value = '';

  rellenarSelects();

  document.getElementById('dlg-f-title').textContent =
    id ? 'Editar factura' : ocrData ? 'Nueva factura (OCR)' : 'Nueva factura';

  if (id) {
    cargarEnDlg(id);
  } else if (ocrData) {
    rellenarDesdeOcr(ocrData);
  } else {
    addLinea();
  }

  document.getElementById('dlg-factura').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-factura').close();
}

async function cargarEnDlg(id) {
  try {
    const f = await window.api(`/facturas/${id}`);
    const form = document.getElementById('form-factura');
    form.elements['numero_factura'].value = f.numero_factura || '';
    form.elements['fecha_factura'].value  = f.fecha_factura ? f.fecha_factura.substring(0,10) : '';
    form.elements['estado'].value         = f.estado || 'pendiente';
    form.elements['notas'].value          = f.notas  || '';
    document.getElementById('f-prov-sel').value = f.proveedor_id || '';
    document.getElementById('f-sec-sel').value  = f.seccion_id   || '';
    filtrarEquipos(f.seccion_id || '');
    document.getElementById('f-eq-sel').value   = f.equipo_id    || '';
    document.getElementById('f-pdf-path').value     = f.pdf_path     || '';
    document.getElementById('f-pdf-filename').value = f.pdf_filename || '';
    (f.lineas || []).forEach(l => addLinea(l));
    recalcTotal();
  } catch (err) {
    console.error(err);
  }
}

function rellenarDesdeOcr(data) {
  const ocr  = data.ocr || {};
  const form = document.getElementById('form-factura');

  document.getElementById('f-pdf-path').value     = data.pdf_path     || '';
  document.getElementById('f-pdf-filename').value = data.pdf_filename || '';

  if (ocr.numero_factura) form.elements['numero_factura'].value = ocr.numero_factura;
  if (ocr.fecha_factura)  form.elements['fecha_factura'].value  = ocr.fecha_factura.substring(0,10);
  if (data.proveedor_match) document.getElementById('f-prov-sel').value = data.proveedor_match.id;

  // Aviso autobús
  const txt = JSON.stringify(ocr).toLowerCase();
  if (txt.includes('autob') || txt.includes('viaje') || txt.includes('trayecto')) {
    document.getElementById('dlg-f-bus-warn').style.display = '';
  }

  if (ocr.lineas?.length) {
    ocr.lineas.forEach(l => addLinea(l));
  } else {
    addLinea();
  }
  recalcTotal();
}

// ─── Líneas ──────────────────────────────────────────────────────────────────

function addLinea(data = {}) {
  const tbody = document.getElementById('f-lineas-body');
  const tr    = document.createElement('tr');
  tr.innerHTML = `
    <td><input class="l-con" value="${esc(data.concepto || '')}" placeholder="Concepto" required></td>
    <td><input class="l-qty" type="number" min="0.001" step="0.001" value="${data.cantidad || 1}" style="text-align:right"></td>
    <td><input class="l-prc" type="number" min="0" step="0.01" value="${data.precio_unitario || ''}" placeholder="0.00" style="text-align:right"></td>
    <td><input class="l-iva" type="number" min="0" step="1" value="${data.iva_pct != null ? data.iva_pct : 21}" style="text-align:right"></td>
    <td class="l-tot" style="text-align:right;font-size:.82rem"></td>
    <td><button type="button" class="btn-icon" style="color:var(--danger)">✕</button></td>
  `;
  tr.querySelector('button').addEventListener('click', () => { tr.remove(); recalcTotal(); });
  ['l-qty','l-prc','l-iva'].forEach(c => tr.querySelector('.'+c).addEventListener('input', () => { recalcLinea(tr); recalcTotal(); }));
  tbody.appendChild(tr);
  recalcLinea(tr);
  recalcTotal();
  tr.querySelector('.l-con').focus();
}

function recalcLinea(tr) {
  const qty  = parseFloat(tr.querySelector('.l-qty').value) || 0;
  const prc  = parseFloat(tr.querySelector('.l-prc').value) || 0;
  const iva  = parseFloat(tr.querySelector('.l-iva').value) || 0;
  tr.querySelector('.l-tot').textContent = fmtEur(qty * prc * (1 + iva / 100));
}

function recalcTotal() {
  let sum = 0;
  document.querySelectorAll('#f-lineas-body tr').forEach(tr => {
    const qty = parseFloat(tr.querySelector('.l-qty')?.value) || 0;
    const prc = parseFloat(tr.querySelector('.l-prc')?.value) || 0;
    const iva = parseFloat(tr.querySelector('.l-iva')?.value) || 0;
    sum += qty * prc * (1 + iva / 100);
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

  const lineas = [];
  document.querySelectorAll('#f-lineas-body tr').forEach(tr => {
    const concepto = tr.querySelector('.l-con')?.value?.trim();
    if (!concepto) return;
    lineas.push({
      concepto,
      cantidad:        parseFloat(tr.querySelector('.l-qty').value) || 1,
      precio_unitario: parseFloat(tr.querySelector('.l-prc').value) || 0,
      iva_pct:         parseFloat(tr.querySelector('.l-iva').value) || 0,
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

window._editarFactura = id => abrirDlg(id);
window._verPdf        = id => window.open(`/api/facturas/${id}/pdf`, '_blank');
