// Helper centralizado para llamadas autenticadas al API.
// Si el servidor responde 401 (token expirado), limpia la sesión y muestra el login.
// Expone: window.setToken(jwt), window.api(path, options)

(function () {
  'use strict';

  var _bearer = null;

  window['setToken'] = function (jwt) {
    _bearer = jwt;
  };

  function _doLogout() {
    _bearer = null;
    sessionStorage.clear();
    // Recarga la página para que initAuth() muestre el formulario de login
    window.location.reload();
  }

  window.api = async function (path, options) {
    var opts = options || {};
    var authHeader = _bearer ? { Authorization: 'Bearer ' + _bearer } : {};
    var headers = Object.assign(
      { 'Content-Type': 'application/json' },
      opts.headers || {},
      authHeader
    );

    var res = await fetch(path, Object.assign({}, opts, { headers: headers }));

    if (res.status === 401) {
      _doLogout();
      return null;
    }

    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      throw new Error(err.error || err.detail || 'HTTP ' + res.status);
    }

    return res.json();
  };
}());
