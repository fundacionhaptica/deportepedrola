'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, seccion, rol, activo, created_at FROM socios ORDER BY nombre'
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { nombre, email, seccion, rol } = req.body;
  if (!nombre || !email) {
    return res.status(400).json({ error: 'nombre y email son obligatorios' });
  }
  const rolFinal = ['socio', 'junta', 'admin'].includes(rol) ? rol : 'socio';
  try {
    const { rows } = await pool.query(
      `INSERT INTO socios (nombre, email, seccion, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, seccion, rol, activo, created_at`,
      [nombre.trim(), email.trim().toLowerCase(), seccion || null, rolFinal]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un socio con ese email' });
    }
    throw err;
  }
});

router.post('/importar', async (req, res) => {
  const { socios } = req.body;
  if (!Array.isArray(socios) || socios.length === 0) {
    return res.status(400).json({ error: 'Se esperaba un array de socios' });
  }
  const resultados = { insertados: 0, duplicados: 0, errores: [] };
  for (const s of socios) {
    const { nombre, email, seccion, rol } = s;
    if (!nombre || !email) {
      resultados.errores.push({ email, motivo: 'nombre o email vacío' });
      continue;
    }
    const rolFinal = ['socio', 'junta', 'admin'].includes(rol) ? rol : 'socio';
    try {
      await pool.query(
        `INSERT INTO socios (nombre, email, seccion, rol)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [nombre.trim(), email.trim().toLowerCase(), seccion || null, rolFinal]
      );
      resultados.insertados++;
    } catch {
      resultados.duplicados++;
    }
  }
  res.json(resultados);
});

router.patch('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nombre, email, seccion, rol, activo } = req.body;
  const campos = [];
  const vals   = [];
  if (nombre  !== undefined) { campos.push(`nombre=$${vals.push(nombre.trim())}`); }
  if (email   !== undefined) { campos.push(`email=$${vals.push(email.trim().toLowerCase())}`); }
  if (seccion !== undefined) { campos.push(`seccion=$${vals.push(seccion || null)}`); }
  if (rol     !== undefined && ['socio','junta','admin'].includes(rol)) {
    campos.push(`rol=$${vals.push(rol)}`);
  }
  if (activo  !== undefined) { campos.push(`activo=$${vals.push(Boolean(activo))}`); }

  if (campos.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  vals.push(id);
  const { rows } = await pool.query(
    `UPDATE socios SET ${campos.join(', ')} WHERE id=$${vals.length}
     RETURNING id, nombre, email, seccion, rol, activo`,
    vals
  );
  if (!rows.length) return res.status(404).json({ error: 'Socio no encontrado' });
  res.json(rows[0]);
});

module.exports = router;
