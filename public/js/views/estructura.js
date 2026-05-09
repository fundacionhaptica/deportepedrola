let secciones   = [];
let equipos     = [];
let disciplinas = [];

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Estructura</h1>
    </div>

    <div class="grid-3" style="align-items:start">

      <!-- Secciones -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h2 style="font-size:1rem">Secciones</h2>
          <button class="btn btn-primary" id="sec-nuevo" style="font-size:.8rem;padding:.35rem .7rem">+ Nueva</button>
        </div>
        <div id="sec-lista"></div>
      </div>

      <!-- Equipos -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
          <h2 style="font-size:1rem">Equipos</h2>
          <button class="btn btn-primary" id="eq-nuevo" style="font-size:.8rem;padding:.35rem .7rem">+ Nuevo</button>
        </div>
        <select id="eq-sec-fil" style="width:100%;margin-bottom:.75rem;font-size:.8rem">
          <option value="">Todas las secciones</option>
        </select>
        <div id="eq-lista"></div>
      </div>

      <!-- Disciplinas -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h2 style="font-size:1rem">Disciplinas</h2>
          <button class="btn btn-primary" id="dis-nuevo" style="font-size:.8rem;padding:.35rem .7rem">+ Nueva</button>
        </div>
        <div id="dis-lista"></div>
      </div>

    </div>

    <!-- Dialog genérico -->
    <dialog id="dlg-estructura">
      <div class="dialog-header">
        <h2 id="dlg-est-title">Nueva sección</h2>
        <button class="btn-icon" id="dlg-est-close">✕</button>
      </div>
      <form id="form-estructura">
        <div class="form-group" style="margin-bottom:.75rem">
          <label>Nombre *</label>
          <input name="nombre" required>
        </div>
        <div class="form-group" id="fld-seccion-eq" style="display:none;margin-bottom:.75rem">
          <label>Sección *</label>
          <select name="seccion_id" id="est-sec-sel" required>
            <option value="">— seleccionar —</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:.75rem">
          <label>Descripción</label>
          <textarea name="descripcion" rows="2"></textarea>
        </div>
        <div id="dlg-est-error" class="alert alert-error" style="display:none"></div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="dlg-est-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </dialog>
  `;

  document.getElementById('sec-nuevo').addEventListener('click', () => abrirDlg('seccion'));
  document.getElementById('eq-nuevo').addEventListener('click',  () => abrirDlg('equipo'));
  document.getElementById('dis-nuevo').addEventListener('click', () => abrirDlg('disciplina'));
  document.getElementById('dlg-est-close').addEventListener('click', cerrarDlg);
  document.getElementById('dlg-est-cancel').addEventListener('click', cerrarDlg);
  document.getElementById('form-estructura').addEventListener('submit', guardar);
  document.getElementById('eq-sec-fil').addEventListener('change', e => renderEquipos(e.target.value));

  await cargar();
}

async function cargar() {
  try {
    [secciones, equipos, disciplinas] = await Promise.all([
      window.api('/estructura/secciones'),
      window.api('/estructura/equipos'),
      window.api('/estructura/disciplinas'),
    ]);
    renderTodo();
  } catch (err) {
    console.error(err);
  }
}

function renderTodo() {
  renderSecciones();
  renderEquiposFiltro();
  renderEquipos('');
  renderDisciplinas();
}

function renderSecciones() {
  const el = document.getElementById('sec-lista');
  if (!el) return;
  if (!secciones.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Sin secciones</p>'; return; }
  el.innerHTML = secciones.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.875rem">${s.nombre}</span>
      <button class="btn-icon" style="font-size:.75rem;color:var(--muted)" onclick="editarEst('seccion',${s.id})">✏️</button>
    </div>
  `).join('');
}

function renderEquiposFiltro() {
  const sel = document.getElementById('eq-sec-fil');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todas las secciones</option>';
  secciones.forEach(s => {
    sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`);
  });
}

function renderEquipos(seccionId) {
  const el = document.getElementById('eq-lista');
  if (!el) return;
  const lista = seccionId ? equipos.filter(e => String(e.seccion_id) === String(seccionId)) : equipos;
  if (!lista.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Sin equipos</p>'; return; }
  el.innerHTML = lista.map(e => {
    const sec = secciones.find(s => s.id === e.seccion_id);
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:.875rem">${e.nombre}</div>
          ${sec ? `<div style="font-size:.75rem;color:var(--muted)">${sec.nombre}</div>` : ''}
        </div>
        <button class="btn-icon" style="font-size:.75rem;color:var(--muted)" onclick="editarEst('equipo',${e.id})">✏️</button>
      </div>
    `;
  }).join('');
}

function renderDisciplinas() {
  const el = document.getElementById('dis-lista');
  if (!el) return;
  if (!disciplinas.length) { el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Sin disciplinas</p>'; return; }
  el.innerHTML = disciplinas.map(d => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.875rem">${d.nombre}</span>
      <button class="btn-icon" style="font-size:.75rem;color:var(--muted)" onclick="editarEst('disciplina',${d.id})">✏️</button>
    </div>
  `).join('');
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

let dlgTipo    = 'seccion';
let dlgEditId  = null;

function abrirDlg(tipo, id = null) {
  dlgTipo   = tipo;
  dlgEditId = id;

  const form  = document.getElementById('form-estructura');
  const title = document.getElementById('dlg-est-title');
  const errEl = document.getElementById('dlg-est-error');

  form.reset();
  errEl.style.display = 'none';

  const labels = { seccion: 'sección', equipo: 'equipo', disciplina: 'disciplina' };
  title.textContent = (id ? 'Editar ' : 'Nueva ') + labels[tipo];

  const fldSec = document.getElementById('fld-seccion-eq');
  fldSec.style.display = tipo === 'equipo' ? '' : 'none';
  document.getElementById('est-sec-sel').required = tipo === 'equipo';

  if (tipo === 'equipo') {
    const sel = document.getElementById('est-sec-sel');
    sel.innerHTML = '<option value="">— seleccionar —</option>';
    secciones.forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`));
  }

  if (id) {
    const items = tipo === 'seccion' ? secciones : tipo === 'equipo' ? equipos : disciplinas;
    const item  = items.find(i => i.id === id);
    if (item) {
      form.elements['nombre'].value      = item.nombre      || '';
      form.elements['descripcion'].value = item.descripcion || '';
      if (tipo === 'equipo') document.getElementById('est-sec-sel').value = item.seccion_id || '';
    }
  }

  document.getElementById('dlg-estructura').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-estructura').close();
}

async function guardar(e) {
  e.preventDefault();
  const fd    = new FormData(e.target);
  const data  = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
  const errEl = document.getElementById('dlg-est-error');
  errEl.style.display = 'none';

  const endpoints = { seccion: '/estructura/secciones', equipo: '/estructura/equipos', disciplina: '/estructura/disciplinas' };
  const base = endpoints[dlgTipo];

  try {
    if (dlgEditId) {
      await window.api(`${base}/${dlgEditId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      await window.api(base, { method: 'POST', body: JSON.stringify(data) });
    }
    cerrarDlg();
    await cargar();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = '';
  }
}

// ─── Acciones globales ───────────────────────────────────────────────────────

window.editarEst = function(tipo, id) { abrirDlg(tipo, id); };
