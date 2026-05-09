const express = require('express');
const pool    = require('../db');
const stripe  = require('../lib/stripe');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

// GET / — listar socios (admin/tesorero: todos; socio: solo el suyo)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { activo, search, limit = 100, offset = 0 } = req.query;
    const params = [];
    const conditions = [];

    // El rol socio solo puede ver su propio registro
    if (req.user.rol === 'socio') {
      if (!req.user.socio_id) return res.json([]);
      conditions.push(`s.id = $${params.push(req.user.socio_id)}`);
    }

    if (activo !== undefined) {
      conditions.push(`s.activo = $${params.push(activo === 'true')}`);
    }

    if (search) {
      const like = `%${search}%`;
      conditions.push(`(s.nombre ILIKE $${params.push(like)} OR s.apellidos ILIKE $${params.push(like)} OR s.dni ILIKE $${params.push(like)})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.id, s.numero_socio, s.nombre, s.apellidos, s.dni, s.email,
              s.telefono, s.activo, s.fecha_alta, s.fecha_baja, s.fecha_nacimiento
       FROM socios s
       ${where}
       ORDER BY s.apellidos, s.nombre
       LIMIT $${params.push(Number(limit))} OFFSET $${params.push(Number(offset))}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar socios' });
  }
});

// GET /:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.rol === 'socio' && req.user.socio_id !== id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await pool.query('SELECT * FROM socios WHERE id = $1', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener socio' });
  }
});

// POST / — crear socio (admin/tesorero)
router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const {
      numero_socio, nombre, apellidos, dni, fecha_nacimiento, email, telefono,
      direccion, cp, poblacion, provincia,
      tutor_nombre, tutor_dni, tutor_email, tutor_telefono,
      iban, activo = true, fecha_alta, notas,
    } = req.body;

    if (!nombre || !apellidos) {
      return res.status(400).json({ error: 'nombre y apellidos son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO socios
         (numero_socio, nombre, apellidos, dni, fecha_nacimiento, email, telefono,
          direccion, cp, poblacion, provincia,
          tutor_nombre, tutor_dni, tutor_email, tutor_telefono,
          iban, activo, fecha_alta, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [numero_socio, nombre, apellidos, dni || null, fecha_nacimiento || null,
       email || null, telefono || null, direccion || null, cp || null,
       poblacion || null, provincia || null,
       tutor_nombre || null, tutor_dni || null, tutor_email || null, tutor_telefono || null,
       iban || null, activo, fecha_alta || null, notas || null]
    );

    const socio = result.rows[0];

    // Crear Stripe customer si tiene email (no crítico)
    if (socio.email) {
      stripe.customers.create({ email: socio.email, name: `${socio.nombre} ${socio.apellidos}` })
        .then((c) => pool.query('UPDATE socios SET stripe_customer_id=$1 WHERE id=$2', [c.id, socio.id]))
        .catch((e) => console.error('Stripe customer create:', e.message));
    }

    res.status(201).json(socio);
  } catch (err) {
    console.error(err);
    if (err.constraint === 'socios_dni_key') return res.status(409).json({ error: 'DNI duplicado' });
    if (err.constraint === 'socios_numero_socio_key') return res.status(409).json({ error: 'Número de socio duplicado' });
    res.status(500).json({ error: 'Error al crear socio' });
  }
});

// PUT /:id — editar (admin/tesorero o propio socio)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.rol === 'socio' && req.user.socio_id !== id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const {
      nombre, apellidos, email, telefono, direccion, cp, poblacion, provincia,
      tutor_nombre, tutor_dni, tutor_email, tutor_telefono, iban, notas,
    } = req.body;

    const result = await pool.query(
      `UPDATE socios SET
         nombre=$1, apellidos=$2, email=$3, telefono=$4,
         direccion=$5, cp=$6, poblacion=$7, provincia=$8,
         tutor_nombre=$9, tutor_dni=$10, tutor_email=$11, tutor_telefono=$12,
         iban=$13, notas=$14
       WHERE id=$15 RETURNING *`,
      [nombre, apellidos, email || null, telefono || null,
       direccion || null, cp || null, poblacion || null, provincia || null,
       tutor_nombre || null, tutor_dni || null, tutor_email || null, tutor_telefono || null,
       iban || null, notas || null, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar socio' });
  }
});

// DELETE /:id — baja lógica (admin)
router.delete('/:id', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE socios SET activo=false, fecha_baja=CURRENT_DATE WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al dar de baja' });
  }
});

// GET /:id/inscripciones
router.get('/:id/inscripciones', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (req.user.rol === 'socio' && req.user.socio_id !== id) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const result = await pool.query(
      `SELECT sd.*, d.nombre AS disciplina_nombre, e.nombre AS equipo_nombre, s.nombre AS seccion_nombre
       FROM socios_disciplinas sd
       JOIN disciplinas d ON d.id = sd.disciplina_id
       LEFT JOIN equipos e ON e.id = sd.equipo_id
       JOIN secciones s ON s.id = d.seccion_id
       WHERE sd.socio_id = $1
       ORDER BY sd.temporada DESC, d.nombre`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar inscripciones' });
  }
});

// POST /:id/inscripciones
router.post('/:id/inscripciones', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const socio_id = Number(req.params.id);
    const { disciplina_id, equipo_id, temporada, fecha_inicio } = req.body;

    if (!disciplina_id || !temporada) {
      return res.status(400).json({ error: 'disciplina_id y temporada son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO socios_disciplinas (socio_id, disciplina_id, equipo_id, temporada, fecha_inicio)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (socio_id, disciplina_id, temporada) DO UPDATE
         SET activo=true, equipo_id=$3, fecha_inicio=$5
       RETURNING *`,
      [socio_id, disciplina_id, equipo_id || null, temporada, fecha_inicio || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear inscripción' });
  }
});

module.exports = router;
