'use strict';

// /api/movimientos — CRUD del libro de caja.
// Cubre gastos sin factura (comisiones bancarias, TPV, dietas en efectivo),
// ingresos manuales (donaciones, cuotas en mano) y adelantos del presidente.
//
// Tipos permitidos: 'ingreso', 'gasto', 'adelanto_presidente'
// Si tipo='adelanto_presidente', es_tesoreria pasa a true automáticamente
// (regla #6 del CLAUDE.md: los adelantos NO computan como ingreso real).
//
// Permisos:
//   GET    → read:datos  (socio, junta, admin)
//   POST   → write:datos (junta, admin)
//   PATCH  → write:datos (junta, admin)
//   DELETE → delete:datos (solo admin)
//
// También expone:
//   GET /libro-caja            → vista unificada v_libro_caja
//   GET /resumen/deporte       → vista v_resumen_deporte
//   GET /resumen/concepto      → vista v_resumen_concepto
//   GET /resumen/equipo        → vista v_resumen_equipo

const router = require('express').Router();
const db     = require('../db/pool');

const TIPOS_VALIDOS = ['ingreso', 'gasto', 'adelanto_presidente'];

// GET /api/movimientos — listado con filtros opcionales
router.get('/', async (req, res) => {
  try {
    const { desde, hasta, tipo, page = 1 } = req.query;
    const limit  = 50;
    const offset = (Number(page) - 1) * limit;
    const params = [];
    const conds  = [];

    if (desde) { params.push(desde); conds.push(`fecha >= $${params.length}`); }
    if (hasta) { params.push(hasta); conds.push(`fecha <= $${params.length}`); }
    if (tipo)  { params.push(tipo);  conds.push(`tipo = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT id, tipo, concepto, importe, es_tesoreria, fecha, referencia, created_at
         FROM movimientos ${where}
         ORDER BY fecha DESC, id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: [{ total }] } = await db.query(
      `SELECT COUNT(*) AS total FROM movimientos ${where}`,
      params.slice(0, -2)
    );

    res.json({ movimientos: rows, total: Number(total), page: Number(page), limit });
  } catch (e) {
    console.error('[movimientos] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/movimientos/libro-caja — vista unificada (facturas + movimientos + pagos)
router.get('/libro-caja', async (req, res) => {
  try {
    const { desde, hasta, tipo, deporte, limit = 100, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const conds  = [];

    if (desde)   { params.push(desde);   conds.push(`fecha >= $${params.length}`); }
    if (hasta)   { params.push(hasta);   conds.push(`fecha <= $${params.length}`); }
    if (tipo)    { params.push(tipo);    conds.push(`tipo = $${params.length}`); }
    if (deporte) { params.push(deporte); conds.push(`deporte = $${params.length}`); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(Number(limit), offset);

    const { rows } = await db.query(
      `SELECT tipo, fecha, concepto, contraparte, deporte, equipo_categoria,
              importe, referencia, origen
         FROM v_libro_caja ${where}
         ORDER BY fecha DESC NULLS LAST
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ filas: rows, page: Number(page), limit: Number(limit) });
  } catch (e) {
    console.error('[movimientos] GET /libro-caja', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/movimientos/resumen/:tipo — vistas de resumen
router.get('/resumen/:tipo', async (req, res) => {
  try {
    const vistas = {
      deporte:  'v_resumen_deporte',
      concepto: 'v_resumen_concepto',
      equipo:   'v_resumen_equipo',
    };
    const vista = vistas[req.params.tipo];
    if (!vista) {
      return res.status(400).json({ error: 'Tipo de resumen no valido (usar: deporte | concepto | equipo)' });
    }
    const { rows } = await db.query(`SELECT * FROM ${vista}`);
    res.json({ resumen: rows });
  } catch (e) {
    console.error('[movimientos] GET /resumen/:tipo', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/movimientos — alta de gasto/ingreso manual
router.post('/', async (req, res) => {
  try {
    const { tipo, concepto, importe, fecha, referencia } = req.body;

    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
    }
    if (!concepto || !String(concepto).trim()) {
      return res.status(400).json({ error: 'concepto es obligatorio' });
    }
    if (importe == null || Number(importe) <= 0) {
      return res.status(400).json({ error: 'importe debe ser un número positivo' });
    }
    if (!fecha) {
      return res.status(400).json({ error: 'fecha es obligatoria (YYYY-MM-DD)' });
    }

    // Regla #6 CLAUDE.md: adelantos del presidente siempre con es_tesoreria=true
    const esTesoreria = (tipo === 'adelanto_presidente');

    const { rows: [m] } = await db.query(
      `INSERT INTO movimientos (tipo, concepto, importe, es_tesoreria, fecha, referencia)
       VALUES ($1, $2, $3, $4, $5::date, $6)
       RETURNING id, tipo, concepto, importe, es_tesoreria, fecha, referencia, created_at`,
      [tipo, String(concepto).trim(), Number(importe), esTesoreria, fecha, referencia || null]
    );
    res.status(201).json(m);
  } catch (e) {
    console.error('[movimientos] POST /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/movimientos/:id — modificar un movimiento
router.patch('/:id', async (req, res) => {
  try {
    const { tipo, concepto, importe, fecha, referencia } = req.body;

    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_VALIDOS.join(', ')}` });
    }

    // Si cambia a/de adelanto_presidente, recalcular es_tesoreria
    const esTesoreria = tipo ? (tipo === 'adelanto_presidente') : null;

    const { rows: [m] } = await db.query(
      `UPDATE movimientos SET
         tipo         = COALESCE($1, tipo),
         concepto     = COALESCE($2, concepto),
         importe      = COALESCE($3, importe),
         es_tesoreria = COALESCE($4, es_tesoreria),
         fecha        = COALESCE($5::date, fecha),
         referencia   = COALESCE($6, referencia)
       WHERE id = $7
       RETURNING id, tipo, concepto, importe, es_tesoreria, fecha, referencia, created_at`,
      [tipo || null, concepto || null,
       importe != null ? Number(importe) : null,
       esTesoreria, fecha || null, referencia || null, req.params.id]
    );
    if (!m) return res.status(404).json({ error: 'Movimiento no encontrado.' });
    res.json(m);
  } catch (e) {
    console.error('[movimientos] PATCH /:id', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/movimientos/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM movimientos WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Movimiento no encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[movimientos] DELETE /:id', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;