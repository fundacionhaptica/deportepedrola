import { render as renderDashboard  } from './views/dashboard.js';
import { render as renderSocios     } from './views/socios.js';
import { render as renderFacturas   } from './views/facturas.js';
import { render as renderIngresos   } from './views/ingresos.js';
import { render as renderEstructura } from './views/estructura.js';

let auth0Client = null;

// ─── Inicialización ───────────────────────────────────────────────────────────

async function init() {
  const config = await fetch('/api/config').then(r => r.json());

  // createAuth0Client es global inyectado por el CDN de auth0-spa-js
  auth0Client = await createAuth0Client({
    domain:   config.auth0_domain,
    clientId: config.auth0_client_id,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience:     config.auth0_audience,
    },
    cacheLocation: 'localstorage',
  });

  // Manejar callback de redirect de Auth0
  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const isAuthenticated = await auth0Client.isAuthenticated();
  if (!isAuthenticated) {
    await auth0Client.loginWithRedirect();
    return; // la página se redirige, no continuar
  }

  // ─── window.api — helper autenticado ────────────────────────────────────────
  // Uso: window.api('/socios', { method:'POST', body: JSON.stringify(data) })
  // Para FormData (uploads) no establece Content-Type (el navegador lo pone con boundary)
  window.api = async (path, opts = {}) => {
    const token  = await auth0Client.getTokenSilently();
    const isForm = opts.body instanceof FormData;
    const headers = {
      'Authorization': `Bearer ${token}`,
      ...(!isForm && { 'Content-Type': 'application/json' }),
      ...(opts.headers || {}),
    };
    const res = await fetch('/api' + path, { ...opts, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Error ${res.status}`);
    }
    return res.json();
  };

  // ─── UI de usuario ───────────────────────────────────────────────────────────
  const user = await auth0Client.getUser();
  document.getElementById('user-name').textContent = user.name || user.email || '';

  document.getElementById('btn-logout').addEventListener('click', () => {
    auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
  });

  // Mostrar shell y ocultar spinner
  document.getElementById('auth-loading').style.display = 'none';
  document.getElementById('app-shell').style.display    = '';

  // ─── Router ──────────────────────────────────────────────────────────────────
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  const app  = document.getElementById('app');

  document.querySelectorAll('#main-nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
  });

  switch (hash) {
    case 'socios':     renderSocios(app);     break;
    case 'facturas':   renderFacturas(app);   break;
    case 'ingresos':   renderIngresos(app);   break;
    case 'estructura': renderEstructura(app); break;
    default:           renderDashboard(app);
  }
}

init().catch(err => {
  console.error('Error de inicialización:', err);
  document.getElementById('auth-loading').textContent = 'Error al cargar la aplicación.';
});
