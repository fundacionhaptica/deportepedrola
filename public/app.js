// Helper centralizado para llamadas autenticadas al API.
// Si el servidor responde 401 (token expirado o inválido), redirige
// automáticamente al logout de Auth0 para evitar fallos silenciosos.

let _token = null;

export function setToken(token) {
  _token = token;
}

export function getToken() {
  return _token;
}

async function doLogout() {
  _token = null;
  window.location.href = '/auth/logout';
}

window.api = async (path, options = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
  };

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401) {
    await doLogout();
    return null;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || `HTTP ${res.status}`);
  }

  return res.json();
};
