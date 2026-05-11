'use strict';

const { expressjwt: jwt } = require('express-jwt');

const checkJwt = jwt({
  secret:     () => process.env.JWT_SECRET,
  audience:   'deporte-pedrola',
  issuer:     'deporte-pedrola',
  algorithms: ['HS256'],
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
