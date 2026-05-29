'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/proveedores?q=
router.get('/', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push('%' + q + '%');
      where = `WHERE p.nombre ILIKE $${params.length} OR p.nif ILIKE $${params.length} OR p.email ILIKE $${params.length}`;
    }
    const { rows } = await pool.query(`
      SELECT p.id, p.nombre, p.nif, p.direccion, p.email, p.telefono, p.notas,
             p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM facturas f WHERE f.proveedor_id = p.id) AS num_facturas,
             (SELECT COALESCE(SUM(importe),0) FROM facturas f WHERE f.proveedor_id = p.id AND f.tipo='factura') AS total_facturado
      FROM proveedores p
      ${where}
      ORDER BY LOWER(p.nombre)
      LIMIT 500
    `, params);
    res.json(rows);
  } catch (e) {
    console.error('[proveedores] GET /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/proveedores/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM proveedores WHERE id = $1', [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/proveedores
router.post('/', async (req, res) => {
  try {
    const { nombre, nif = null, direccion = null, email = null, telefono = null, notas = null } = req.body;
    if (!nombre || !String(nombre).trim()) return res.status(400).json({ error: 'nombre es obligatorio' });
    const { rows } = await pool.query(`
      INSERT INTO proveedores (nombre, nif, direccion, email, telefono, notas)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (nombre) DO UPDATE
        SET nif       = COALESCE(EXCLUDED.nif, proveedores.nif),
            direccion = COALESCE(EXCLUDED.direccion, proveedores.direccion),
            email     = COALESCE(EXCLUDED.email, proveedores.email),
            telefono  = COALESCE(EXCLUDED.telefono, proveedores.telefono),
            notas     = COALESCE(EXCLUDED.notas, proveedores.notas),
            updated_at = NOW()
      RETURNING *
    `, [String(nombre).trim(), nif, direccion, email, telefono, notas]);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[proveedores] POST /', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PATCH /api/proveedores/:id
router.patch('/:id', async (req, res) => {
  try {
    const { nombre, nif, direccion, email, telefono, notas } = req.body;
    const sets = [], vals = [];
    if (nombre   !== undefined) { vals.push(nombre);   sets.push(`nombre = $${vals.length}`); }
    if (nif      !== undefined) { vals.push(nif);      sets.push(`nif = $${vals.length}`); }
    if (direccion!== undefined) { vals.push(direccion);sets.push(`direccion = $${vals.length}`); }
    if (email    !== undefined) { vals.push(email);    sets.push(`email = $${vals.length}`); }
    if (telefono !== undefined) { vals.push(telefono); sets.push(`telefono = $${vals.length}`); }
    if (notas    !== undefined) { vals.push(notas);    sets.push(`notas = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Sin cambios' });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE proveedores SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error('[proveedores] PATCH /:id', e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/proveedores/:id
router.delete('/:id', async (req, res) => {
  try {
    // Comprobar si hay facturas
    const { rows: ref } = await pool.query(
      'SELECT COUNT(*) AS n FROM facturas WHERE proveedor_id = $1', [req.params.id]
    );
    if (Number(ref[0].n) > 0) {
      return res.status(409).json({ error: `Tiene ${ref[0].n} facturas vinculadas. Desvíncula primero.` });
    }
    const { rowCount } = await pool.query('DELETE FROM proveedores WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'No encontrado' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;