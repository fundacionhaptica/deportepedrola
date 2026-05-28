'use strict';

const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool   = require('../db/pool');

// POST /api/stripe/webhook
// Webhook que Stripe llama tras un pago. El body llega RAW gracias al middleware
// en server.js (CLAUDE.md regla 3 — no mover, rompe la verificación de firma).
//
// Procesa el evento canonico para Stripe Checkout: checkout.session.completed.
// Tambien acepta payment_intent.succeeded como fallback (algunos flujos antiguos).
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[stripe/webhook] firma invalida:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // El payment_intent puede llegar como string o expandido; nos quedamos con el id
      const pi = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent && session.payment_intent.id;

      const { rowCount } = await pool.query(
        `UPDATE pagos
           SET estado       = 'pagado',
               stripe_pi_id = COALESCE($2, stripe_pi_id),
               fecha        = COALESCE(fecha, CURRENT_DATE)
         WHERE stripe_session_id = $1`,
        [session.id, pi]
      );
      console.log(`[stripe/webhook] checkout.session.completed ${session.id} → ${rowCount} fila(s) actualizada(s)`);
    } else if (event.type === 'payment_intent.succeeded') {
      // Fallback para flujos que no usan Checkout (futuro o legacy)
      const pi = event.data.object;
      await pool.query(
        "UPDATE pagos SET estado = 'pagado' WHERE stripe_pi_id = $1",
        [pi.id]
      );
    } else {
      // Cualquier otro evento se ignora (Stripe manda muchos)
      console.log(`[stripe/webhook] evento ignorado: ${event.type}`);
    }
  } catch (err) {
    console.error('[stripe/webhook] error procesando evento:', err.message);
    // 200 igualmente para que Stripe NO reintente; el error queda en logs.
  }

  res.json({ received: true });
});

// POST /api/stripe/checkout
// Endpoint para crear un checkout suelto (NO eventos, NO inscripciones).
// PROTEGIDO: este endpoint NO debe llamarse desde el frontend público porque
// acepta importe del cliente. Mantenido para uso administrativo desde scripts.
router.post('/checkout', async (req, res) => {
  const { concepto, importe_cents, socio_id } = req.body;
  const base = process.env.PUBLIC_URL || 'http://localhost:3000';

  if (!concepto || !importe_cents || importe_cents < 100) {
    return res.status(400).json({ error: 'Faltan datos o importe demasiado bajo (mínimo 1 €)' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',  // solo pagos únicos — CLAUDE.md regla 9
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
      metadata:    { socio_id: String(socio_id || ''), origen: 'stripe.checkout' },
    });

    // Registrar el pago como pendiente para que el webhook lo encuentre
    await pool.query(
      `INSERT INTO pagos (socio_id, concepto, importe, stripe_session_id, estado, metadata)
       VALUES ($1, $2, $3, $4, 'pendiente', $5)`,
      [socio_id || null, concepto, importe_cents / 100, session.id,
       JSON.stringify({ origen: 'stripe.checkout' })]
    );

    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;