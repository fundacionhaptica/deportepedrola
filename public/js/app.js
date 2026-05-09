import { render as renderDashboard  } from './views/dashboard.js';
import { render as renderSocios     } from './views/socios.js';
import { render as renderFacturas   } from './views/facturas.js';
import { render as renderIngresos   } from './views/ingresos.js';
import { render as renderEstructura } from './views/estructura.js';

let auth0Client = null;
let accessToken = null; // token en memoria

async function init() {
  // 1. Cargar config del servidor
  const config = await fetch('/api/config').then(r => r.json());

  // 2. Crear cliente Auth0
  auth0Client = await createAuth0Client({
    domain:   config.auth0_domain,
    clientId: config.auth0_client_id,
    authorizationParams: {
      redirect_uri: window.location.origin,
      audience:     config.auth0_audience,
    },
    cacheLocation: 'localstorage',
  });

  // Manejar callback de redirect
  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const isAuthenticated = await auth0Client.isAuthenticated();

  // Ocultar spinner siempre
  document.getElementById('auth-loading').style.display = 'none';

  if (!isAuthenticated) {
    // 3. Mostrar pantalla de login
    const loginPage = document.getElementById('login-page');
    loginPage.style.display = '';
    document.getElementById('btn-login').addEventListener('click', () => {
      auth0Client.loginWithRedirect();
    });
    return;
  }

  // 4. Guardar access token en memoria
  accessToken = await auth0Client.getTokenSilently();

  // 5. Helper API autenticado
  window.api = async (path, opts = {}) => {
    // Refrescar token si expiró
    accessToken = await auth0Client.getTokenSilently();
    const isForm = opts.body instanceof FormData;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
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

  // Mostrar nombre de usuario y botón logout
  const user = await auth0Client.getUser();
  document.getElementById('user-name').textContent = user.name || user.email || '';

  // 3. Botón logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
  });

  // Mostrar app shell
  document.getElementById('app-shell').style.display = '';

  // 6. Router por hash
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
  document.getElementById('auth-loading').innerHTML =
    `<span style="color:var(--danger)">Error al cargar: ${err.message}</span>`;
});
