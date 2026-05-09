'use strict';

const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool   = require('../db/pool');

// Webhook — el body llega raw gracias al middleware en server.js (CLAUDE.md regla 3)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    await pool.query(
      "UPDATE pagos SET estado = 'pagado' WHERE stripe_pi_id = $1",
      [pi.id]
    );
  }

  res.json({ received: true });
});

// Crear sesión de checkout para pago único
router.post('/checkout', async (req, res) => {
  const { concepto, importe_cents, socio_id } = req.body;
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',   // solo pagos únicos — ver CLAUDE.md regla 9
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: importe_cents,
          product_data: { name: concepto },
        },
        quantity: 1,
      }],
      success_url: `${base}/pago/ok?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${base}/`,
      metadata:    { socio_id: String(socio_id || '') },
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
