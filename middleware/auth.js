const { expressjwt: expressJwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const pool    = require('../db');

const checkJwt = expressJwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
  }),
  audience:   process.env.AUTH0_AUDIENCE,
  issuer:     `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
});

async function loadUser(req, res, next) {
  try {
    const sub   = req.auth.sub;
    const email = req.auth.email || req.auth[`${process.env.AUTH0_AUDIENCE}/email`] || null;
    const nombre = req.auth.name || null;

    let result = await pool.query(
      'SELECT * FROM usuarios WHERE auth0_sub = $1',
      [sub]
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO usuarios (auth0_sub, email, nombre, rol)
         VALUES ($1, $2, $3, 'socio')
         RETURNING *`,
        [sub, email, nombre]
      );
    }

    await pool.query(
      'UPDATE usuarios SET last_login = NOW() WHERE auth0_sub = $1',
      [sub]
    );

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error('Error en loadUser:', err.message);
    res.status(500).json({ error: 'Error interno de autenticación' });
  }
}

function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    next();
  };
}

const requireAuth = [checkJwt, loadUser];

function handleAuthErrors(err, req, res, next) {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Token inválido o ausente' });
  }
  next(err);
}

module.exports = { requireAuth, requireRol, handleAuthErrors };
