'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM pagos ORDER BY created_at DESC LIMIT 50'
  );
  res.json(rows);
});

module.exports = router;
