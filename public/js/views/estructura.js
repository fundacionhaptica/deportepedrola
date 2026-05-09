let secciones   = [];
let equipos     = [];
let disciplinas = [];

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Estructura del club</h1>
    </div>

    <div class="grid-3" style="align-items:start">

      <!-- Secciones -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div class="card-title" style="margin:0">Secciones</div>
          <button class="btn btn-primary btn-sm" id="sec-nuevo">+ Nueva</button>
        </div>
        <div id="sec-lista"><p class="empty" style="padding:1rem">Cargando…</p></div>
      </div>

      <!-- Equipos -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
          <div class="card-title" style="margin:0">Equipos</div>
          <button class="btn btn-primary btn-sm" id="eq-nuevo">+ Nuevo</button>
        </div>
        <select id="eq-sec-fil" style="width:100%;margin-bottom:.75rem;font-size:.82rem">
          <option value="">Todas las secciones</option>
        </select>
        <div id="eq-lista"><p class="empty" style="padding:1rem">Cargando…</p></div>
      </div>

      <!-- Disciplinas -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <div class="card-title" style="margin:0">Disciplinas</div>
          <button class="btn btn-primary btn-sm" id="dis-nuevo">+ Nueva</button>
        </div>
        <div id="dis-lista"><p class="empty" style="padding:1rem">Cargando…</p></div>
      </div>

    </div>

    <!-- Dialog -->
    <dialog id="dlg-est">
      <div class="dialog-header">
        <h2 id="dlg-est-title">Nueva sección</h2>
        <button class="btn-icon" id="dlg-est-close">✕</button>
      </div>
      <form id="form-est" autocomplete="off">
        <div class="form-group" style="margin-bottom:.75rem">
          <label>Nombre *</label>
          <input name="nombre" required>
        </div>
        <div class="form-group" id="fld-sec-eq" style="display:none;margin-bottom:.75rem">
          <label>Sección *</label>
          <select name="seccion_id" id="est-sec-sel">
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
  document.getElementById('form-est').addEventListener('submit', guardar);
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
  const sel = document.getElementById('eq-sec-fil');
  if (sel) {
    sel.innerHTML = '<option value="">Todas las secciones</option>';
    secciones.forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`));
  }
  renderEquipos('');
  renderDisciplinas();
}

function renderItem(item, tipo) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.45rem 0;border-bottom:1px solid var(--border)">
      <span style="font-size:.875rem">${item.nombre}</span>
      <button class="btn-icon btn-sm" onclick="window._editarEst('${tipo}',${item.id})" title="Editar">✏️</button>
    </div>
  `;
}

function renderSecciones() {
  const el = document.getElementById('sec-lista');
  if (!el) return;
  el.innerHTML = secciones.length
    ? secciones.map(s => renderItem(s, 'seccion')).join('')
    : '<p style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Sin secciones</p>';
}

function renderEquipos(seccionId) {
  const el = document.getElementById('eq-lista');
  if (!el) return;
  const lista = seccionId ? equipos.filter(e => String(e.seccion_id) === String(seccionId)) : equipos;
  el.innerHTML = lista.length
    ? lista.map(e => {
        const sec = secciones.find(s => s.id === e.seccion_id);
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.45rem 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:.875rem">${e.nombre}</div>
              ${sec ? `<div style="font-size:.75rem;color:var(--muted)">${sec.nombre}</div>` : ''}
            </div>
            <button class="btn-icon btn-sm" onclick="window._editarEst('equipo',${e.id})" title="Editar">✏️</button>
          </div>`;
      }).join('')
    : '<p style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Sin equipos</p>';
}

function renderDisciplinas() {
  const el = document.getElementById('dis-lista');
  if (!el) return;
  el.innerHTML = disciplinas.length
    ? disciplinas.map(d => renderItem(d, 'disciplina')).join('')
    : '<p style="color:var(--muted);font-size:.85rem;padding:.5rem 0">Sin disciplinas</p>';
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

let dlgTipo   = 'seccion';
let dlgEditId = null;

const ENDPOINTS = {
  seccion:    '/estructura/secciones',
  equipo:     '/estructura/equipos',
  disciplina: '/estructura/disciplinas',
};
const NOMBRES = { seccion: 'sección', equipo: 'equipo', disciplina: 'disciplina' };

function abrirDlg(tipo, id = null) {
  dlgTipo   = tipo;
  dlgEditId = id;

  const form = document.getElementById('form-est');
  form.reset();
  document.getElementById('dlg-est-error').style.display = 'none';
  document.getElementById('dlg-est-title').textContent   = (id ? 'Editar ' : 'Nueva ') + NOMBRES[tipo];

  const fldSec = document.getElementById('fld-sec-eq');
  fldSec.style.display = tipo === 'equipo' ? '' : 'none';

  if (tipo === 'equipo') {
    const sel = document.getElementById('est-sec-sel');
    sel.innerHTML = '<option value="">— seleccionar —</option>';
    secciones.forEach(s => sel.insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.nombre}</option>`));
    sel.required = true;
  } else {
    document.getElementById('est-sec-sel').required = false;
  }

  if (id) {
    const lista = tipo === 'seccion' ? secciones : tipo === 'equipo' ? equipos : disciplinas;
    const item  = lista.find(i => i.id === id);
    if (item) {
      form.elements['nombre'].value      = item.nombre      || '';
      form.elements['descripcion'].value = item.descripcion || '';
      if (tipo === 'equipo') document.getElementById('est-sec-sel').value = item.seccion_id || '';
    }
  }

  document.getElementById('dlg-est').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-est').close();
}

async function guardar(e) {
  e.preventDefault();
  const fd    = new FormData(e.target);
  const data  = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
  const errEl = document.getElementById('dlg-est-error');
  errEl.style.display = 'none';

  try {
    const base = ENDPOINTS[dlgTipo];
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

window._editarEst = (tipo, id) => abrirDlg(tipo, id);
