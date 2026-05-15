'use strict';

const { expressjwt: jwt } = require('express-jwt');

const checkJwt = jwt({
  secret:     () => process.env.JWT_SECRET,
  audience:   'deporte-pedrola',
  issuer:     'deporte-pedrola',
  algorithms: ['HS256'],
  // Cloudflare Access elimina el header Authorization; el cliente también envía
  // el token en X-Club-Token como fallback.
  getToken: (req) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    const custom = req.headers['x-club-token'];
    if (custom) return custom;
    return null;
  },
});

function checkPermission(permission) {
  return (req, res, next) => {
    const permissions = req.auth && req.auth.permissions;
    if (!Array.isArray(permissions) || !permissions.includes(permission)) {
      return res.status(403).json({ error: 'Permiso insuficiente.' });
    }
    next();
  };
}

module.exports = { checkJwt, checkPermission };
