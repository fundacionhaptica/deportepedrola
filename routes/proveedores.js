const express = require('express');
const pool    = require('../db');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

// GET / — listar con búsqueda (para autocompletado del OCR)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, es_autobus } = req.query;
    const params = [];
    const conditions = [];

    if (search) {
      const like = `%${search}%`;
      conditions.push(`(nombre ILIKE $${params.push(like)} OR cif ILIKE $${params.push(like)})`);
    }

    if (es_autobus !== undefined) {
      conditions.push(`es_autobus = $${params.push(es_autobus === 'true')}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM proveedores ${where} ORDER BY nombre LIMIT 100`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar proveedores' });
  }
});

// GET /:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM proveedores WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener proveedor' });
  }
});

// POST /
router.post('/', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const { cif, nombre, direccion, email, telefono, es_autobus = false, notas } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

    const result = await pool.query(
      `INSERT INTO proveedores (cif, nombre, direccion, email, telefono, es_autobus, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cif || null, nombre, direccion || null, email || null, telefono || null, es_autobus, notas || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.constraint === 'proveedores_cif_key') return res.status(409).json({ error: 'CIF duplicado' });
    res.status(500).json({ error: 'Error al crear proveedor' });
  }
});

// PUT /:id
router.put('/:id', requireAuth, requireRol('admin', 'tesorero'), async (req, res) => {
  try {
    const { cif, nombre, direccion, email, telefono, es_autobus, notas } = req.body;
    const result = await pool.query(
      `UPDATE proveedores SET cif=$1, nombre=$2, direccion=$3, email=$4, telefono=$5,
       es_autobus=$6, notas=$7 WHERE id=$8 RETURNING *`,
      [cif || null, nombre, direccion || null, email || null, telefono || null,
       es_autobus, notas || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar proveedor' });
  }
});

module.exports = router;
