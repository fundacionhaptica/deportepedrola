'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, seccion, rol, activo FROM socios ORDER BY nombre'
  );
  res.json(rows);
});

module.exports = router;
