'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// GET /api/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Devuelve el resumen general que se muestra en la home del panel admin/junta.
// Suma de v_libro_caja (facturas + movimientos manuales + pagos Stripe pagados)
// con importes en valor absoluto y agrupado por tipo (gasto/ingreso/adelanto).
router.get('/', async (req, res) => {
  const desde = req.query.desde || '1970-01-01';
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

  try {
    const [socios, balance, recientes, contadores] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM socios WHERE activo = true'),
      pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN importe END), 0) AS ingresos,
          COALESCE(SUM(CASE WHEN tipo = 'gasto'   THEN importe END), 0) AS gastos
        FROM v_libro_caja
        WHERE fecha BETWEEN $1 AND $2
      `, [desde, hasta]),
      pool.query(`
        SELECT tipo, fecha, concepto, contraparte, importe
        FROM v_libro_caja
        WHERE fecha BETWEEN $1 AND $2
        ORDER BY fecha DESC NULLS LAST
        LIMIT 10
      `, [desde, hasta]),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM facturas) AS facturas,
          (SELECT COUNT(*) FROM facturas WHERE ocr_revisado = false) AS facturas_pendientes,
          (SELECT COUNT(*) FROM factura_distribuciones) AS distribuciones,
          (SELECT COUNT(*) FROM movimientos WHERE es_tesoreria = false) AS movimientos_manuales,
          (SELECT COUNT(*) FROM pagos WHERE estado = 'pagado') AS pagos_stripe
      `),
    ]);

    const ingresos = parseFloat(balance.rows[0].ingresos);
    const gastos   = parseFloat(balance.rows[0].gastos);

    res.json({
      socios_activos:  parseInt(socios.rows[0].count, 10),
      rango: { desde, hasta },
      ingresos,
      gastos,
      saldo:           Math.round((ingresos - gastos) * 100) / 100,
      movimientos_recientes: recientes.rows,
      contadores: contadores.rows[0],
    });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;