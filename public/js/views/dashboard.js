const charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function bar(id, title, labels, data, color = '#1e3a8a') {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: title, data: data.map(Number), backgroundColor: color }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 13 } } },
      scales:  { y: { ticks: { callback: v => fmt(v) } } },
    },
  });
}

function line(id, title, labels, dataIngresos, dataGastos) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Ingresos', data: dataIngresos.map(Number), borderColor: '#16a34a', tension: .3, fill: false },
        { label: 'Gastos',   data: dataGastos.map(Number),   borderColor: '#dc2626', tension: .3, fill: false },
      ],
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: title, font: { size: 13 } } },
      scales:  { y: { ticks: { callback: v => fmt(v) } } },
    },
  });
}

function doughnut(id, title, labels, data) {
  destroyChart(id);
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: data.map(Number), backgroundColor: ['#1e3a8a','#16a34a','#d97706','#7c3aed','#0891b2','#dc2626'] }],
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: title, font: { size: 13 } } },
    },
  });
}

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="filters">
        <label>Desde <input type="date" id="dash-desde"></label>
        <label>Hasta <input type="date" id="dash-hasta"></label>
        <button class="btn btn-primary" id="dash-ok">Actualizar</button>
      </div>
    </div>

    <div class="grid-3" id="kpis">
      <div class="card kpi"><div class="kpi-label">Ingresos</div><div class="kpi-value" id="kv-ing">—</div></div>
      <div class="card kpi"><div class="kpi-label">Gastos</div><div class="kpi-value" id="kv-gas">—</div></div>
      <div class="card kpi"><div class="kpi-label">Neto</div><div class="kpi-value" id="kv-net">—</div></div>
    </div>

    <div class="grid-2">
      <div class="card chart-card"><canvas id="ch-seccion"></canvas></div>
      <div class="card chart-card"><canvas id="ch-equipo"></canvas></div>
      <div class="card chart-card"><canvas id="ch-proveedor"></canvas></div>
      <div class="card chart-card"><canvas id="ch-balance"></canvas></div>
      <div class="card chart-card"><canvas id="ch-tipos"></canvas></div>
      <div class="card chart-card" id="card-adelantos"></div>
    </div>
  `;

  document.getElementById('dash-ok').addEventListener('click', load);
  await load();
}

async function load() {
  const desde = document.getElementById('dash-desde')?.value;
  const hasta = document.getElementById('dash-hasta')?.value;
  const q = new URLSearchParams();
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const qs = q.toString() ? '?' + q : '';

  try {
    const [seccion, equipo, proveedor, balance, tipos, adelantos] = await Promise.all([
      window.api(`/informes/gasto-por-seccion${qs}`),
      window.api(`/informes/gasto-por-equipo${qs}`),
      window.api(`/informes/gasto-por-proveedor${qs}`),
      window.api(`/informes/balance-mensual${qs}`),
      window.api(`/informes/ingresos-por-tipo${qs}`),
      window.api(`/informes/adelantos-presidente${qs}`),
    ]);

    // KPIs
    const totalIng = balance.reduce((s, r) => s + Number(r.ingresos), 0);
    const totalGas = balance.reduce((s, r) => s + Number(r.gastos),   0);
    const neto     = totalIng - totalGas;

    document.getElementById('kv-ing').textContent = fmt(totalIng);
    document.getElementById('kv-gas').textContent = fmt(totalGas);
    const netoEl = document.getElementById('kv-net');
    netoEl.textContent  = fmt(neto);
    netoEl.style.color  = neto >= 0 ? 'var(--success)' : 'var(--danger)';

    // Gráficas
    bar('ch-seccion',   'Gasto por sección',   seccion.map(r => r.seccion),      seccion.map(r => r.total_gasto));
    bar('ch-equipo',    'Gasto por equipo',     equipo.slice(0,15).map(r => r.equipo), equipo.slice(0,15).map(r => r.total_gasto));
    bar('ch-proveedor', 'Top proveedores',      proveedor.map(r => r.proveedor),  proveedor.map(r => r.total_gasto), '#7c3aed');

    const meses = balance.map(r => (r.mes || '').substring(0, 7));
    line('ch-balance', 'Balance mensual', meses, balance.map(r => r.ingresos), balance.map(r => r.gastos));

    doughnut('ch-tipos', 'Ingresos por tipo', tipos.map(r => r.tipo), tipos.map(r => r.total));

    document.getElementById('card-adelantos').innerHTML = `
      <h3 style="font-size:.9rem;color:var(--muted);margin-bottom:.75rem">Adelantos del presidente</h3>
      <div style="font-size:1.75rem;font-weight:700;color:var(--warning)">${fmt(adelantos.total)}</div>
      <div style="color:var(--muted);font-size:.85rem;margin-top:.4rem">${adelantos.adelantos.length} operación(es)</div>
    `;
  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}
