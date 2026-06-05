'use strict';

const router = require('express').Router();
const pool   = require('../db/pool');

// Siempre 4 parametros: $1=desde $2=hasta $3=filtDeporte|null $4=filtConcepto|null
// En distribuciones, si fd.concepto es NULL usamos f.concepto como fallback.
const CTE_BASE = `
  WITH base AS (
    SELECT
      COALESCE(fd.deporte, f.deporte)                     AS deporte,
      COALESCE(fd.equipo_categoria, f.equipo_categoria)   AS equipo_categoria,
      COALESCE(fd.concepto, f.concepto)                   AS concepto,
      fd.importe,
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

// Filtro sobre la vista base (para graficos de distribucion)
const FILTRO_BASE = `
  ($3::text IS NULL OR COALESCE(NULLIF(TRIM(deporte),''),'Sin clasificar') = $3)
  AND ($4::text IS NULL OR COALESCE(NULLIF(TRIM(concepto),''),'Sin concepto') = $4)
`;

// Filtro sobre facturas directas (para totales, mensual, top proveedores)
// Solo cuenta facturas de gasto (factura_recibo) para el dashboard de gastos
const FILTRO_FACTURAS = `
  f.tipo = 'factura_recibo'
  AND ($3::text IS NULL OR f.deporte = $3
     OR EXISTS (SELECT 1 FROM factura_distribuciones fd WHERE fd.factura_id = f.id AND fd.deporte = $3))
  AND ($4::text IS NULL OR f.concepto = $4
     OR EXISTS (SELECT 1 FROM factura_distribuciones fd WHERE fd.factura_id = f.id
                AND COALESCE(fd.concepto, f.concepto) = $4))
`;

// GET /api/gastos/resumen
router.get('/resumen', async (req, res) => {
  const desde      = req.query.desde      || '1970-01-01';
  const hasta      = req.query.hasta      || new Date().toISOString().slice(0, 10);
  const desdeAnt   = req.query.desde_ant  || null;
  const hastaAnt   = req.query.hasta_ant  || null;
  const filtDep    = req.query.deporte    || null;
  const filtConc   = req.query.concepto   || null;

  const p = [desde, hasta, filtDep, filtConc];

  try {
    const [totales, porDeporte, porConcepto, porEquipo, porMes, topProveedores] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(SUM(importe), 0)                              AS total_gastos,
          COUNT(*)                                               AS num_facturas,
          COUNT(*) FILTER (WHERE ocr_revisado = false)           AS pendientes_revision
        FROM facturas f
        WHERE f.fecha_factura BETWEEN $1 AND $2
          AND ${FILTRO_FACTURAS}
      `, p),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(deporte), ''), 'Sin clasificar') AS deporte,
          SUM(importe) AS total
        FROM base
        WHERE ${FILTRO_BASE}
          AND tipo = 'factura_recibo'
        GROUP BY deporte
        ORDER BY total DESC
      `, p),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(concepto), ''), 'Sin concepto') AS concepto,
          SUM(importe) AS total
        FROM base
        WHERE ${FILTRO_BASE}
          AND tipo = 'factura_recibo'
        GROUP BY concepto
        ORDER BY total DESC
        LIMIT 20
      `, p),

      pool.query(`${CTE_BASE}
        SELECT
          COALESCE(NULLIF(TRIM(equipo_categoria), ''), 'Sin equipo') AS equipo_categoria,
          SUM(importe) AS total
        FROM base
        WHERE ${FILTRO_BASE}
          AND tipo = 'factura_recibo'
        GROUP BY equipo_categoria
        ORDER BY total DESC
        LIMIT 20
      `, p),

      pool.query(`
        SELECT
          TO_CHAR(fecha_factura, 'YYYY-MM') AS mes,
          SUM(importe) AS total,
          COUNT(*)     AS num_facturas
        FROM facturas f
        WHERE f.fecha_factura BETWEEN $1 AND $2
          AND ${FILTRO_FACTURAS}
        GROUP BY mes
        ORDER BY mes
      `, p),

      pool.query(`
        SELECT
          COALESCE(NULLIF(TRIM(proveedor),''), 'Sin proveedor') AS proveedor,
          SUM(importe)  AS total,
          COUNT(*)      AS num_facturas
        FROM facturas f
        WHERE f.fecha_factura BETWEEN $1 AND $2
          AND proveedor IS NOT NULL AND TRIM(proveedor) != ''
          AND ${FILTRO_FACTURAS}
        GROUP BY proveedor
        ORDER BY total DESC
        LIMIT 10
      `, p),
    ]);

    let comparativa = null;
    if (desdeAnt && hastaAnt) {
      const pAnt = [desdeAnt, hastaAnt, filtDep, filtConc];
      const comp = await pool.query(`
        SELECT
          COALESCE(SUM(importe), 0) AS total_gastos,
          COUNT(*)                  AS num_facturas
        FROM facturas f
        WHERE f.fecha_factura BETWEEN $1 AND $2
          AND ${FILTRO_FACTURAS}
      `, pAnt);
      comparativa = comp.rows[0];
    }

    res.json({
      totales:         totales.rows[0],
      por_deporte:     porDeporte.rows,
      por_concepto:    porConcepto.rows,
      por_equipo:      porEquipo.rows,
      por_mes:         porMes.rows,
      top_proveedores: topProveedores.rows,
      comparativa,
    });
  } catch (err) {
    console.error('[gastos-dashboard]', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;