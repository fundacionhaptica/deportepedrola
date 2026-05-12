'use strict';

const express = require('express');
const path    = require('path');

const { checkJwt, checkPermission } = require('./middleware/auth');

// Permisos:
//   read:datos   → socio, junta, admin  (GET)
//   write:datos  → junta, admin         (POST/PUT/PATCH)
//   delete:datos → solo admin           (DELETE)
const canRead   = checkPermission('read:datos');
const canWrite  = checkPermission('write:datos');
const canDelete = checkPermission('delete:datos');

function byMethod({ read, write, del }) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return read(req, res, next);
    if (req.method === 'DELETE')                        return del(req, res, next);
    return write(req, res, next);
  };
}

const checkRole = byMethod({ read: canRead, write: canWrite, del: canDelete });

const app  = express();
const PORT = process.env.PORT || 3000;

// Webhook Stripe: raw body ANTES de express.json() — ver CLAUDE.md regla 3
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Logger temporal: todas las peticiones a /api con su header de auth
app.use('/api', (req, _res, next) => {
  const auth = req.headers.authorization;
  console.log(`[req] ${req.method} ${req.path} | auth: ${auth ? auth.slice(0, 15) + '...' : 'MISSING'}`);
  next();
});

// Rutas
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/inscripciones', require('./routes/inscripciones'));
app.use('/api/dashboard', checkJwt, canRead,   require('./routes/dashboard'));
app.use('/api/socios',    checkJwt, checkRole, require('./routes/socios'));
app.use('/api/precios',   checkJwt, checkRole, require('./routes/precios'));
app.use('/api/pagos',     checkJwt, checkRole, require('./routes/pagos'));
app.use('/api/facturas',  checkJwt, checkRole, require('./routes/facturas'));
app.use('/api/stripe',                         require('./routes/stripe'));

// Páginas públicas de inscripciones (sin autenticación)
var EVENTOS_PUBLICOS = ['cuotas', '10k', 'donacion', 'maraton-futbolsala', 'copa-futbol', 'san-silvestre'];
app.get('/inscripciones', function (_req, res) {
  res.sendFile(path.join(__dirname, 'public', 'inscripciones', 'index.html'));
});
app.get('/inscripciones/ok', function (_req, res) {
  res.sendFile(path.join(__dirname, 'public', 'inscripciones', 'ok.html'));
});
EVENTOS_PUBLICOS.forEach(function (e) {
  app.get('/inscripciones/' + e, function (_req, res) {
    res.sendFile(path.join(__dirname, 'public', 'inscripciones', e + '.html'));
  });
});

// Página de facturas (requiere auth, resuelta en cliente)
app.get('/facturas', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'facturas.html'));
});

// Todas las rutas no-API y no-inscripciones devuelven el SPA
app.get(/^(?!\/api|\/inscripciones).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Manejador de errores JWT — convierte UnauthorizedError en 401 limpio
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    console.log(`[jwt-error] ${req.method} ${req.path} | header: ${req.headers.authorization || 'MISSING'} | msg: ${err.message}`);
    return res.status(401).json({ error: 'No autenticado.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`[app] Servidor iniciado en http://localhost:${PORT}`);
});
