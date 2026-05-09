const express = require('express');
const pool    = require('../db');
const { requireAuth, requireRol } = require('../middleware/auth');

const router = express.Router();

const proteger = [requireAuth, requireRol('admin', 'tesorero')];

function dateFilters(desde, hasta, tabla = 'fecha') {
  const params = [];
  const conditions = [];
  if (desde) conditions.push(`${tabla} >= $${params.push(desde)}`);
  if (hasta) conditions.push(`${tabla} <= $${params.push(hasta)}`);
  return { params, conditions };
}

// GET /gasto-por-seccion
router.get('/gasto-por-seccion', proteger, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { params, conditions } = dateFilters(desde, hasta, 'f.fecha');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT s.id AS seccion_id, s.nombre AS seccion,
              COALESCE(SUM(fl.total), 0) AS total_gasto
       FROM secciones s
       LEFT JOIN facturas_lineas fl ON fl.seccion_id = s.id
       LEFT JOIN facturas f ON f.id = fl.factura_id
       ${where}
       GROUP BY s.id, s.nombre
       ORDER BY total_gasto DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe gasto-por-seccion' });
  }
});

// GET /gasto-por-equipo
router.get('/gasto-por-equipo', proteger, async (req, res) => {
  try {
    const { desde, hasta, seccion_id } = req.query;
    const { params, conditions } = dateFilters(desde, hasta, 'f.fecha');
    if (seccion_id) conditions.push(`e.seccion_id = $${params.push(Number(seccion_id))}`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT e.id AS equipo_id, e.nombre AS equipo, sec.nombre AS seccion,
              COALESCE(SUM(fl.total), 0) AS total_gasto
       FROM equipos e
       JOIN secciones sec ON sec.id = e.seccion_id
       LEFT JOIN facturas_lineas fl ON fl.equipo_id = e.id
       LEFT JOIN facturas f ON f.id = fl.factura_id
       ${where}
       GROUP BY e.id, e.nombre, sec.nombre
       ORDER BY total_gasto DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe gasto-por-equipo' });
  }
});

// GET /gasto-por-proveedor
router.get('/gasto-por-proveedor', proteger, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { params, conditions } = dateFilters(desde, hasta, 'f.fecha');
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT p.id AS proveedor_id, p.nombre AS proveedor,
              COUNT(DISTINCT f.id) AS num_facturas,
              COALESCE(SUM(f.total), 0) AS total_gasto
       FROM proveedores p
       LEFT JOIN facturas f ON f.proveedor_id = p.id
       ${where}
       GROUP BY p.id, p.nombre
       ORDER BY total_gasto DESC
       LIMIT 30`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe gasto-por-proveedor' });
  }
});

// GET /balance-mensual
router.get('/balance-mensual', proteger, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const params = [];
    const factConditions = [];
    const ingConditions  = ['i.es_tesoreria = FALSE OR i.es_tesoreria IS NULL'];

    if (desde) {
      factConditions.push(`f.fecha >= $${params.push(desde)}`);
      ingConditions.push(`i.fecha >= $${params.push(desde)}`);
    }
    if (hasta) {
      factConditions.push(`f.fecha <= $${params.push(hasta)}`);
      ingConditions.push(`i.fecha <= $${params.push(hasta)}`);
    }

    const factWhere = factConditions.length ? `WHERE ${factConditions.join(' AND ')}` : '';
    const ingWhere  = `WHERE ${ingConditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT mes,
              COALESCE(SUM(gastos),   0) AS gastos,
              COALESCE(SUM(ingresos), 0) AS ingresos,
              COALESCE(SUM(ingresos), 0) - COALESCE(SUM(gastos), 0) AS neto
       FROM (
         SELECT DATE_TRUNC('month', f.fecha) AS mes,
                SUM(f.total)   AS gastos,
                0::NUMERIC     AS ingresos
         FROM facturas f
         ${factWhere}
         WHERE f.fecha IS NOT NULL
         GROUP BY DATE_TRUNC('month', f.fecha)

         UNION ALL

         SELECT DATE_TRUNC('month', i.fecha) AS mes,
                0::NUMERIC     AS gastos,
                SUM(i.importe) AS ingresos
         FROM ingresos i
         ${ingWhere}
         GROUP BY DATE_TRUNC('month', i.fecha)
       ) sub
       GROUP BY mes
       ORDER BY mes`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe balance-mensual' });
  }
});

// GET /ingresos-por-tipo
router.get('/ingresos-por-tipo', proteger, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { params, conditions } = dateFilters(desde, hasta, 'fecha');
    conditions.push('(es_tesoreria = FALSE OR es_tesoreria IS NULL)');
    const where = `WHERE ${conditions.join(' AND ')}`;

    const result = await pool.query(
      `SELECT tipo,
              COUNT(*)       AS num_operaciones,
              SUM(importe)   AS total
       FROM ingresos
       ${where}
       GROUP BY tipo
       ORDER BY total DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe ingresos-por-tipo' });
  }
});

// GET /adelantos-presidente
router.get('/adelantos-presidente', proteger, async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const { params, conditions } = dateFilters(desde, hasta, 'fecha');
    conditions.push("tipo = 'adelanto_presidente'");
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [listaRes, totalRes] = await Promise.all([
      pool.query(
        `SELECT * FROM ingresos ${where} ORDER BY fecha DESC`,
        params
      ),
      pool.query(
        `SELECT COALESCE(SUM(importe), 0) AS total FROM ingresos ${where}`,
        params
      ),
    ]);

    res.json({
      adelantos: listaRes.rows,
      total: totalRes.rows[0].total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en informe adelantos-presidente' });
  }
});

module.exports = router;
