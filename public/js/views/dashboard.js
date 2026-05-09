const charts = {};

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="filters">
        <label>Desde <input type="date" id="dash-desde" style="width:130px"></label>
        <label>Hasta <input type="date" id="dash-hasta" style="width:130px"></label>
        <button class="btn btn-primary btn-sm" id="dash-ok">Actualizar</button>
      </div>
    </div>

    <div class="grid-3" id="kpis">
      <div class="card kpi">
        <div class="kpi-icon">📈</div>
        <div class="kpi-label">Ingresos</div>
        <div class="kpi-value" id="kv-ing" style="color:var(--success)">—</div>
      </div>
      <div class="card kpi">
        <div class="kpi-icon">📉</div>
        <div class="kpi-label">Gastos</div>
        <div class="kpi-value" id="kv-gas" style="color:var(--danger)">—</div>
      </div>
      <div class="card kpi">
        <div class="kpi-icon">💰</div>
        <div class="kpi-label">Neto</div>
        <div class="kpi-value" id="kv-net">—</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card chart-card">
        <div class="card-title">Gasto por sección</div>
        <canvas id="ch-seccion"></canvas>
      </div>
      <div class="card chart-card">
        <div class="card-title">Gasto por equipo (top 10)</div>
        <canvas id="ch-equipo"></canvas>
      </div>
      <div class="card chart-card" style="grid-column:1/-1">
        <div class="card-title">Balance mensual</div>
        <canvas id="ch-balance" style="max-height:260px"></canvas>
      </div>
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
    const [seccion, equipo, balance] = await Promise.all([
      window.api(`/informes/gasto-por-seccion${qs}`),
      window.api(`/informes/gasto-por-equipo${qs}`),
      window.api(`/informes/balance-mensual${qs}`),
    ]);

    // KPIs
    const totalIng = balance.reduce((s, r) => s + Number(r.ingresos), 0);
    const totalGas = balance.reduce((s, r) => s + Number(r.gastos),   0);
    const neto     = totalIng - totalGas;

    document.getElementById('kv-ing').textContent = fmt(totalIng);
    document.getElementById('kv-gas').textContent = fmt(totalGas);
    const netoEl = document.getElementById('kv-net');
    netoEl.textContent = fmt(neto);
    netoEl.style.color = neto >= 0 ? 'var(--success)' : 'var(--danger)';

    // Gráfica: gasto por sección
    destroyChart('ch-seccion');
    const ctxSec = document.getElementById('ch-seccion');
    if (ctxSec) {
      charts['ch-seccion'] = new Chart(ctxSec, {
        type: 'bar',
        data: {
          labels: seccion.map(r => r.seccion || 'Sin sección'),
          datasets: [{ label: 'Gasto', data: seccion.map(r => Number(r.total_gasto)), backgroundColor: '#005f3b' }],
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => fmt(v) } } } },
      });
    }

    // Gráfica: gasto por equipo (top 10)
    destroyChart('ch-equipo');
    const ctxEq = document.getElementById('ch-equipo');
    if (ctxEq) {
      const top10 = equipo.slice(0, 10);
      charts['ch-equipo'] = new Chart(ctxEq, {
        type: 'bar',
        data: {
          labels: top10.map(r => r.equipo || 'Sin equipo'),
          datasets: [{ label: 'Gasto', data: top10.map(r => Number(r.total_gasto)), backgroundColor: '#f5a623' }],
        },
        options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { callback: v => fmt(v) } } } },
      });
    }

    // Gráfica: balance mensual
    destroyChart('ch-balance');
    const ctxBal = document.getElementById('ch-balance');
    if (ctxBal) {
      const meses = balance.map(r => (r.mes || '').substring(0, 7));
      charts['ch-balance'] = new Chart(ctxBal, {
        type: 'line',
        data: {
          labels: meses,
          datasets: [
            { label: 'Ingresos', data: balance.map(r => Number(r.ingresos)), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.08)', tension: .3, fill: true },
            { label: 'Gastos',   data: balance.map(r => Number(r.gastos)),   borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,.08)',  tension: .3, fill: true },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => fmt(v) } } } },
      });
    }

  } catch (err) {
    console.error('Error cargando dashboard:', err);
  }
}
