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
app.use('/api/dashboard', checkJwt, require('./routes/dashboard'));
app.use('/api/socios',    checkJwt, require('./routes/socios'));
app.use('/api/pagos',     checkJwt, require('./routes/pagos'));
app.use('/api/stripe',             require('./routes/stripe'));
app.use('/auth',                   require('./routes/auth'));

// Todas las rutas no-API devuelven el SPA
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[app] Servidor iniciado en http://localhost:${PORT}`);
});
