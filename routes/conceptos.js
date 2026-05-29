'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/conceptos?categoria=
router.get('/', async (req, res) => {
  try {
    const cat = req.query.categoria;
    const params = [];
    let where = '';
    if (cat) { params.push(cat); where = `WHERE categoria = $${params.length}`; }
    const { rows } = await pool.query(
      `SELECT id, nombre, categoria, notas, updated_at FROM conceptos ${where} ORDER BY LOWER(nombre)`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error('[conceptos] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/conceptos { nombre, categoria?, notas? }
router.post('/', async (req, res) => {
  try {
    const { nombre, categoria = null, notas = null } = req.body || {};
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre es obligatorio' });
    if (categoria && !['gasto','ingreso','banco'].includes(categoria))
      return res.status(400).json({ error: 'categoria invalida' });
    const { rows } = await pool.query(
      `INSERT INTO conceptos (nombre, categoria, notas) VALUES ($1, $2, $3)
       ON CONFLICT (nombre) DO UPDATE SET
         categoria = COALESCE(EXCLUDED.categoria, conceptos.categoria),
         notas     = COALESCE(EXCLUDED.notas, conceptos.notas),
         updated_at = NOW()
       RETURNING *`,
      [String(nombre).trim(), categoria, notas]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[conceptos] POST /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/conceptos/:id
router.patch('/:id', async (req, res) => {
  try {
    const { nombre, categoria, notas } = req.body || {};
    const sets = []; const vals = [];
    if (nombre    !== undefined) { vals.push(nombre);    sets.push(`nombre = $${vals.length}`); }
    if (categoria !== undefined) { vals.push(categoria); sets.push(`categoria = $${vals.length}`); }
    if (notas     !== undefined) { vals.push(notas);     sets.push(`notas = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE conceptos SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/conceptos/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM conceptos WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;