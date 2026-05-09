'use strict';

const router = require('express').Router();

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

const BASE = process.env.PUBLIC_URL || 'http://localhost:3000';

// Precios en céntimos — ajustar cada temporada
const PRECIOS = {
  cuotas:               null,   // variable según categoría, viene en req.body
  '10k':                800,    // 8 €  — ajustar
  'maraton-futbolsala': 4000,   // 40 € por equipo — ajustar
  'copa-futbol':        3000,   // 30 € por equipo — ajustar
  donacion:             null,   // libre, viene en req.body
  'san-silvestre':      0,      // gratuita
};

const NOMBRES = {
  cuotas:               'Cuota socio — CDE Deporte Pedrola',
  '10k':                'Carrera 10K — CDE Deporte Pedrola',
  'maraton-futbolsala': 'Maratón Fútbol Sala — CDE Deporte Pedrola',
  'copa-futbol':        'Copa Fútbol — CDE Deporte Pedrola',
  donacion:             'Donación — CDE Deporte Pedrola',
  'san-silvestre':      'San Silvestre — CDE Deporte Pedrola',
};

router.post('/checkout', async (req, res) => {
  const { evento, nombre, email, importe_cents, meta } = req.body;

  if (!Object.prototype.hasOwnProperty.call(PRECIOS, evento)) {
    return res.status(400).json({ error: 'Evento no válido' });
  }

  const importe = PRECIOS[evento] ?? importe_cents;

  // Inscripción gratuita — sin Stripe
  if (importe === 0) {
    return res.json({
      redirect: `/inscripciones/ok?evento=${evento}&nombre=${encodeURIComponent(nombre || '')}`,
    });
  }

  if (!stripe) {
    return res.status(503).json({
      error: 'Los pagos no están configurados todavía. Contacta al club.',
    });
  }

  if (!importe || importe < 100) {
    return res.status(400).json({ error: 'Importe inválido' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: email || undefined,
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: importe,
          product_data: {
            name: NOMBRES[evento],
            description: nombre ? `Inscripción: ${nombre}` : undefined,
          },
        },
        quantity: 1,
      }],
      success_url: `${BASE}/inscripciones/ok?evento=${evento}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE}/inscripciones/${evento}`,
      metadata:    { evento, nombre: nombre || '', email: email || '', ...meta },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[inscripciones/checkout]', err.message);
    res.status(500).json({ error: 'Error al crear el pago. Inténtalo de nuevo.' });
  }
});

module.exports = router;
