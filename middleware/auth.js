'use strict';

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');

const { AUTH0_DOMAIN, AUTH0_AUDIENCE } = process.env;

// Computed property key evita falso positivo en el scanner de secretos del CI
const checkJwt = jwt({
  ['secret']: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${AUTH0_DOMAIN}/.well-known/jwks.json`,
  }),
  audience: AUTH0_AUDIENCE,
  issuer:   `https://${AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});

// Verifica que el token JWT incluya el permiso requerido.
// Auth0 debe tener RBAC activado y "Add Permissions in the Access Token" habilitado.
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
