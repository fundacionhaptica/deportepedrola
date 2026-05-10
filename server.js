'use strict';

const express = require('express');
const path    = require('path');

const { checkJwt } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// Webhook Stripe: raw body ANTES de express.json() — ver CLAUDE.md regla 3
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.use('/api/inscripciones',      require('./routes/inscripciones'));
app.use('/api/dashboard', checkJwt, require('./routes/dashboard'));
app.use('/api/socios',    checkJwt, require('./routes/socios'));
app.use('/api/pagos',     checkJwt, require('./routes/pagos'));
app.use('/api/stripe',             require('./routes/stripe'));
app.use('/auth',                   require('./routes/auth'));

// Páginas públicas de inscripciones (sin Auth0)
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

// Todas las rutas no-API y no-inscripciones devuelven el SPA con config Auth0 inyectada
const fs = require('fs');
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const auth0Script = `<script>
window.__AUTH0_DOMAIN__   = ${JSON.stringify(process.env.AUTH0_DOMAIN   || '')};
window.__AUTH0_CLIENT__   = ${JSON.stringify(process.env.AUTH0_CLIENT_ID || '')};
window.__AUTH0_AUDIENCE__ = ${JSON.stringify(process.env.AUTH0_AUDIENCE  || '')};
</script>`;
const indexWithAuth0 = indexHtml.replace('</head>', auth0Script + '\n</head>');

app.get(/^(?!\/api|\/inscripciones).*/, (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(indexWithAuth0);
});

app.listen(PORT, () => {
  console.log(`[app] Servidor iniciado en http://localhost:${PORT}`);
});
