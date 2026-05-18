'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// CTE que normaliza importes: usa distribuciones si existen, si no la factura directa
const CTE_BASE = `
  WITH base AS (
    SELECT
      fd.deporte, fd.equipo_categoria, fd.concepto, fd.importe,
      f.tipo, f.proveedor, f.fecha_factura
    FROM factura_distribuciones fd
    JOIN facturas f ON f.id = fd.factura_id
    WHERE f.fecha_factura BETWEEN $1 AND $2

    UNION ALL

    SELECT
      f.deporte, f.equipo_categoria, f.concepto, f.importe,
      f.tipo, f.proveedor, f.fecha_factura
    FROM facturas f
    WHERE f.fecha_factura BETWEEN $1 AND $2
      AND NOT EXISTS (
        SELECT 1 FROM factura_distribuciones fd2 WHERE fd2.factura_id = f.id
      )
  )
`;

// GET /api/gastos/resumen?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get('/resumen', async (req, res) => {
  const desde = req.query.desde || '1970-01-01';
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);

  try {
    const [totales, porDeporte, porTipo, porEquipo, porMes, topProveedores] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(importe), 0)                                     AS total_gastos,
          COUNT(*)                                                       AS num_facturas,
          COUNT(*) FILTER (WHERE ocr_revisado = false)                  AS pendientes_revision
        FROM facturas
        WHERE fecha_factura BETWEEN $1 AND $2
      `, [desde, hasta]),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(deporte), ''), 'Sin clasificar') AS deporte,
          SUM(importe) AS total
        FROM base
        GROUP BY deporte
        ORDER BY total DESC
      `, [desde, hasta]),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(tipo), ''), 'Sin tipo') AS tipo,
          SUM(importe) AS total
        FROM base
        GROUP BY tipo
        ORDER BY total DESC
        LIMIT 20
      `, [desde, hasta]),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(equipo_categoria), ''), 'Sin equipo') AS equipo_categoria,
          SUM(importe) AS total
        FROM base
        GROUP BY equipo_categoria
        ORDER BY total DESC
        LIMIT 20
      `, [desde, hasta]),

      pool.query(`
        SELECT
          TO_CHAR(fecha_factura, 'YYYY-MM') AS mes,
          SUM(importe) AS total,
          COUNT(*)     AS num_facturas
        FROM facturas
        WHERE fecha_factura BETWEEN $1 AND $2
        GROUP BY mes
        ORDER BY mes
      `, [desde, hasta]),

      pool.query(`
        SELECT
          proveedor,
          SUM(importe)  AS total,
          COUNT(*)      AS num_facturas
        FROM facturas
        WHERE fecha_factura BETWEEN $1 AND $2
          AND proveedor IS NOT NULL AND TRIM(proveedor) != ''
        GROUP BY proveedor
        ORDER BY total DESC
        LIMIT 10
      `, [desde, hasta]),
    ]);

    res.json({
      totales:         totales.rows[0],
      por_deporte:     porDeporte.rows,
      por_tipo:        porTipo.rows,
      por_equipo:      porEquipo.rows,
      por_mes:         porMes.rows,
      top_proveedores: topProveedores.rows,
    });
  } catch (err) {
    console.error('[gastos-dashboard]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
