let socios = [];

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Socios</h1>
      <div class="actions">
        <input type="search" id="s-buscar" placeholder="Buscar nombre, apellidos o DNI…" style="width:240px">
        <button class="btn btn-primary" id="s-nuevo">+ Nuevo socio</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nº</th>
              <th>Nombre</th>
              <th>Email</th>
              <th>Teléfono</th>
              <th>Alta</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody id="s-body"></tbody>
        </table>
      </div>
    </div>

    <dialog id="dlg-socio">
      <div class="dialog-header">
        <h2 id="dlg-s-title">Nuevo socio</h2>
        <button class="btn-icon" id="dlg-s-close">✕</button>
      </div>
      <form id="form-socio" autocomplete="off">
        <div class="form-row">
          <div class="form-group"><label>Nombre *</label><input name="nombre" required></div>
          <div class="form-group"><label>Apellidos *</label><input name="apellidos" required></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>DNI</label><input name="dni"></div>
          <div class="form-group"><label>Email</label><input type="email" name="email"></div>
          <div class="form-group"><label>Teléfono</label><input name="telefono"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Fecha nacimiento</label><input type="date" name="fecha_nacimiento"></div>
          <div class="form-group"><label>Fecha alta</label><input type="date" name="fecha_alta"></div>
          <div class="form-group"><label>Nº Socio</label><input name="numero_socio"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>IBAN</label><input name="iban" placeholder="ES00 0000 0000 00 0000000000"></div>
        </div>
        <div class="form-group" style="margin-bottom:.75rem"><label>Notas</label><textarea name="notas" rows="2"></textarea></div>
        <div id="dlg-s-error" class="alert alert-error" style="display:none"></div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" id="dlg-s-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    </dialog>
  `;

  document.getElementById('s-buscar').addEventListener('input', e => filtrar(e.target.value));
  document.getElementById('s-nuevo').addEventListener('click', () => abrirDlg());
  document.getElementById('dlg-s-close').addEventListener('click', cerrarDlg);
  document.getElementById('dlg-s-cancel').addEventListener('click', cerrarDlg);
  document.getElementById('form-socio').addEventListener('submit', guardar);

  await cargar();
}

async function cargar() {
  try {
    socios = await window.api('/socios?activo=true&limit=500');
    renderTabla(socios);
  } catch (err) {
    console.error(err);
  }
}

function renderTabla(lista) {
  const tbody = document.getElementById('s-body');
  if (!tbody) return;
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Sin resultados</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(s => `
    <tr>
      <td>${s.numero_socio || '—'}</td>
      <td><strong>${s.apellidos}, ${s.nombre}</strong></td>
      <td>${s.email || '—'}</td>
      <td>${s.telefono || '—'}</td>
      <td>${s.fecha_alta ? s.fecha_alta.substring(0,10) : '—'}</td>
      <td><span class="badge ${s.activo ? 'badge-green' : 'badge-red'}">${s.activo ? 'Activo' : 'Baja'}</span></td>
    </tr>
  `).join('');
}

function filtrar(q) {
  const lq = q.toLowerCase();
  renderTabla(q ? socios.filter(s =>
    `${s.nombre} ${s.apellidos} ${s.dni || ''}`.toLowerCase().includes(lq)
  ) : socios);
}

function abrirDlg() {
  document.getElementById('form-socio').reset();
  document.getElementById('dlg-s-error').style.display = 'none';
  document.getElementById('dlg-s-title').textContent   = 'Nuevo socio';
  // prefill fecha alta = hoy
  document.getElementById('form-socio').elements['fecha_alta'].value = new Date().toISOString().substring(0,10);
  document.getElementById('dlg-socio').showModal();
}

function cerrarDlg() {
  document.getElementById('dlg-socio').close();
}

async function guardar(e) {
  e.preventDefault();
  const fd    = new FormData(e.target);
  const data  = Object.fromEntries([...fd.entries()].filter(([,v]) => v !== ''));
  const errEl = document.getElementById('dlg-s-error');
  errEl.style.display = 'none';
  try {
    await window.api('/socios', { method: 'POST', body: JSON.stringify(data) });
    cerrarDlg();
    await cargar();
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = '';
  }
}
