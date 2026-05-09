'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/', async (req, res) => {
  const desde = req.query.desde || '1970-01-01';
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

  try {
    const [socios, balance, recientes] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM socios WHERE activo = true'),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe END), 0) AS ingresos,
          COALESCE(SUM(CASE WHEN tipo = 'gasto'   THEN importe END), 0) AS gastos
        FROM movimientos
        WHERE es_tesoreria = false
          AND fecha BETWEEN $1 AND $2
      `, [desde, hasta]),
      pool.query(`
        SELECT id, concepto, importe, estado, fecha
        FROM pagos
        ORDER BY created_at DESC
        LIMIT 10
      `),
    ]);

    const ingresos = parseFloat(balance.rows[0].ingresos);
    const gastos   = parseFloat(balance.rows[0].gastos);

    res.json({
      socios_activos:  parseInt(socios.rows[0].count, 10),
      ingresos,
      gastos,
      saldo:           ingresos - gastos,
      pagos_recientes: recientes.rows,
    });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
