const express = require('express');
const pool    = require('../db');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

// ─── SECCIONES ───────────────────────────────────────────────────────────────

router.get('/secciones', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM secciones ORDER BY nombre'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar secciones' });
  }
});

router.post('/secciones', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { nombre, activo = true } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

    const result = await pool.query(
      'INSERT INTO secciones (nombre, activo) VALUES ($1,$2) RETURNING *',
      [nombre, activo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.constraint === 'secciones_nombre_key') return res.status(409).json({ error: 'Sección ya existe' });
    res.status(500).json({ error: 'Error al crear sección' });
  }
});

router.put('/secciones/:id', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { nombre, activo } = req.body;
    const result = await pool.query(
      'UPDATE secciones SET nombre=$1, activo=$2 WHERE id=$3 RETURNING *',
      [nombre, activo, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Sección no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar sección' });
  }
});

// ─── EQUIPOS ─────────────────────────────────────────────────────────────────

router.get('/equipos', requireAuth, async (req, res) => {
  try {
    const { seccion_id } = req.query;
    const params = [];
    const where  = seccion_id
      ? `WHERE e.seccion_id = $${params.push(Number(seccion_id))}`
      : '';

    const result = await pool.query(
      `SELECT e.*, s.nombre AS seccion_nombre
       FROM equipos e
       JOIN secciones s ON s.id = e.seccion_id
       ${where}
       ORDER BY s.nombre, e.nombre`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar equipos' });
  }
});

router.post('/equipos', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { seccion_id, nombre, categoria, activo = true } = req.body;
    if (!seccion_id || !nombre) {
      return res.status(400).json({ error: 'seccion_id y nombre son obligatorios' });
    }

    const result = await pool.query(
      'INSERT INTO equipos (seccion_id, nombre, categoria, activo) VALUES ($1,$2,$3,$4) RETURNING *',
      [seccion_id, nombre, categoria || null, activo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.constraint === 'equipos_seccion_id_nombre_key') return res.status(409).json({ error: 'Equipo ya existe en esa sección' });
    res.status(500).json({ error: 'Error al crear equipo' });
  }
});

router.put('/equipos/:id', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { nombre, categoria, activo } = req.body;
    const result = await pool.query(
      'UPDATE equipos SET nombre=$1, categoria=$2, activo=$3 WHERE id=$4 RETURNING *',
      [nombre, categoria || null, activo, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Equipo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar equipo' });
  }
});

// ─── DISCIPLINAS ─────────────────────────────────────────────────────────────

router.get('/disciplinas', requireAuth, async (req, res) => {
  try {
    const { seccion_id } = req.query;
    const params = [];
    const where  = seccion_id
      ? `WHERE d.seccion_id = $${params.push(Number(seccion_id))}`
      : '';

    const result = await pool.query(
      `SELECT d.*, s.nombre AS seccion_nombre
       FROM disciplinas d
       JOIN secciones s ON s.id = d.seccion_id
       ${where}
       ORDER BY d.nombre`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar disciplinas' });
  }
});

router.post('/disciplinas', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { seccion_id, nombre, precio_cuota_anual = 0, descripcion, activo = true } = req.body;
    if (!seccion_id || !nombre) {
      return res.status(400).json({ error: 'seccion_id y nombre son obligatorios' });
    }

    const result = await pool.query(
      `INSERT INTO disciplinas (seccion_id, nombre, precio_cuota_anual, descripcion, activo)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [seccion_id, nombre, precio_cuota_anual, descripcion || null, activo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear disciplina' });
  }
});

router.put('/disciplinas/:id', requireAuth, requireRol('admin'), async (req, res) => {
  try {
    const { nombre, precio_cuota_anual, descripcion, activo } = req.body;
    const result = await pool.query(
      `UPDATE disciplinas SET nombre=$1, precio_cuota_anual=$2, descripcion=$3, activo=$4
       WHERE id=$5 RETURNING *`,
      [nombre, precio_cuota_anual, descripcion || null, activo, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Disciplina no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar disciplina' });
  }
});

module.exports = router;
