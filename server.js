require('dotenv').config();

const express  = require('express');
const path     = require('path');
const pool     = require('./db');
const stripe   = require('./lib/stripe');
const { handleAuthErrors } = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3000;

// =============================================================================
// 1. STRIPE WEBHOOK — ANTES de express.json()
//    Requiere body raw para verificar firma. No mover este bloque.
// =============================================================================

app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig    = req.headers['stripe-signature'];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      console.error('Stripe webhook firma inválida:', err.message);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const meta    = session.metadata || {};

      try {
        await pool.query(
          `INSERT INTO ingresos
             (tipo, fecha, importe, concepto,
              socio_id, seccion_id, equipo_id, disciplina_id,
              es_tesoreria, stripe_session_id, stripe_payment_intent_id)
           VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, false, $8, $9)
           ON CONFLICT DO NOTHING`,
          [
            meta.tipo || 'otro',
            session.amount_total / 100,
            session.metadata?.tipo === 'cuota'
              ? `Cuota ${meta.temporada || ''}`
              : (session.display_items?.[0]?.custom?.name || 'Pago Stripe'),
            meta.socio_id      ? Number(meta.socio_id)      : null,
            meta.seccion_id    ? Number(meta.seccion_id)    : null,
            meta.equipo_id     ? Number(meta.equipo_id)     : null,
            meta.disciplina_id ? Number(meta.disciplina_id) : null,
            session.id,
            session.payment_intent,
          ]
        );
      } catch (err) {
        console.error('Error insertando ingreso desde webhook:', err.message);
        // Devolver 200 igualmente para que Stripe no reintente
      }
    }

    res.json({ received: true });
  }
);

// =============================================================================
// 2. PARSERS
// =============================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// =============================================================================
// 3. CORS — abierto por ahora (Cloudflare Tunnel se encarga del TLS)
// =============================================================================

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// =============================================================================
// 4. FICHEROS ESTÁTICOS
// =============================================================================

app.use(express.static(path.join(__dirname, 'public')));

// =============================================================================
// 5. ENDPOINT PÚBLICO — configuración Auth0 para el frontend
// =============================================================================

app.get('/api/config', (_req, res) => {
  res.json({
    auth0_domain:    process.env.AUTH0_DOMAIN,
    auth0_client_id: process.env.AUTH0_CLIENT_ID,
    auth0_audience:  process.env.AUTH0_AUDIENCE,
  });
});

// =============================================================================
// 6. RUTAS API
// =============================================================================

app.use('/api/socios',      require('./routes/socios'));
app.use('/api/estructura',  require('./routes/estructura'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/facturas',    require('./routes/facturas'));
app.use('/api/ingresos',    require('./routes/ingresos'));
app.use('/api/informes',    require('./routes/informes'));
app.use('/api/stripe',      require('./routes/stripe'));

// =============================================================================
// 7. SPA FALLBACK — rutas del frontend (hash router no necesita esto,
//    pero cubre /pago/ok y /pago/cancelado que Stripe redirige)
// =============================================================================

app.get('/pago/ok',        (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pago/cancelado', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// =============================================================================
// 8. MANEJO DE ERRORES
// =============================================================================

// JWT inválido o ausente
app.use(handleAuthErrors);

// Error genérico
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// =============================================================================
// 9. ARRANQUE
// =============================================================================

app.listen(PORT, () => {
  console.log(`Servidor arrancado en puerto ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
