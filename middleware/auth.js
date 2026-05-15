'use strict';

const { expressjwt: jwt } = require('express-jwt');

const checkJwt = jwt({
  secret:     () => process.env.JWT_SECRET,
  audience:   'deporte-pedrola',
  issuer:     'deporte-pedrola',
  algorithms: ['HS256'],
});

// Cloudflare Access elimina el header Authorization antes de llegar al servidor.
// Este middleware copia X-Club-Token → Authorization para que checkJwt lo encuentre.
function normalizarAuthHeader(req, _res, next) {
  if (!req.headers.authorization && req.headers['x-club-token']) {
    req.headers.authorization = 'Bearer ' + req.headers['x-club-token'];
  }
  next();
}

function checkPermission(permission) {
  return (req, res, next) => {
    const permissions = req.auth && req.auth.permissions;
    if (!Array.isArray(permissions) || !permissions.includes(permission)) {
      return res.status(403).json({ error: 'Permiso insuficiente.' });
    }
    next();
  };
}

module.exports = { checkJwt, checkPermission, normalizarAuthHeader };
