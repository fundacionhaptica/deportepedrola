'use strict';

const express = require('express');
const path    = require('path');

const { checkJwt, checkPermission, normalizarAuthHeader } = require('./middleware/auth');

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

function checkJwtOrInternalKey(req, res, next) {
  const internalKey = process.env.INTERNAL_API_KEY;
  if (internalKey && req.headers['x-internal-key'] === internalKey) {
    req.auth = { sub: 'internal-cowork', permissions: ['read:datos', 'write:datos', 'delete:datos'] };
    return next();
  }
  return checkJwt(req, res, next);
}

// Helper: envia HTML con cabeceras anti-cache para que el navegador
// siempre pida la version mas reciente del fichero.
function sendHtml(file) {
  return (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', file));
  };
}

const app  = express();
const PORT = process.env.PORT || 3000;

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// Archivos estaticos: JS, CSS, imagenes con cache normal; HTML sin cache
app.use(express.static(path.join(__dirname, 'public'), {
  // No cachear HTML via express.static (las rutas especificas ya tienen sendHtml)
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  },
}));

app.use('/api', (req, _res, next) => {
  const auth = req.headers.authorization;
  console.log(`[req] ${req.method} ${req.path} | auth: ${auth ? auth.slice(0, 15) + '...' : 'MISSING'}`);
  next();
});

app.use('/api', normalizarAuthHeader);

// Rutas API
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/inscripciones', require('./routes/inscripciones'));
app.use('/api/dashboard', checkJwt, canRead,   require('./routes/dashboard'));
app.use('/api/gastos',    checkJwt, canRead,   require('./routes/gastos-dashboard'));
app.use('/api/ingresos',  checkJwt, canRead,   require('./routes/ingresos-dashboard'));
app.use('/api/socios',    checkJwt, checkRole, require('./routes/socios'));
app.use('/api/precios',   checkJwt, checkRole, require('./routes/precios'));
app.use('/api/pagos',     checkJwt, checkRole, require('./routes/pagos'));
app.use('/api/facturas',      checkJwtOrInternalKey, checkRole, require('./routes/facturas'));
app.use('/api/certificados',  checkJwt, canWrite,  require('./routes/certificados'));
app.use('/api/cuotas',        checkJwt, checkRole, require('./routes/cuotas'));
app.use('/api/movimientos',   checkJwt, checkRole, require('./routes/movimientos'));
app.use('/api/conciliacion',  checkJwt, checkRole, require('./routes/conciliacion'));
app.use('/api/proveedores',   checkJwt, checkRole, require('./routes/proveedores'));
app.use('/api/conceptos',     checkJwt, checkRole, require('./routes/conceptos'));
app.use('/api/stripe',                              require('./routes/stripe'));

// Paginas publicas de inscripciones
var EVENTOS_PUBLICOS = ['cuotas', '10k', 'donacion', 'maraton-futbolsala', 'copa-futbol', 'san-silvestre'];
app.get('/inscripciones', sendHtml('inscripciones/index.html'));
app.get('/inscripciones/ok', sendHtml('inscripciones/ok.html'));
EVENTOS_PUBLICOS.forEach(e => app.get('/inscripciones/' + e, sendHtml('inscripciones/' + e + '.html')));

// Paginas autenticadas (auth resuelta en cliente)
app.get('/facturas',     sendHtml('facturas.html'));
app.get('/certificados', sendHtml('certificados.html'));
app.get('/proveedores',  sendHtml('proveedores.html'));
app.get('/conciliacion', sendHtml('conciliacion.html'));
app.get('/justificantes',sendHtml('justificantes.html'));
app.get('/gastos',       sendHtml('gastos.html'));
app.get('/ingresos',     sendHtml('ingresos.html'));

// SPA fallback
app.get(/^\/(?!api|inscripciones)/, sendHtml('index.html'));

// Manejador de errores JWT
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    console.log(`[jwt-error] ${req.method} ${req.path} | auth: ${req.headers.authorization || 'MISSING'} | x-club-token: ${req.headers['x-club-token'] ? 'presente' : 'MISSING'} | msg: ${err.message}`);
    return res.status(401).json({ error: 'No autenticado.' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`[app] Servidor iniciado en http://localhost:${PORT}`);
});