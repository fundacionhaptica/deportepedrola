const express = require('express');
const pool    = require('../db');
const stripe  = require('../lib/stripe');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

// POST /cuota — crear sesión de pago de cuota
router.post('/cuota', requireAuth, async (req, res) => {
  try {
    const { socio_id, disciplina_id, temporada } = req.body;

    if (!socio_id || !disciplina_id || !temporada) {
      return res.status(400).json({ error: 'socio_id, disciplina_id y temporada son obligatorios' });
    }

    // El socio solo puede pagar su propia cuota
    if (req.user.rol === 'socio' && req.user.socio_id !== Number(socio_id)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const [socioRes, disciplinaRes] = await Promise.all([
      pool.query('SELECT * FROM socios WHERE id = $1 AND activo = true', [socio_id]),
      pool.query('SELECT * FROM disciplinas WHERE id = $1', [disciplina_id]),
    ]);

    if (!socioRes.rows.length)      return res.status(404).json({ error: 'Socio no encontrado' });
    if (!disciplinaRes.rows.length) return res.status(404).json({ error: 'Disciplina no encontrada' });

    const socio      = socioRes.rows[0];
    const disciplina = disciplinaRes.rows[0];
    const precio     = parseFloat(disciplina.precio_cuota_anual);

    if (precio <= 0) {
      return res.status(400).json({ error: 'Esta disciplina no tiene precio configurado' });
    }

    const sessionParams = {
      mode:    'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  Math.round(precio * 100),
          product_data: {
            name:        `Cuota ${disciplina.nombre} — ${temporada}`,
            description: `${socio.nombre} ${socio.apellidos}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        tipo:          'cuota',
        socio_id:      String(socio_id),
        disciplina_id: String(disciplina_id),
        seccion_id:    String(disciplina.seccion_id),
        temporada,
      },
      success_url: `${PUBLIC_URL}/pago/ok?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${PUBLIC_URL}/pago/cancelado`,
    };

    if (socio.stripe_customer_id) {
      sessionParams.customer = socio.stripe_customer_id;
    } else if (socio.email) {
      sessionParams.customer_email = socio.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear sesión de pago' });
  }
});

// POST /inscripcion — sesión de pago para inscripción (importe libre)
router.post('/inscripcion', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const { socio_id, importe, descripcion, seccion_id, equipo_id } = req.body;

    if (!socio_id || !importe || !descripcion) {
      return res.status(400).json({ error: 'socio_id, importe y descripcion son obligatorios' });
    }

    const socioRes = await pool.query('SELECT * FROM socios WHERE id = $1 AND activo = true', [socio_id]);
    if (!socioRes.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });

    const socio = socioRes.rows[0];

    const sessionParams = {
      mode:    'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'eur',
          unit_amount:  Math.round(parseFloat(importe) * 100),
          product_data: {
            name:        descripcion,
            description: `${socio.nombre} ${socio.apellidos}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        tipo:       'inscripcion',
        socio_id:   String(socio_id),
        seccion_id: seccion_id ? String(seccion_id) : '',
        equipo_id:  equipo_id  ? String(equipo_id)  : '',
      },
      success_url: `${PUBLIC_URL}/pago/ok?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${PUBLIC_URL}/pago/cancelado`,
    };

    if (socio.stripe_customer_id) {
      sessionParams.customer = socio.stripe_customer_id;
    } else if (socio.email) {
      sessionParams.customer_email = socio.email;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear sesión de inscripción' });
  }
});

module.exports = router;
